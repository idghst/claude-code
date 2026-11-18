// 실행: node --test plugins/hybrid/tests
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { audit } from "../skills/hybrid-security-audit/scripts/audit.mjs";

const SCRIPT = fileURLToPath(new URL("../skills/hybrid-security-audit/scripts/audit.mjs", import.meta.url));

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-audit-"));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

const without = (files, key) => Object.fromEntries(Object.entries(files).filter(([k]) => k !== key));

// 설계대로 만든 프로젝트의 축약판
const CLEAN = {
  "package.json": JSON.stringify({
    dependencies: {
      "@capacitor/core": "^8.6.0",
      "@capacitor/android": "^8.6.0",
      "@capacitor/ios": "^8.6.0",
      "@capacitor/app": "^8.0.0",
      "@capacitor/browser": "^8.0.0",
      "@capacitor/splash-screen": "^8.0.0",
      "@aparajita/capacitor-secure-storage": "^8.0.0",
    },
    devDependencies: { "@capacitor/cli": "^8.6.0" },
  }, null, 2),
  "package-lock.json": "{}",
  "SECURITY.md": "# 보안\ncrypto.sign('sha256', payload, { key, dsaEncoding: 'ieee-p1363' })\n",
  ".gitignore": ".env\n.env.*\n!.env.example\n",
  ".env.example": "# VITE_* 는 번들에 들어가므로 SECRET·PRIVATE 값을 넣지 않는다\nVITE_API_BASE_URL=https://api.example.com\nVITE_APP_CONFIG_PUBLIC_KEY=\n",
  "svelte.config.js": `import adapter from '@sveltejs/adapter-static';
export default {
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', 'wasm-unsafe-eval'], 'style-src': ['self', 'unsafe-inline'],
        'connect-src': ['self', 'https://api.example.com'],
        'object-src': ['none']
      }
    }
  }
};
`,
  "capacitor.config.ts": `import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'kr.co.idghst.myapp',
  webDir: 'build',
  // server.url 은 운영 빌드에서 절대 설정하지 않음 (원격 로드 금지)
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { webContentsDebuggingEnabled: false },
  plugins: { SplashScreen: { launchAutoHide: false } }
};
export default config;
`,
  "eslint.config.js": `export default [{ rules: { 'no-restricted-globals': ['error', 'localStorage', 'sessionStorage', 'indexedDB'], 'no-eval': 'error' } }];\n`,
  "src/app.html": `<!doctype html><html><head>%sveltekit.head%</head><body>%sveltekit.body%</body></html>\n`,
  "src/lib/native/index.ts": `import type { NativeServices } from './types';\nimport { capacitorServices } from './capacitor';\nexport const native: NativeServices = capacitorServices;\n`,
  "src/lib/native/capacitor/index.ts": `import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
// 웹에서는 메모리 Map (localStorage 금지)
const memory = new Map<string, string>();
export async function open(url: string) { if (new URL(url).protocol === 'https:') await Browser.open({ url }); }
`,
  "src/lib/security/tokens.ts": `let accessToken: string | null = null; // 메모리만, localStorage·sessionStorage 금지
/* eval( 과 new Function( 은 쓰지 않는다 */
export const getAccess = () => accessToken;
`,
  "src/lib/api/client.ts": `const base = import.meta.env.VITE_API_BASE_URL;\nif (!base.startsWith('https://')) throw new Error('https만');\n`,
  "src/routes/+layout.svelte": `<script lang="ts">
  import { native } from '$lib/native';
</script>
<!-- {@html} 금지, 외부 링크는 links.open -->
<svg xmlns="http://www.w3.org/2000/svg"></svg>
<button onclick={() => native.links.open('https://apps.apple.com')}>업데이트</button>
`,
  ".github/workflows/ci.yml": "jobs:\n  ci:\n    steps:\n      - run: npm ci\n      - run: npm audit --audit-level=high\n      - uses: google/osv-scanner-action/osv-scanner-action@v2\n",
  "android/app/src/main/AndroidManifest.xml": `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:allowBackup="false" android:networkSecurityConfig="@xml/network_security_config">
    <intent-filter><action android:name="android.intent.action.MAIN" /></intent-filter>
  </application>
</manifest>
`,
  "android/app/src/main/res/xml/network_security_config.xml": `<network-security-config><base-config cleartextTrafficPermitted="false" /></network-security-config>\n`,
  // 생성물·복사된 웹 번들은 무시
  "android/app/src/main/assets/public/_app/x.js": "localStorage.setItem('t', 'x'); eval('1');\n",
  "android/app/build/intermediates/AndroidManifest.xml": `<application android:allowBackup="true" />\n`,
  "ios/App/Pods/x/Info.plist": "<key>NSAllowsArbitraryLoads</key><true/>\n",
  "node_modules/x/index.js": "-----BEGIN PRIVATE KEY-----\n",
  "build/index.html": "<script>eval('1')</script>\n",
  "ios/App/App/Info.plist": `<plist><dict><key>CFBundleName</key><string>App</string></dict></plist>\n`,
};

test("audit: 설계대로 만든 프로젝트는 0건", () => {
  assert.deepEqual(audit(fixture(CLEAN)), []);
});

