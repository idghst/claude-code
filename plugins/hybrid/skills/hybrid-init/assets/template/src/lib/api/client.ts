// 백엔드 API 호출 단일 창구. VITE_API_BASE_URL(https)로만 보내고, 401이면 토큰을 한 번 갱신한 뒤 재시도한다.
// 서버측 차단(스펙 9.1)을 위해 모든 요청에 X-App-Version, X-App-Platform을 붙인다.
import { native } from '#lib/native/index.ts';
import { tokens } from '#lib/security/tokens.ts';

const BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';
const TIMEOUT_MS = 15_000;
const appVersion = native.appInfo.version().catch(() => null);
let refreshing: Promise<boolean> | null = null;

async function send(path: string, init: RequestInit): Promise<Response> {
	const url = new URL(BASE + path);
	// path에 다른 호스트를 끼워 넣어 토큰이 새 나가지 않게 출처를 다시 확인한다.
	if (url.protocol !== 'https:' || url.origin !== new URL(BASE).origin) throw new Error(`허용되지 않은 API 주소: ${url}`);
	const headers = new Headers(init.headers);
	headers.set('X-App-Platform', native.appInfo.platform());
	const version = await appVersion;
	if (version) headers.set('X-App-Version', version);
	const token = tokens.access();
	if (token) headers.set('Authorization', `Bearer ${token}`);
	return fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
}

// 백엔드 계약: POST /auth/refresh {refreshToken} → {accessToken, refreshToken}. 다르면 이 함수만 고친다.
async function refresh(): Promise<boolean> {
	const refreshToken = await tokens.refreshToken();
	if (!refreshToken) return false;
	const res = await send('/auth/refresh', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refreshToken })
	});
	if (res.status >= 500) throw new Error(`토큰 갱신 실패: HTTP ${res.status}`); // 서버 장애로 로그아웃시키지 않는다
	const body = (res.ok ? await res.json() : {}) as { accessToken?: unknown; refreshToken?: unknown };
	if (typeof body.accessToken !== 'string' || typeof body.refreshToken !== 'string') {
		await tokens.clear();
		return false;
	}
	await tokens.save(body.accessToken, body.refreshToken);
	return true;
}

/** API 요청. path는 '/items'처럼 VITE_API_BASE_URL 뒤에 붙는다. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
	const res = await send(path, init);
	if (res.status !== 401) return res;
	// 여러 요청이 동시에 401을 받아도 갱신은 한 번만 한다(회전된 리프레시 토큰 재사용 방지).
	refreshing ??= refresh().finally(() => (refreshing = null));
	return (await refreshing) ? send(path, init) : res;
}
