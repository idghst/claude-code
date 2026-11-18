// 토큰 저장 (스펙 8.3). 액세스 토큰은 메모리에만, 리프레시 토큰은 Keychain/Keystore(native.secureStorage)에만 둔다.
// localStorage·sessionStorage·IndexedDB는 쓰지 않는다(ESLint가 막는다).
import { native } from '#lib/native/index.ts';

const REFRESH_KEY = 'refresh-token';
let accessToken: string | null = null;

export const tokens = {
	access: () => accessToken,
	refreshToken: () => native.secureStorage.get(REFRESH_KEY),
	/** 로그인·갱신 응답을 저장한다. 갱신 때마다 새 리프레시 토큰으로 바꿔 끼운다(회전). */
	async save(access: string, refresh: string) {
		accessToken = access;
		await native.secureStorage.set(REFRESH_KEY, refresh);
	},
	async clear() {
		accessToken = null;
		await native.secureStorage.remove(REFRESH_KEY);
	}
};
