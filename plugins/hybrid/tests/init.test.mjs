// 실행: node --test plugins/hybrid/tests  (Node 22.18+ : .ts를 type stripping으로 직접 import)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	DEFAULT_CONFIG,
	compareVersions,
	loadAppConfig,
	parseAppConfig,
	verifySignedConfig
} from '../skills/hybrid-init/assets/template/src/lib/security/app-config.ts';
import { BUDGET_BYTES, initialScripts, measure } from '../skills/hybrid-init/assets/template/scripts/check-bundle.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const CONFIG = { minVersion: '1.2.0', features: { camera: false }, notice: { level: 'critical', message: '점검 중' } };

function signed(config, { key = privateKey, dsaEncoding = 'ieee-p1363' } = {}) {
	const payload = JSON.stringify(config);
	return { payload, signature: crypto.sign('sha256', Buffer.from(payload), { key, dsaEncoding }).toString('base64') };
}

function memoryStorage(initial = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		get: async (k) => map.get(k) ?? null,
		set: async (k, v) => void map.set(k, v),
		remove: async (k) => void map.delete(k)
	};
}

test('verifySignedConfig: 올바른 서명은 통과', async () => {
	assert.deepEqual(await verifySignedConfig(signed(CONFIG), PUBLIC_KEY), CONFIG);
});

test('verifySignedConfig: 변조·다른 키·DER 서명·형태 오류는 null', async () => {
	const body = signed(CONFIG);
	assert.equal(await verifySignedConfig({ ...body, payload: body.payload.replace('1.2.0', '0.0.1') }, PUBLIC_KEY), null);
	const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
	assert.equal(await verifySignedConfig(signed(CONFIG, { key: other }), PUBLIC_KEY), null);
	assert.equal(await verifySignedConfig(signed(CONFIG, { dsaEncoding: 'der' }), PUBLIC_KEY), null);
	assert.equal(await verifySignedConfig(body, 'not-a-key'), null);
	assert.equal(await verifySignedConfig({ payload: body.payload }, PUBLIC_KEY), null);
	assert.equal(await verifySignedConfig(CONFIG, PUBLIC_KEY), null);
	// 서명은 맞지만 형태가 틀린 payload
	assert.equal(await verifySignedConfig(signed({ minVersion: 1, features: {} }), PUBLIC_KEY), null);
});

test('parseAppConfig: 형태 검증', () => {
	assert.deepEqual(parseAppConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
	assert.ok(parseAppConfig({ minVersion: '2', features: {}, storeUrl: { ios: 'https://apps.apple.com/app/id1' } }));
	for (const bad of [
		null,
		[],
		{ features: {} },
		{ minVersion: 'v1.0', features: {} },
		{ minVersion: '1.0.0' },
		{ minVersion: '1.0.0', features: { camera: 'off' } },
		{ minVersion: '1.0.0', features: [] },
		{ minVersion: '1.0.0', features: {}, notice: { level: 'warn', message: 'x' } },
		{ minVersion: '1.0.0', features: {}, notice: { level: 'info' } },
		{ minVersion: '1.0.0', features: {}, storeUrl: { android: 'http://play.google.com' } }
	]) {
		assert.equal(parseAppConfig(bad), null, JSON.stringify(bad));
	}
});

test('compareVersions', () => {
	assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
	assert.ok(compareVersions('1.2.3', '1.2.4') < 0);
	assert.ok(compareVersions('1.0', '1.0.1') < 0);
	assert.equal(compareVersions('1.0', '1.0.0'), 0);
	assert.equal(compareVersions('2.0.0-beta', '2.0.0'), 0);
	assert.ok(compareVersions('0.9', DEFAULT_CONFIG.minVersion) > 0);
});

test('loadAppConfig: 성공 → 캐시, 실패 → 캐시, 캐시도 없으면 기본값', async (t) => {
	t.mock.method(console, 'warn', () => {});
	const opts = (storage) => ({ apiBase: 'https://api.example.com', publicKey: PUBLIC_KEY, dev: false, storage });
	const respond = (body, status = 200) => t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status }));

	const storage = memoryStorage();
	respond(signed(CONFIG));
	assert.deepEqual(await loadAppConfig(opts(storage)), CONFIG);
	assert.deepEqual(JSON.parse(storage.map.get('app-config')), CONFIG);

	// 네트워크 실패·HTTP 오류·변조 → 마지막 정상값
	t.mock.method(globalThis, 'fetch', async () => {
		throw new TypeError('network');
	});
	assert.deepEqual(await loadAppConfig(opts(storage)), CONFIG);
	respond({}, 503);
	assert.deepEqual(await loadAppConfig(opts(storage)), CONFIG);
	const tampered = signed({ ...CONFIG, minVersion: '0.0.1' });
	respond({ ...tampered, payload: tampered.payload.replace('0.0.1', '0.0.2') });
	assert.deepEqual(await loadAppConfig(opts(storage)), CONFIG);

	// 캐시가 없거나 깨졌으면 기본값
	assert.deepEqual(await loadAppConfig(opts(memoryStorage())), DEFAULT_CONFIG);
	assert.deepEqual(await loadAppConfig(opts(memoryStorage({ 'app-config': '{broken' }))), DEFAULT_CONFIG);
});