test("audit: 위반 사항을 모두 잡는다", () => {
  const root = fixture({
    "package.json": JSON.stringify({ dependencies: { "@capacitor/core": "8", "@capacitor/camera": "8" } }),
    ".env.example": "VITE_SUPABASE_SERVICE_ROLE_KEY=x\nAWS=AKIAABCDEFGHIJKLMNOP\n",
    "svelte.config.js": `export default { kit: { csp: { directives: { 'script-src': ['self', 'unsafe-eval'] } } } };\n`,
    "capacitor.config.ts": `export default {
  server: { url: 'http://192.168.0.2:5173', cleartext: true },
  android: { allowMixedContent: true, webContentsDebuggingEnabled: true }
};
`,
    "src/lib/keys.ts": "export const k = `-----BEGIN EC PRIVATE KEY-----`;\n",
    "src/routes/+page.svelte": `<script lang="ts">
  import { Camera } from '@capacitor/camera';
  localStorage.setItem('token', t);
  const f = new Function('return 1');
  fetch('http://api.example.com');
  window.open('https://example.com');
</script>
{@html body}
<a href="https://example.com" target="_blank">x</a>
`,
    "src/lib/x.ts": "const y = eval('1');\n",
    ".github/workflows/ci.yml": "jobs: {}\n",
    "android/app/src/main/AndroidManifest.xml": `<application android:allowBackup="true" android:usesCleartextTraffic="true">
  <data android:scheme="myapp" />
  <data android:scheme="https" android:host="example.com" />
</application>
`,
    "android/app/src/main/res/xml/network_security_config.xml": `<base-config cleartextTrafficPermitted="true" />\n`,
    "ios/App/App/Info.plist": `<dict>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key>
<true/>
<key>NSExceptionDomains</key><dict/></dict>
<key>CFBundleURLSchemes</key><array><string>myapp</string></array>
</dict>
`,
  });
  const findings = audit(root);
  const rules = new Set(findings.map((f) => f.rule));
  for (const rule of [
    "remote-server-url",
    "hardcoded-secret",
    "public-secret-env",
    "native-import-outside-adapter",
    "webview-debugging",
    "mixed-content",
    "cleartext-traffic",
    "ats-arbitrary-loads",
    "unsafe-script-src",
    "web-storage",
    "dynamic-code",
    "no-lockfile",
    "html-tag",
    "no-network-security-config",
    "allow-backup",
    "ats-exception",
    "http-literal",
    "no-dependency-scan",
    "external-link",
    "no-security-md",
    "custom-url-scheme",
    "unused-plugin",
  ]) {
    assert.ok(rules.has(rule), `${rule} 누락`);
  }
  // 같은 줄 번호, 규칙별 개수
  assert.equal(findings.filter((f) => f.rule === "cleartext-traffic").length, 3);
  assert.equal(findings.filter((f) => f.rule === "dynamic-code").length, 2);
  assert.equal(findings.filter((f) => f.rule === "custom-url-scheme").length, 2);
  assert.equal(findings.filter((f) => f.rule === "external-link").length, 2);
  const ats = findings.find((f) => f.rule === "ats-arbitrary-loads");
  assert.equal(`${ats.file}:${ats.line}`, "ios/App/App/Info.plist:2");
  assert.equal(findings[0].severity, "critical");
});

test("audit: CSP가 아예 없으면 no-csp", () => {
  const rest = without(CLEAN, "svelte.config.js");
  assert.deepEqual(audit(fixture(rest)).map((f) => f.rule), ["no-csp"]);
  const meta = audit(fixture({ ...rest, "src/app.html": `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'">` }));
  assert.deepEqual(meta.map((f) => f.rule), ["unsafe-script-src"]);
});

test("audit: 주석 줄은 무시한다", () => {
  const root = fixture({
    ...CLEAN,
    "capacitor.config.ts": "// server: { url: 'http://x' }, webContentsDebuggingEnabled: true\nexport default {};\n",
    "src/lib/c.ts": "// import { Camera } from '@capacitor/camera';\n/*\n * localStorage.setItem('x', eval('1'))\n */\n",
    "src/routes/c.svelte": "<!-- {@html x} target=\"_blank\" http://example.com -->\n",
    ".env.example": "# VITE_SECRET_KEY=x\n",
  });
  assert.deepEqual(audit(root), []);
});

test("CLI: 종료 코드와 --json", () => {
  const clean = spawnSync(process.execPath, [SCRIPT, fixture(CLEAN)], { encoding: "utf8" });
  assert.equal(clean.status, 0, clean.stderr);
  const bad = spawnSync(process.execPath, [SCRIPT, fixture({ ...CLEAN, "src/x.ts": "eval('1')\n" }), "--json"], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).blocking, 1);
  const lowOnly = spawnSync(process.execPath, [SCRIPT, fixture(without(CLEAN, "SECURITY.md"))], { encoding: "utf8" });
  assert.equal(lowOnly.status, 0);
  assert.equal(spawnSync(process.execPath, [SCRIPT, os.tmpdir() + "/없는-경로"], { encoding: "utf8" }).status, 2);
});
