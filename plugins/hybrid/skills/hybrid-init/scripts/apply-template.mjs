#!/usr/bin/env node
// sv create + Capacitor init/add 직후의 프로젝트에 템플릿을 입힌다.
// 사용법: node apply-template.mjs <projectDir> --name <kebab> --app-name "<표시명>" --app-id <id> --api-origin https://...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'template');
// sv create · cap init 이 만든 기본 파일이라 덮어써도 되는 것들.
const OVERWRITABLE = new Set([
	'vite.config.ts',
	'eslint.config.js',
	'capacitor.config.ts',
	'src/app.html',
	'src/routes/+layout.svelte',
	'src/routes/+page.svelte'
]);
const REQUIRED_PACKAGES = [
	'@sveltejs/kit',
	'@sveltejs/adapter-static',
	'svelte',
	'eslint',
	'eslint-plugin-svelte',
	'typescript-eslint',
	'@capacitor/core',
	'@capacitor/cli',
	'@capacitor/ios',
	'@capacitor/android',
	'@capacitor/app',
	'@capacitor/splash-screen',
	'@capacitor/browser',
	'@aparajita/capacitor-secure-storage'
];
const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const USAGE = '사용법: node apply-template.mjs <projectDir> --name <kebab> --app-name "<표시명>" --app-id <id> --api-origin https://...';

function fail(message) {
	console.error(`✘ ${message}`);
	process.exit(1);
}

function parseArgs(argv) {
	const [projectDir, ...rest] = argv;
	const opt = (flag) => {
		const i = rest.indexOf(flag);
		return i >= 0 ? rest[i + 1] : undefined;
	};
	const args = { name: opt('--name'), appName: opt('--app-name'), appId: opt('--app-id'), apiOrigin: opt('--api-origin') };
	if (!projectDir || Object.values(args).some((v) => !v)) fail(USAGE);
	if (!/^[a-z0-9][a-z0-9-]*$/.test(args.name)) fail(`--name은 소문자·숫자·하이픈만 씁니다: ${args.name}`);
	// 템플릿의 TS 문자열·Svelte 마크업에 그대로 들어가므로 따옴표·중괄호·꺾쇠를 막는다.
	if (!/^[^{}<>"'`\\\n]{1,50}$/.test(args.appName)) fail(`--app-name은 1~50자, 따옴표·중괄호·꺾쇠·역슬래시 없이: ${args.appName}`);
	// iOS 번들 ID와 Android applicationId 모두에서 유효한 형식: 영문으로 시작하는 영숫자 조각 2개 이상.
	if (!/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(args.appId)) fail(`--app-id 형식이 올바르지 않습니다(예: kr.co.idghst.myapp): ${args.appId}`);
	let url;
	try {
		url = new URL(args.apiOrigin);
	} catch {
		fail(`--api-origin이 URL이 아닙니다: ${args.apiOrigin}`);
	}
	if (url.protocol !== 'https:' || url.origin !== args.apiOrigin) fail(`--api-origin은 경로 없는 https 출처여야 합니다(예: https://api.example.com): ${args.apiOrigin}`);
	return { root: path.resolve(projectDir), ...args };
}

function listFiles(dir, base = dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
	});
}

function checkPrerequisites(root, appId) {
	const pkgPath = path.join(root, 'package.json');
	if (!fs.existsSync(pkgPath)) fail(`${root}에 package.json이 없습니다. sv create를 먼저 실행하세요.`);
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	const missing = REQUIRED_PACKAGES.filter((d) => !deps[d]);
	if (missing.length) fail(`설치되지 않은 패키지: ${missing.join(', ')}`);
	for (const f of ['capacitor.config.ts', 'ios/App/App.xcodeproj', MANIFEST, 'src/routes/+page.svelte']) {
		if (!fs.existsSync(path.join(root, f))) fail(`${f}가 없습니다. SKILL.md의 앞 단계(cap init, cap add)를 확인하세요.`);
	}
	// 네이티브 프로젝트에는 cap add 때의 appId가 이미 들어가 있다. 다른 값을 쓰면 config와 어긋난다.
	if (!fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8').includes(`'${appId}'`)) {
		fail(`capacitor.config.ts의 appId가 ${appId}가 아닙니다. cap init 때와 같은 --app-id를 주세요.`);
	}
	return pkg;
}

function copyTemplate(root, vars) {
	const files = listFiles(TEMPLATE_DIR);
	// 쓰기 전에 충돌부터 모두 확인해, 중간에 멈춰 반쯤 덮어쓴 상태가 되지 않게 한다.
	const conflicts = files.filter((f) => fs.existsSync(path.join(root, f)) && !OVERWRITABLE.has(f));
	if (conflicts.length) fail(`이미 있는 파일이라 덮어쓰지 않습니다: ${conflicts.join(', ')}`);

	for (const rel of files) {
		const dest = path.join(root, rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		let content = fs.readFileSync(path.join(TEMPLATE_DIR, rel), 'utf8');
		for (const [key, value] of Object.entries(vars)) content = content.replaceAll(`{{${key}}}`, value);
		fs.writeFileSync(dest, content);
	}
	return files;
}

function patchManifest(root) {
	const file = path.join(root, MANIFEST);
	let xml = fs.readFileSync(file, 'utf8');
	if (!xml.includes('android:networkSecurityConfig=')) {
		xml = xml.replace('<application', '<application\n        android:networkSecurityConfig="@xml/network_security_config"');
	}
	xml = xml.replace('android:allowBackup="true"', 'android:allowBackup="false"');
	fs.writeFileSync(file, xml);
	if (!xml.includes('android:networkSecurityConfig="@xml/network_security_config"') || !xml.includes('android:allowBackup="false"')) {
		return `${MANIFEST} 형식이 예상과 달라 networkSecurityConfig·allowBackup="false"를 직접 확인하세요.`;
	}
	return null;
}

// .env.example이 무시되지 않도록 `!.env.example`은 `.env*`보다 뒤에 있어야 한다.
function ensureEnvIgnored(file) {
	const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
	const lines = current.split(/\r?\n/).map((l) => l.trim());
	if (lines.includes('.env*') && lines.lastIndexOf('!.env.example') > lines.lastIndexOf('.env*')) return false;
	fs.writeFileSync(file, `${current.replace(/\n?$/, '\n')}.env*\n!.env.example\n`);
	return true;
}

const { root, name, appName, appId, apiOrigin } = parseArgs(process.argv.slice(2));
const pkg = checkPrerequisites(root, appId);
const written = copyTemplate(root, { PROJECT_NAME: name, APP_NAME: appName, APP_ID: appId, API_ORIGIN: apiOrigin });
const warning = patchManifest(root);

pkg.scripts = { ...pkg.scripts, size: 'node scripts/check-bundle.mjs' };
fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(pkg, null, '\t')}\n`);

const env = path.join(root, '.env');
const createdEnv = !fs.existsSync(env);
if (createdEnv) fs.copyFileSync(path.join(root, '.env.example'), env);
const gitignoreChanged = ensureEnvIgnored(path.join(root, '.gitignore'));

console.log(`✔ 템플릿 적용 완료: ${root}`);
console.log(`  파일 ${written.length}개 작성, AndroidManifest 패치, package.json에 size 스크립트 추가`);
if (createdEnv) console.log('  .env를 .env.example로 만들었습니다. VITE_APP_CONFIG_PUBLIC_KEY는 SECURITY.md대로 채우세요.');
if (gitignoreChanged) console.log('  .gitignore에 .env*, !.env.example 추가');
if (warning) console.log(`⚠ ${warning}`);
