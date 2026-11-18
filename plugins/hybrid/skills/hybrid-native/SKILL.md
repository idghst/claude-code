---
name: hybrid-native
description: >
  hybrid-init으로 만든 Capacitor + SvelteKit 앱에 네이티브 기능 하나(카메라, 푸시, 생체인증, 딥링크, 커스텀 네이티브 플러그인 등)를
  어댑터(src/lib/native)로 추가한다. 플러그인 선정(공식 우선, 서드파티는 스펙 8.7 기준), types.ts 인터페이스 → capacitor/ 구현 →
  index 등록, 킬스위치(features.<이름>) 연결, Info.plist·AndroidManifest 권한 선언, cap sync, 린트·타입·빌드·번들 크기·보안 점검까지 한다.
when_to_use: >
  사용자가 Capacitor/하이브리드/Svelte 앱을 명시하거나 이 하이브리드 앱 스펙(docs/SPEC.md)을 언급하며 네이티브 기능을 붙일 때만
  ("카메라 기능 추가", "푸시 알림 붙여줘", "생체인증", "딥링크/유니버설 링크", "커스텀 네이티브 플러그인").
  그 외 앱 요청은 전역 규칙(네이티브 SwiftUI/Compose)을 따른다.
argument-hint: "<기능 이름 예: camera>"
---

# 하이브리드 앱에 네이티브 기능 추가

근거는 프로젝트 `docs/SPEC.md` 7.1(어댑터)·8.4(브리지)·8.5(딥링크)·8.7(신규 의존성)·9.1(킬스위치). 프로젝트 루트(`capacitor.config.ts`, `src/lib/native/types.ts`가 있는 곳)에서 실행한다. 없으면 멈추고 `/hybrid:hybrid-init`을 안내한다.

기능 하나 = 이름 하나. `<name>`은 camelCase 영문(예: `camera`, `push`, `biometric`, `deepLinks`)이고 다음 네 곳에서 같은 이름을 쓴다.

| 위치 | 예 (`camera`) |
|---|---|
| 인터페이스 | `src/lib/native/types.ts`의 `CameraService`, `NativeServices.camera` |
| 구현 | `src/lib/native/capacitor/camera.ts`의 `export const camera` |
| 등록 | `src/lib/native/capacitor/index.ts`의 `capacitorServices` |
| 킬스위치 | 서버 app-config `features.camera` → UI `isEnabled('camera')` |

## 1. 플러그인 고르기

1. 아래 레시피에 있으면 그 플러그인을 쓴다.
2. 없으면 공식(`@capacitor/*`) 플러그인을 먼저 찾는다: `npm view @capacitor/<기능> version peerDependencies`.
3. 공식이 없으면 서드파티 후보를 스펙 8.7 기준으로 확인하고 결과를 사용자에게 보여 준 뒤 설치 여부를 묻는다.
   - `npm view <pkg> version time.modified maintainers repository peerDependencies dependencies`
   - 주간 다운로드: `https://api.npmjs.org/downloads/point/last-week/<pkg>`
   - 저장소의 최근 커밋·열린 보안 이슈, GitHub Security Advisories(`https://github.com/advisories?query=<pkg>`)
   - `@capacitor/core` 메이저 호환(현재 8). 맞지 않으면 쓰지 않는다.
   - 6개월 넘게 커밋·응답이 없거나 메인테이너가 1명뿐이면 위험으로 보고한다(7.3 "유지보수 중단" 기준).
4. 플러그인으로 안 되면 레시피 E(커스텀 네이티브 플러그인).

## 2. 설치

```bash
npm i <플러그인>          # package-lock.json이 갱신된다. 커밋 대상
```

## 3. 어댑터 작성

1. `src/lib/native/types.ts`에 인터페이스를 추가하고 `NativeServices`에 `<name>: <Name>Service`를 넣는다. 인터페이스에는 플러그인 타입을 쓰지 않는다(`Blob`, `string`, 직접 정의한 타입만). 플러그인을 바꿔도 UI가 안 바뀌게 하기 위해서다.
2. `src/lib/native/capacitor/<name>.ts`에 구현한다. 플러그인 import는 이 파일에만 둔다(ESLint가 밖에서의 import를 막는다).
3. `src/lib/native/capacitor/index.ts`에 import하고 `capacitorServices`에 추가한다. `src/lib/native/index.ts`는 고치지 않는다.
4. 웹(브라우저 개발)에서 동작이 없으면 `Capacitor.isNativePlatform()`으로 갈라 명확한 오류를 던진다. 웹 저장소로 대체하지 않는다.

## 4. UI 연결

- UI는 `import { native } from '#lib/native/index.ts'`만 쓴다.
- 기능 진입점(버튼, 메뉴, 리스너 등록)을 `isEnabled('<name>')`(`#lib/security/config.svelte.ts`)으로 감싼다. 서버가 `features.<name> = false`를 보내면 원격으로 꺼진다(9.1). 기능 이름을 사용자에게 알려 서버 app-config 운영자와 공유하게 한다.
- 화면 디자인(배치, 문구 스타일)은 정하지 않는다. 동작에 필요한 최소 요소만 두고, 디자인이 필요하면 사용자에게 묻는다.

