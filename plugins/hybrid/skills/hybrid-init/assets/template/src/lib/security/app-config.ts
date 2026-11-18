// 원격 앱 설정 (스펙 9.1): 강제 업데이트, 기능 킬스위치, 공지 배너.
// 이 파일은 #lib·@capacitor를 import하지 않는다(저장소는 인자로 받는다). node --test로 바로 불러 테스트한다.
// 그래서 Node type stripping이 못 읽는 TS 문법(enum, namespace, parameter property)을 쓰지 않는다.
import type { SecureStorage } from '../native/types';

export interface AppConfig {
	minVersion: string;
	features: Record<string, boolean>;
	notice?: { level: 'info' | 'critical'; message: string };
	storeUrl?: { ios?: string; android?: string };
}

export const DEFAULT_CONFIG: AppConfig = { minVersion: '0.0.0', features: {} };
const CACHE_KEY = 'app-config';
const TIMEOUT_MS = 5000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHttpsUrl = (v: unknown) => typeof v === 'string' && v.startsWith('https://');
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** a < b면 음수, 같으면 0, a > b면 양수. "1.10.0" > "1.9.9". 숫자 뒤 꼬리("3-beta")는 무시한다. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.');
	const pb = b.split('.');
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (parseInt(pa[i], 10) || 0) - (parseInt(pb[i], 10) || 0);
		if (diff) return diff;
	}
	return 0;
}

/** 형태가 맞으면 AppConfig, 아니면 null. 서명이 맞아도 형태가 틀리면 버린다. */
export function parseAppConfig(value: unknown): AppConfig | null {
	if (!isObject(value)) return null;
	const { minVersion, features, notice, storeUrl } = value;
	if (typeof minVersion !== 'string' || !/^\d+(\.\d+)*$/.test(minVersion)) return null;
	if (!isObject(features) || !Object.values(features).every((v) => typeof v === 'boolean')) return null;
	if (
		notice !== undefined &&
		!(isObject(notice) && (notice.level === 'info' || notice.level === 'critical') && typeof notice.message === 'string')
	)
		return null;
	if (storeUrl !== undefined && !(isObject(storeUrl) && [storeUrl.ios, storeUrl.android].every((u) => u === undefined || isHttpsUrl(u))))
		return null;
	return value as unknown as AppConfig;
}

/**
 * 서버 응답 {"payload": "<AppConfig JSON 문자열>", "signature": "<base64>"}를 검증한다.
 * 서명: ECDSA P-256 + SHA-256, IEEE P1363(r||s) 형식. 공개키: SPKI DER base64. 서명 방법은 SECURITY.md.
 */
export async function verifySignedConfig(body: unknown, publicKeySpkiBase64: string): Promise<AppConfig | null> {
	if (!isObject(body) || typeof body.payload !== 'string' || typeof body.signature !== 'string') return null;
	try {
		const key = await crypto.subtle.importKey(
			'spki',
			fromBase64(publicKeySpkiBase64),
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify']
		);
		const ok = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			fromBase64(body.signature),
			new TextEncoder().encode(body.payload)
		);
		return ok ? parseAppConfig(JSON.parse(body.payload)) : null;
	} catch {
		return null; // 잘못된 키·base64·JSON
	}
}

/** 마지막으로 검증된 설정. 없거나 깨졌으면 null. */
export async function cachedAppConfig(storage: SecureStorage): Promise<AppConfig | null> {
	try {
		return parseAppConfig(JSON.parse((await storage.get(CACHE_KEY)) ?? 'null'));
	} catch {
		return null;
	}
}

/**
 * GET {apiBase}/app-config → 검증에 성공하면 캐시하고 돌려준다.
 * 실패하면 마지막 정상값, 그것도 없으면 DEFAULT_CONFIG (앱이 먹통 되지 않게). 이 함수는 throw하지 않는다.
 * publicKey가 비어 있으면 dev에서만 서명 없이 payload를 받고, 운영에서는 원격값을 쓰지 않는다.
 */
export async function loadAppConfig(opts: {
	apiBase: string;
	publicKey: string;
	dev: boolean;
	storage: SecureStorage;
}): Promise<AppConfig> {
	const { apiBase, publicKey, dev, storage } = opts;
	// shortcut: 재전송(replay) 미대응. 예전에 서명된 응답(낮은 minVersion, 꺼지기 전 features)을 다시 보내면 받아들인다. 서버가 발급 시각·만료를 payload에 넣게 되면 여기서 만료를 검사한다.
	try {
		const url = new URL(`${apiBase}/app-config`);
		if (url.protocol !== 'https:') throw new Error(`https가 아닌 주소: ${url}`);
		const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body: unknown = await res.json();
		const config = publicKey
			? await verifySignedConfig(body, publicKey)
			: dev && isObject(body) && typeof body.payload === 'string'
				? parseAppConfig(JSON.parse(body.payload))
				: null;
		if (!config) throw new Error(publicKey || dev ? '서명 또는 형태 검증 실패' : 'VITE_APP_CONFIG_PUBLIC_KEY가 없어 원격 설정을 쓰지 않음');
		await storage.set(CACHE_KEY, JSON.stringify(config)).catch(console.warn); // 캐시 실패해도 새 설정은 쓴다
		return config;
	} catch (error) {
		console.warn('app-config 폴백:', error);
		return (await cachedAppConfig(storage)) ?? DEFAULT_CONFIG;
	}
}
