// 화면에서 쓰는 현재 앱 설정. +layout.svelte가 캐시 → 원격 순서로 채운다.
import { DEFAULT_CONFIG, type AppConfig } from './app-config';

export const appConfig = $state<{ current: AppConfig }>({ current: DEFAULT_CONFIG });

/** 기능 킬스위치: 서버가 features[name]을 false로 보낸 기능만 꺼진다. 목록에 없으면 켜진 것으로 본다. */
export function isEnabled(name: string): boolean {
	return appConfig.current.features[name] !== false;
}