## 5. 권한 선언

플러그인 README(`node_modules/<pkg>/README.md`)의 iOS·Android 절을 읽고 **필요한 것만** 넣는다.
- iOS 사용 목적 문자열: `plutil -insert <키> -string "<한국어 사유>" ios/App/App/Info.plist && plutil -lint ios/App/App/Info.plist`. 사유는 사용자가 볼 문장이다(심사 거절 사유가 되므로 구체적으로).
- iOS capability(푸시, Associated Domains 등)는 `ios/App/App/App.entitlements`와 Xcode Signing & Capabilities에 넣는다.
- Android: `android/app/src/main/AndroidManifest.xml`에 `<uses-permission>`. `maxSdkVersion`으로 범위를 좁힐 수 있으면 좁힌다.
- 쓰지 않는 권한(예: `saveToGallery`를 안 쓰면 저장소·사진 보관함 권한)은 넣지 않는다.

## 6. 검증

```bash
npm run lint && npm run check && npm run build && npm run size && npx cap sync
node "${CLAUDE_PLUGIN_ROOT}/skills/hybrid-security-audit/scripts/audit.mjs" .
```

- `cap sync` 출력의 플러그인 목록에 새 플러그인이 있어야 한다(iOS는 `ios/App/CapApp-SPM/Package.swift`에 추가됨).
- 보안 점검의 `unused-plugin`이 새 플러그인을 가리키면 어댑터에서 안 쓰고 있다는 뜻이다.
- iOS 시뮬레이터 빌드·실행은 `/hybrid:hybrid-init` 5단계 명령 그대로. 카메라·푸시·생체인증은 시뮬레이터에서 제한되므로 실기기 확인이 필요하다고 보고한다.
- 보고: 추가한 기능 이름(킬스위치 키), 설치한 패키지와 버전, 넣은 권한, 서버·콘솔 작업(APNs/FCM 키, 도메인 연결 파일), 검증하지 못한 항목.

## 레시피

### A. 카메라 (`camera`, `@capacitor/camera`, 공식)

```ts
// types.ts
export interface CameraService {
	/** 카메라로 한 장 찍어 JPEG Blob으로 돌려준다. 사용자가 취소하면 reject. */
	takePhoto(): Promise<Blob>;
}
// NativeServices에 camera: CameraService;
```

```ts
// capacitor/camera.ts
import { Camera } from '@capacitor/camera';
import type { CameraService } from '../types';

export const camera: CameraService = {
	async takePhoto() {
		// saveToGallery는 끈다(사진 보관함 권한 불필요). webPath는 앱 출처(capacitor://localhost)라 CSP connect-src 'self'로 읽힌다.
		const { webPath } = await Camera.takePhoto({ quality: 80, correctOrientation: true, saveToGallery: false });
		if (!webPath) throw new Error('카메라 결과에 webPath가 없습니다');
		return (await fetch(webPath)).blob();
	}
};
```

```svelte
<!-- 사용 예: 미리보기는 blob: URL (CSP img-src에 blob: 있음). 다 쓰면 URL.revokeObjectURL -->
{#if isEnabled('camera')}
	<button type="button" onclick={async () => (photoUrl = URL.createObjectURL(await native.camera.takePhoto()))}>사진 찍기</button>
{/if}
```

- 권한: iOS `NSCameraUsageDescription`만. Android는 권한 불필요(`saveToGallery: true`일 때만 저장소 권한). 갤러리 선택(`chooseFromGallery`)을 쓰면 iOS `NSPhotoLibraryUsageDescription` 추가.
- 업로드는 `api()`로 `FormData`에 Blob을 넣어 보낸다. 사진을 웹 저장소에 두지 않는다.

### B. 푸시 (`push`, `@capacitor/push-notifications`, 공식)

```ts
export interface PushService {
	/** 권한을 요청하고 기기 토큰을 돌려준다. 거부하면 null. */
	register(): Promise<string | null>;
	onMessage(handler: (data: Record<string, string>) => void): void;
}
```

- 구현: `requestPermissions()` → `granted`가 아니면 null → `addListener('registration', ...)`를 먼저 걸고 `register()` 호출, `registrationError`면 reject. `pushNotificationReceived`·`pushNotificationActionPerformed`의 `data`를 `onMessage`로 넘긴다.
- 기기 토큰은 `api()`로 서버에 등록한다. 비밀이 아니지만 웹 저장소에 두지 않는다.
- 알림 `data`는 신뢰하지 않는다: 화면 이동이 필요하면 레시피 D의 경로 화이트리스트 검증을 거친다. 알림 본문에 토큰·개인정보를 넣지 않도록 서버 측에 알린다.
- iOS: Push Notifications capability, APNs 인증 키(서버). Android: Firebase 프로젝트의 `google-services.json`을 `android/app/`에(커밋 여부는 사용자 결정), Android 13+ 알림 권한은 `requestPermissions()`가 요청한다.

