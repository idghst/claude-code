import type { CapacitorConfig } from '@capacitor/cli';

// 운영 기준 (스펙 5장)
const config: CapacitorConfig = {
	appId: '{{APP_ID}}',
	appName: '{{APP_NAME}}',
	webDir: 'build',
	// server.url 은 운영 빌드에서 절대 설정하지 않음 (원격 로드 금지)
	android: {
		allowMixedContent: false,
		webContentsDebuggingEnabled: false
	},
	ios: {
		webContentsDebuggingEnabled: false
	},
	plugins: {
		// 첫 화면을 그린 뒤 +layout.svelte에서 native.splash.hide()로 내린다.
		SplashScreen: { launchAutoHide: false }
	}
};

export default config;
