#!/usr/bin/env node
// Capacitor + SvelteKit 하이브리드 앱 정적 보안 점검. 의존성 없음.
// 사용법: node audit.mjs [projectDir] [--json]
// 종료 코드: critical/high가 하나라도 있으면 1, 없으면 0, 실행 오류는 2.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// android/app/build, ios/App/Pods, android/.gradle 같은 생성물도 이름으로 건너뛴다.
const SKIP_DIRS = new Set(["node_modules", "build", ".svelte-kit", "dist", ".git", "Pods", ".gradle", "DerivedData", "target", "coverage"]);
const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

// android/·ios/ 는 설정 파일만 본다(cap sync가 복사한 웹 번들 public/ 등은 제외).
const NATIVE_CONFIG = /^(android|ios)\/.*(AndroidManifest\.xml|\/res\/xml\/[^/]+\.xml|Info\.plist|capacitor\.config\.json)$/;
const TEXT_FILE = /\.(ts|mts|js|mjs|cjs|svelte|html|json|ya?ml|xml|plist|properties|gradle|kts|toml|pem|key|p8)$|(^|\/)\.env[^/]*$/;
const SRC_CODE = /^src\/.*\.(ts|js|mjs|svelte)$/;

const SECRET_LITERAL =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\b[sr]k_live_[0-9A-Za-z]{16,}|\bghp_[0-9A-Za-z]{36}\b|\bgithub_pat_\w{40,}|\bxox[abprs]-[0-9A-Za-z-]{10,}|\bsb_secret_[\w-]{16,}/;
// script-src 지시문(meta 문자열 또는 kit.csp 배열) 안의 'unsafe-eval'('wasm-unsafe-eval' 제외)·'unsafe-inline'
const UNSAFE_SCRIPT_SRC = /script-src(?:["']\s*:\s*\[[^\]]*?|[^;"\]\n]*?)(?<!wasm-)unsafe-(?:eval|inline)/;

function walk(dir, root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), root, out);
    } else out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
  }
  return out;
}