### C. 생체인증 (`biometric`, 공식 없음 → `@aparajita/capacitor-biometric-auth`, 서드파티)

1단계 3번 기준을 확인하고 사용자 승인 후 설치한다(보안 저장소와 같은 메인테이너).

```ts
export interface BiometricService {
	isAvailable(): Promise<boolean>;
	/** 성공하면 resolve, 취소·실패하면 reject. */
	authenticate(reason: string): Promise<void>;
}
```

- 구현: `BiometricAuth.checkBiometry()`의 `isAvailable`, `BiometricAuth.authenticate({ reason, allowDeviceCredential: false })`.
- 생체인증은 UI 잠금일 뿐이다. 서버 인가를 대신하지 않는다. 결과(성공 여부)를 저장소에 플래그로 남겨 우회 가능하게 만들지 않는다.
- 권한: iOS `NSFaceIDUsageDescription`. Android는 플러그인이 선언한다(README 확인).

### D. 딥링크 (`deepLinks`, `@capacitor/app` 이미 설치됨)

커스텀 스킴 대신 Universal Links(iOS)·App Links(Android)만 쓴다(8.5).

```ts
export interface DeepLinks {
	/** 허용된 앱 내부 경로만 handler로 넘긴다. */
	onOpen(handler: (path: string) => void): void;
}
```

```ts
// capacitor/deep-links.ts
import { App } from '@capacitor/app';
import type { DeepLinks } from '../types';

const HOST = 'app.example.com'; // 연결한 도메인
const ALLOWED = [/^\/$/, /^\/items\/[A-Za-z0-9-]{1,64}$/]; // 열 수 있는 경로만 나열

export const deepLinks: DeepLinks = {
	onOpen(handler) {
		void App.addListener('appUrlOpen', ({ url }) => {
			const u = new URL(url);
			if (u.protocol !== 'https:' || u.host !== HOST || !ALLOWED.some((re) => re.test(u.pathname))) return; // 버린다
			handler(u.pathname); // 쿼리·해시는 넘기지 않는다. 필요하면 키별로 검증해 추가
		});
	}
};
```

- `+layout.svelte`의 `onMount`에서 `native.deepLinks.onOpen((path) => goto(path))` (`goto`는 `$app/navigation`). `isEnabled('deepLinks')`로 감싼다.
- iOS: `App.entitlements`에 `com.apple.developer.associated-domains` = `applinks:<도메인>`, 서버 `https://<도메인>/.well-known/apple-app-site-association`.
- Android: `MainActivity` intent-filter에 `android:autoVerify="true"`, `scheme="https"`, `host="<도메인>"`, 서버 `https://<도메인>/.well-known/assetlinks.json`(릴리스 서명 SHA-256).

### E. 커스텀 네이티브 플러그인 (`<name>`, 플러그인이 없거나 교체할 때, 7.2)

- JS: `capacitor/<name>.ts`에서 `registerPlugin<{ ... }>('<Name>')`(`@capacitor/core`)로 받고 어댑터 인터페이스로 감싼다.
- iOS: `ios/App/App/<Name>Plugin.swift`에 `CAPPlugin, CAPBridgedPlugin`(`identifier`, `jsName`, `pluginMethods`) 구현. 앱 내부 플러그인은 `CAPBridgeViewController` 하위 클래스의 `capacitorDidLoad()`에서 `bridge?.registerPluginInstance(<Name>Plugin())`로 등록하고, `Main.storyboard`의 뷰 컨트롤러 클래스를 그 하위 클래스로 바꾼다.
- Android: `android/app/src/main/java/<패키지>/<Name>Plugin.java`에 `@CapacitorPlugin(name = "<Name>")` + `@PluginMethod`. `MainActivity.onCreate`에서 `super.onCreate` **전에** `registerPlugin(<Name>Plugin.class)`.
- 8.4 필수:
  - 웹에서 온 모든 인자를 네이티브에서 다시 검증한다(타입, 길이, 범위, 허용 값 목록). 실패하면 `call.reject`. JS 쪽 검증만 믿지 않는다(웹뷰가 오염되면 우회된다).
  - 파일 경로 인자는 앱 샌드박스 하위 폴더 이름(상대 경로)만 받는다. 정규화 후 접두어를 확인해 밖이면 거부한다.
    - iOS: `let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].standardizedFileURL.resolvingSymlinksInPath()`; `let url = base.appendingPathComponent(name).standardizedFileURL.resolvingSymlinksInPath()`; `url.path.hasPrefix(base.path + "/")`가 아니면 거부.
    - Android: `File base = getContext().getFilesDir(); File f = new File(base, name);` `f.getCanonicalPath().startsWith(base.getCanonicalPath() + File.separator)`가 아니면 거부.
  - 비밀·토큰을 반환값이나 로그에 넣지 않는다.
- Rust 연산을 감싸는 플러그인은 `/hybrid:hybrid-rust` 2차 경로를 따른다.
