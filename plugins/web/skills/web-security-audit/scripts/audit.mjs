#!/usr/bin/env node
// Next.js + Supabase 프로젝트 정적 보안 점검. 의존성 없음.
// 사용법: node audit.mjs [projectDir] [--json]
// 종료 코드: critical/high가 하나라도 있으면 1, 없으면 0, 실행 오류는 2.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "out", "coverage", ".vercel", ".turbo"]);
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

const PUBLIC_SECRET = /NEXT_PUBLIC_\w*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD)\w*/;
const SECRET_LITERAL = /sb_secret_[A-Za-z0-9_-]{16,}/;
const SECRET_ENV = /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/;
const AUTH_CALL = /requireUser\(|getClaims\(|getUser\(/;

function walk(dir, root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), root, out);
    } else out.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
  }
  return out;
}

const isCommentLine = (line) => /^\s*(\/\/|\/\*|\*|--)/.test(line);
const isClientFile = (src) => /^\s*["']use client["']/m.test(src.slice(0, 200));
const isServerActionFile = (src) => /^\s*["']use server["']/m.test(src.slice(0, 200));

export function audit(root) {
  const files = walk(root, root);
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const findings = [];
  const add = (severity, rule, file, line, message) => findings.push({ severity, rule, file, line, message });

  const codeFiles = files.filter((f) => CODE_EXT.test(f));
  const envFiles = files.filter((f) => /(^|\/)\.env[^/]*$/.test(f));
  const sqlFiles = files.filter((f) => f.startsWith("supabase/") && f.endsWith(".sql")).sort();

  // 코드·env 파일 줄 단위 검사
  for (const file of [...codeFiles, ...envFiles]) {
    const src = read(file);
    const localEnv = /\.env.*\.local$|\.env\.local$/.test(file);
    src.split(/\r?\n/).forEach((line, i) => {
      if (isCommentLine(line) || /^\s*#/.test(line)) return;
      if (PUBLIC_SECRET.test(line)) {
        add("critical", "public-secret-env", file, i + 1, `비밀 값이 NEXT_PUBLIC_ 변수로 노출됩니다: ${line.match(PUBLIC_SECRET)[0]}`);
      }
      if (!localEnv && SECRET_LITERAL.test(line)) {
        add("critical", "hardcoded-secret-key", file, i + 1, "Supabase secret 키가 커밋 대상 파일에 들어 있습니다. 키를 폐기(rotate)하고 .env.local로 옮기세요.");
      }
    });
  }

  for (const file of codeFiles) {
    const src = read(file);
    const lines = src.split(/\r?\n/);
    const client = isClientFile(src);
    const lineOf = (re) => lines.findIndex((l) => !isCommentLine(l) && re.test(l)) + 1;

    if (client) {
      const n = lineOf(/supabase\/admin|createAdminClient|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
      if (n) add("critical", "admin-in-client", file, n, "클라이언트 컴포넌트에서 secret 키 또는 admin 클라이언트를 사용합니다.");
    } else {
      const secretLine = lineOf(SECRET_ENV);
      if (secretLine && !/import\s+["']server-only["']/.test(src)) {
        add("high", "secret-without-server-only", file, secretLine, `secret 키를 읽는 파일에 import "server-only"가 없습니다.`);
      }
      const sessionLine = lineOf(/\.getSession\(/);
      if (sessionLine) add("high", "server-get-session", file, sessionLine, "서버 코드에서 getSession()을 씁니다. 쿠키 값은 위조될 수 있으니 getClaims()/getUser()로 확인하세요.");
    }

    if (/(^|\/)\(protected\)\/.*page\.(tsx|jsx|ts|js)$/.test(file)) {
      if (!AUTH_CALL.test(src)) add("high", "protected-page-no-auth", file, 1, "보호 페이지에서 requireUser()/getClaims() 호출이 없습니다.");
      if (!/dynamic\s*=\s*["']force-dynamic["']/.test(src)) add("medium", "protected-page-cacheable", file, 1, `보호 페이지에 export const dynamic = "force-dynamic"이 없습니다.`);
    }

    if (isServerActionFile(src) && !AUTH_CALL.test(src) && !/(^|\/)\(auth\)\//.test(file)) {
      add("medium", "server-action-no-auth", file, 1, "Server Action 파일에 인증 확인이 없습니다. 공개 액션이 의도된 것인지 확인하세요.");
    }

    const htmlLine = lineOf(/dangerouslySetInnerHTML/);
    if (htmlLine) add("medium", "dangerous-html", file, htmlLine, "dangerouslySetInnerHTML 사용. 입력을 sanitize했는지 확인하세요.");
  }

  // 마이그레이션 검사
  const allSql = sqlFiles.map(read).join("\n").toLowerCase();
  for (const file of sqlFiles) {
    const lines = read(file).split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.toLowerCase();
      if (isCommentLine(line)) return;
      const created = line.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/);
      if (created) {
        const rls = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?"?${created[1]}"?\\s+enable\\s+row\\s+level\\s+security`);
        if (!rls.test(allSql)) add("high", "table-without-rls", file, i + 1, `테이블 ${created[1]}에 RLS가 켜져 있지 않습니다.`);
      }
      if (/create\s+policy/.test(line) && /\bfor\s+all\b/.test(line)) add("medium", "policy-for-all", file, i + 1, "FOR ALL 정책입니다. select/insert/update/delete로 나누세요.");
      if (/(?<!select\s)auth\.uid\(\)/.test(line) && !/default\s+auth\.uid\(\)/.test(line)) {
        add("low", "uid-not-wrapped", file, i + 1, "auth.uid()를 (select auth.uid())로 감싸면 행마다 재평가하지 않습니다.");
      }
      if (/raw_user_meta_data|user_metadata/.test(line)) add("high", "user-metadata-authz", file, i + 1, "user_metadata는 사용자가 수정할 수 있어 인가에 쓰면 안 됩니다. app_metadata를 쓰세요.");
      if (/security\s+definer/.test(line)) {
        const window = lines.slice(Math.max(0, i - 8), i + 8).join("\n").toLowerCase();
        if (!/search_path/.test(window)) add("medium", "definer-no-search-path", file, i + 1, "security definer 함수에 set search_path = ''가 없습니다.");
      }
    });
  }

  // 프로젝트 설정 검사
  const gitignore = files.includes(".gitignore") ? read(".gitignore") : "";
  if (!/^\s*\.env(\*|\.local|\*\.local)?\s*$/m.test(gitignore)) {
    add("high", "env-not-ignored", ".gitignore", 0, ".gitignore에 .env* (또는 .env.local)가 없습니다.");
  }

  const proxyFile = ["src/proxy.ts", "proxy.ts", "src/middleware.ts", "middleware.ts"].find((f) => files.includes(f));
  if (!proxyFile) add("medium", "no-proxy", "-", 0, "proxy.ts가 없습니다. CSP와 Supabase 세션 갱신이 빠집니다.");
  else {
    if (!/Content-Security-Policy/.test(read(proxyFile))) add("medium", "no-csp", proxyFile, 0, "Content-Security-Policy를 설정하지 않습니다.");
    if (proxyFile.endsWith("middleware.ts")) add("low", "middleware-deprecated", proxyFile, 0, "Next.js 16부터 middleware.ts는 deprecated입니다. proxy.ts로 옮기세요.");
  }

  const nextConfig = files.find((f) => /^next\.config\.(ts|mts|js|mjs)$/.test(f));
  if (nextConfig && !/poweredByHeader\s*:\s*false/.test(read(nextConfig))) {
    add("low", "powered-by-header", nextConfig, 0, "poweredByHeader: false로 X-Powered-By 헤더를 끄세요.");
  }

  return findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.file.localeCompare(b.file));
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