// 주석 줄은 빈 줄로 바꿔 줄 번호를 유지하고, 줄 끝 `// …` 주석은 지운다(`https://`의 `//`는 남김).
function stripComments(src, file) {
  const hashComments = /\.(ya?ml|properties|toml)$|(^|\/)\.env/.test(file);
  return src
    .split(/\r?\n/)
    .map((l) => (/^\s*(\/\/|\/\*|\*|<!--)/.test(l) || (hashComments && /^\s*#/.test(l)) ? "" : l.replace(/(^|[^:])\/\/.*$/, "$1")))
    .join("\n");
}

const hits = (text, re) =>
  [...text.matchAll(new RegExp(re.source, re.flags.replace("g", "") + "g"))].map((m) => text.slice(0, m.index).split("\n").length);

export function audit(root) {
  const files = walk(root, root).filter((f) => !/^(android|ios)\//.test(f) || NATIVE_CONFIG.test(f));
  const has = (f) => files.includes(f);
  const cache = new Map();
  const code = (f) => {
    if (!cache.has(f)) cache.set(f, stripComments(fs.readFileSync(path.join(root, f), "utf8"), f));
    return cache.get(f);
  };
  const findings = [];
  const add = (severity, rule, file, line, message) => findings.push({ severity, rule, file, line, message });
  const check = (list, re, severity, rule, message) => {
    for (const f of list) for (const line of hits(code(f), re)) add(severity, rule, f, line, message);
  };

  const textFiles = files.filter((f) => TEXT_FILE.test(f));
  const committed = textFiles.filter((f) => !/(^|\/)\.env(\..*)?\.local$/.test(f) && f !== "package-lock.json");
  const capConfigs = files.filter((f) => /(^|\/)capacitor\.config\.(ts|mts|js|mjs|cjs|json)$/.test(f));
  const srcCode = files.filter((f) => SRC_CODE.test(f));
  const outsideNative = srcCode.filter((f) => !f.startsWith("src/lib/native/"));
  const manifests = files.filter((f) => /^android\/.*AndroidManifest\.xml$/.test(f));
  const androidXml = files.filter((f) => /^android\/.*\.xml$/.test(f));
  const plists = files.filter((f) => /^ios\/.*Info\.plist$/.test(f));

  // critical
  check(capConfigs, /\bserver["']?\s*:\s*\{[^}]*\burl["']?\s*:/, "critical", "remote-server-url",
    "server.url로 원격 URL을 웹뷰에 로드합니다. 운영 빌드에서는 빼고 웹 리소스를 앱 번들에 넣으세요(3.1).");
  check(committed, SECRET_LITERAL, "critical", "hardcoded-secret",
    "비밀 키·개인키가 커밋 대상 파일에 있습니다. 즉시 폐기(rotate)하고 서버·CI 비밀로 옮기세요.");
  check(textFiles, /\bVITE_\w*(SECRET|PRIVATE|PASSWORD|SERVICE_ROLE)\w*/, "critical", "public-secret-env",
    "VITE_ 변수는 JS 번들에 그대로 들어갑니다. 비밀은 앱에 두지 말고 서버로 옮기세요(8.3).");

  // high
  check(outsideNative, /(?:\bfrom|\bimport)\s*\(?\s*["'](?:@capacitor|@aparajita)\//, "high", "native-import-outside-adapter",
    "src/lib/native/ 밖에서 네이티브 플러그인을 직접 import합니다. native 어댑터를 거치세요(7.1).");
  check(capConfigs, /webContentsDebuggingEnabled["']?\s*:\s*true/, "high", "webview-debugging",
    "웹뷰 디버깅이 켜져 있습니다. 운영 빌드에서는 false로 두세요(8.1).");
  check(capConfigs, /allowMixedContent["']?\s*:\s*true/, "high", "mixed-content", "allowMixedContent: true는 HTTPS 페이지에서 HTTP 리소스를 허용합니다(8.2).");
  check([...capConfigs, ...androidXml], /\bcleartext["']?\s*:\s*true|cleartextTrafficPermitted\s*=\s*"true"|usesCleartextTraffic\s*=\s*"true"/,
    "high", "cleartext-traffic", "평문 HTTP 통신을 허용합니다. HTTPS만 쓰세요(8.2).");
  check(plists, /<key>NSAllowsArbitraryLoads(?:InWebContent|ForMedia)?<\/key>\s*<true\s*\/>/, "high", "ats-arbitrary-loads",
    "ATS를 끄고 있습니다. 기본값을 유지하세요(8.2).");

  const svelteConfig = files.find((f) => /^svelte\.config\.(js|mjs|ts)$/.test(f));
  const cspFiles = [svelteConfig, "src/app.html"].filter((f) => f && has(f));
  const hasCsp =
    (svelteConfig && /\bcsp\s*:/.test(code(svelteConfig))) ||
    (has("src/app.html") && /http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(code("src/app.html")));
  if (!hasCsp) add("high", "no-csp", svelteConfig ?? "src/app.html", 0, "CSP가 없습니다. svelte.config.js의 kit.csp 또는 app.html meta로 넣으세요(8.1).");
  check(cspFiles, UNSAFE_SCRIPT_SRC, "high", "unsafe-script-src", "script-src에 'unsafe-eval' 또는 'unsafe-inline'이 있습니다(8.1).");

  check(srcCode, /\b(?:localStorage|sessionStorage|indexedDB)\b/, "high", "web-storage",
    "웹 저장소를 씁니다. 토큰 등 민감 정보는 native.secureStorage에 두세요(8.3).");
  check(srcCode, /(?<![\w$])eval\s*\(|\bnew\s+Function\s*\(/, "high", "dynamic-code", "eval/new Function 사용 금지(8.1).");
  if (!has("package-lock.json")) add("high", "no-lockfile", "package-lock.json", 0, "package-lock.json이 없습니다. npm ci로 고정 설치하세요(8.7).");

  // medium
  check(srcCode.filter((f) => f.endsWith(".svelte")), /\{@html\s/, "medium", "html-tag", "{@html} 사용. 불가피하면 DOMPurify로 정제하세요(8.1).");
  if (fs.existsSync(path.join(root, "android")) && !manifests.some((f) => /android:networkSecurityConfig\s*=/.test(code(f)))) {
    add("medium", "no-network-security-config", manifests[0] ?? "android/app/src/main/AndroidManifest.xml", 0,
      "AndroidManifest에 android:networkSecurityConfig가 연결되지 않았습니다(8.2).");
  }
  check(manifests, /android:allowBackup\s*=\s*"true"/, "medium", "allow-backup", "allowBackup=\"true\"는 앱 데이터를 백업으로 빼낼 수 있게 합니다. false로 두세요.");
  check(plists, /<key>NSExceptionDomains<\/key>/, "medium", "ats-exception", "ATS 예외 도메인이 있습니다. 예외 없이 HTTPS만 쓰세요(8.2).");
  check(srcCode, /http:\/\/(?!(?:localhost|127\.0\.0\.1|www\.w3\.org)\b)/, "medium", "http-literal", "평문 http:// 주소입니다. https://로 바꾸세요(8.2).");
  const workflows = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  const ci = workflows.map(code).join("\n");
  const missingScans = ["npm audit", "osv-scanner"].filter((t) => !ci.includes(t));
  if (missingScans.length) add("medium", "no-dependency-scan", workflows[0] ?? ".github/workflows", 0, `CI에 ${missingScans.join(", ")}가 없습니다(8.7).`);
  check(outsideNative, /target\s*[=:]\s*["']_blank["']|\bwindow\.open\s*\(/, "medium", "external-link",
    "외부 링크를 웹뷰에서 엽니다. native.links.open으로 시스템 브라우저를 쓰세요(8.1).");

  // low
  if (!has("SECURITY.md") && !has(".github/SECURITY.md")) add("low", "no-security-md", "SECURITY.md", 0, "SECURITY.md(9장 런북 요약)가 없습니다.");
  check(plists, /<key>CFBundleURLSchemes<\/key>/, "low", "custom-url-scheme", "커스텀 URL 스킴 대신 Universal Links를 쓰세요(8.5).");
  check(manifests, /android:scheme\s*=\s*"(?!https?")[^"]*"/, "low", "custom-url-scheme", "커스텀 스킴 대신 App Links(https)를 쓰세요(8.5).");
  if (has("package.json")) {
    const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).dependencies ?? {});
    const nativeSrc = files.filter((f) => f.startsWith("src/lib/native/")).map(code).join("\n");
    for (const name of deps) {
      if (!/^@(capacitor|aparajita)\//.test(name) || /^@capacitor\/(core|cli|android|ios)$/.test(name)) continue;
      if (["'", '"'].some((q) => nativeSrc.includes(q + name + q) || nativeSrc.includes(q + name + "/"))) continue;
      const line = code("package.json").split("\n").findIndex((l) => l.includes(`"${name}"`)) + 1;
      add("low", "unused-plugin", "package.json", line, `${name}가 src/lib/native/에서 쓰이지 않습니다. 미사용 플러그인은 제거하세요(8.4).`);
    }
  }

  return findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.file.localeCompare(b.file) || a.line - b.line);
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const root = path.resolve(argv.find((a) => !a.startsWith("--")) ?? ".");
  if (!fs.existsSync(path.join(root, "package.json"))) throw new Error(`${root}는 Node 프로젝트가 아닙니다(package.json 없음).`);

  const findings = audit(root);
  const blocking = findings.filter((f) => f.severity === "critical" || f.severity === "high").length;

  if (json) console.log(JSON.stringify({ root, blocking, findings }, null, 2));
  else if (!findings.length) console.log("✔ 보안 점검 통과: 발견 사항 없음");
  else {
    for (const f of findings) console.log(`[${f.severity}] ${f.rule} ${f.file}${f.line ? `:${f.line}` : ""} — ${f.message}`);
    const counts = SEVERITY_ORDER.map((s) => `${s} ${findings.filter((f) => f.severity === s).length}`).join(", ");
    console.log(`\n${blocking ? "✘" : "⚠"} ${counts}`);
  }
  process.exitCode = blocking ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`✘ ${error.message}`);
    process.exitCode = 2;
  }
}
