// 네이티브 기능 인터페이스 (스펙 7.1). UI는 이 타입만 알고, 구현은 capacitor/ 아래에 둔다.
// 카메라·푸시 등은 기본으로 넣지 않는다(쓰는 플러그인만 설치, 스펙 8.4). 필요하면 /hybrid:hybrid-native 로 추가한다.

export interface SecureStorage {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	remove(key: string): Promise<void>;
}

export interface AppInfo {
	/** 스토어 버전(예: "1.2.0"). 웹(브라우저 개발)에서는 null. */
	version(): Promise<string | null>;
	platform(): 'ios' | 'android' | 'web';
}

export interface Splash {
	hide(): Promise<void>;
}

export interface ExternalLinks {
	/** 웹뷰 밖(시스템 브라우저)에서 연다. https만 허용한다. */
	open(url: string): Promise<void>;
}

export interface NativeServices {
	secureStorage: SecureStorage;
	appInfo: AppInfo;
	splash: Splash;
	links: ExternalLinks;
}