test('loadAppConfig: 공개키가 없으면 dev에서만 무서명 허용, https만', async (t) => {
	t.mock.method(console, 'warn', () => {});
	const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ payload: JSON.stringify(CONFIG) })));
	const base = { apiBase: 'https://api.example.com', publicKey: '' };
	assert.deepEqual(await loadAppConfig({ ...base, dev: true, storage: memoryStorage() }), CONFIG);
	assert.deepEqual(await loadAppConfig({ ...base, dev: false, storage: memoryStorage() }), DEFAULT_CONFIG);

	const calls = fetchMock.mock.callCount();
	assert.deepEqual(await loadAppConfig({ ...base, apiBase: 'http://api.example.com', dev: true, storage: memoryStorage() }), DEFAULT_CONFIG);
	assert.equal(fetchMock.mock.callCount(), calls, 'http 주소로는 요청하지 않는다');
});

const SAMPLE_HTML = `<head>
<link href="/_app/immutable/entry/start.js" rel="modulepreload">
<link rel="modulepreload" href="/_app/immutable/chunks/a.js">
<link rel="icon" href="/favicon.png">
<script type="module" src="/_app/immutable/extra.js"></script>
</head><body><script>import("/_app/immutable/entry/start.js").then(() => import("/_app/immutable/entry/app.js"));</script></body>`;

test('initialScripts: script src·modulepreload·인라인 import만 모은다', () => {
	assert.deepEqual(initialScripts(SAMPLE_HTML).sort(), [
		'/_app/immutable/chunks/a.js',
		'/_app/immutable/entry/app.js',
		'/_app/immutable/entry/start.js',
		'/_app/immutable/extra.js'
	]);
});

function buildFixture(sizes) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-'));
	const tags = Object.entries(sizes).map(([name, size]) => {
		fs.mkdirSync(path.join(dir, '_app'), { recursive: true });
		fs.writeFileSync(path.join(dir, '_app', name), crypto.randomBytes(size)); // 난수라 gzip해도 거의 안 줄어든다
		return `<link href="/_app/${name}" rel="modulepreload">`;
	});
	fs.writeFileSync(path.join(dir, 'index.html'), `<head>${tags.join('')}</head>`);
	return dir;
}

test('measure + CLI: 예산 이하 통과, 초과 시 종료 코드 1', () => {
	const script = path.join(HERE, '../skills/hybrid-init/assets/template/scripts/check-bundle.mjs');
	const small = buildFixture({ 'a.js': 1000, 'b.js': 2000 });
	const { files, total } = measure(small);
	assert.equal(files.length, 2);
	assert.ok(total > 3000 && total < BUDGET_BYTES);
	assert.equal(spawnSync(process.execPath, [script, small]).status, 0);

	const big = buildFixture({ 'a.js': 60 * 1024, 'b.js': 60 * 1024 });
	assert.ok(measure(big).total > BUDGET_BYTES);
	const run = spawnSync(process.execPath, [script, big], { encoding: 'utf8' });
	assert.equal(run.status, 1);
	assert.match(run.stdout, /✘/);
	assert.equal(spawnSync(process.execPath, [script, path.join(small, 'missing')]).status, 2);
});

test('apply-template: 잘못된 입력은 쓰기 전에 거부', () => {
	const script = path.join(HERE, '../skills/hybrid-init/scripts/apply-template.mjs');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-'));
	const ok = ['--name', 'my-app', '--app-name', 'My App', '--app-id', 'kr.co.idghst.myapp', '--api-origin', 'https://api.example.com'];
	const run = (args) => spawnSync(process.execPath, [script, dir, ...args], { encoding: 'utf8' });
	const withArg = (flag, value) => ok.map((v, i) => (ok[i - 1] === flag ? value : v));

	assert.match(run(withArg('--api-origin', 'http://api.example.com')).stderr, /https/);
	assert.match(run(withArg('--api-origin', 'https://api.example.com/v1')).stderr, /경로 없는/);
	assert.match(run(withArg('--app-id', 'kr.co.idghst.my-app')).stderr, /--app-id/);
	assert.match(run(withArg('--app-id', 'myapp')).stderr, /--app-id/);
	assert.match(run(withArg('--app-name', "Joe's {App}")).stderr, /--app-name/);
	assert.match(run(withArg('--name', 'My_App')).stderr, /--name/);
	assert.match(run(ok).stderr, /package\.json이 없습니다/);
	assert.deepEqual(fs.readdirSync(dir), []);
});
