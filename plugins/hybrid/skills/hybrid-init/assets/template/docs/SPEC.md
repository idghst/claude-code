# 하이브리드 모바일 앱 스펙 (Capacitor + Svelte + 선택적 Rust)

> Claude Code 작업 지시용 스펙 문서임.
> 미정 항목(0장)은 구현 전에 사용자에게 먼저 확인할 것.

---

## 0. 미정 항목 (구현 전 확인 필요)

- 앱 이름, 번들 ID (예: `com.example.app`)
- 백엔드 API 주소와 인증 방식 (JWT, 세션, OAuth 등)
- 필요한 네이티브 기능 목록 (카메라, 푸시, 파일, 생체인증 등)
- 금융·개인정보 등 규제 대상 앱인지 여부 (해당 시 8.6절 추가 요건 적용)
- 최소 지원 OS 버전

---

## 1. 목표

- 네이티브 껍데기 + 시스템 웹뷰로 iOS/Android 동시 제공
- 가볍고 빠른 첫 화면, 끊김 없는 스크롤과 화면 전환
- 보안 취약점 발생 시 **빠르게 차단·패치·교체** 가능한 구조
- 무거운 연산이 생기면 Rust를 붙일 수 있는 확장 지점 확보 (현재는 미사용)

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 네이티브 껍데기 | Capacitor (최신 안정 버전) | iOS WKWebView, Android System WebView 사용 |
| 웹 프레임워크 | Svelte 5 + SvelteKit (`adapter-static`, SPA 모드) | 대안: SolidJS + Vite |
| 빌드 | Vite | |
| 언어 | TypeScript (strict) | |
| 상태관리 | Svelte 기본 store / runes | 외부 라이브러리 최소화 |
| 무거운 연산 (선택) | Rust → WebAssembly (`wasm-pack`) + Web Worker | 1차 확장 경로 |
| 무거운 연산 (선택) | Rust → UniFFI → Capacitor 커스텀 플러그인 | 2차 확장 경로 |

- 버전은 설치 시점의 최신 안정 버전을 쓰고 `package-lock.json`, `Cargo.lock`으로 고정함.

---

## 3. 아키텍처

```
┌──────────────── 네이티브 앱 (iOS / Android) ────────────────┐
│  Capacitor 런타임 + 플러그인 (카메라, 푸시, 보안 저장소 등)    │
│  ┌──────────────── 시스템 웹뷰 ────────────────┐             │
│  │  Svelte SPA (앱 번들에 포함, 로컬 로드)       │             │
│  │   └─ src/lib/native/  ← 네이티브 호출 단일 창구 │             │
│  │   └─ src/lib/compute/ ← (선택) WASM/Worker    │             │
│  └─────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────┘
                     │ HTTPS (API 통신만)
                     ▼
                 백엔드 API
```

### 3.1 핵심 원칙

- 웹 리소스는 **앱 번들에 포함**하고 원격 URL을 웹뷰에 로드하지 않음
- 서버와는 **API 통신만** 함
- UI 코드는 `@capacitor/*`를 직접 import하지 않음. 반드시 `src/lib/native/` 어댑터를 거침 (교체 용이성 확보, 7장 참고)
- 무거운 연산은 `src/lib/compute/` 인터페이스 뒤에 숨김

---

## 4. 디렉터리 구조

```
app/
├─ src/
│  ├─ routes/                 # SvelteKit 라우트
│  ├─ lib/
│  │  ├─ native/              # 네이티브 기능 어댑터 (인터페이스 + 구현)
│  │  │  ├─ types.ts          # 인터페이스 정의
│  │  │  ├─ capacitor/        # Capacitor 구현체
│  │  │  └─ index.ts          # 구현체 선택·export
│  │  ├─ security/            # 토큰 저장, 앱 설정(킬스위치), 강제 업데이트
│  │  ├─ api/                 # API 클라이언트
│  │  └─ compute/             # (선택) WASM / 네이티브 연산 어댑터
│  └─ app.html                # CSP meta 포함
├─ static/
├─ rust/                      # (선택) Rust 크레이트
├─ android/                   # cap add android 결과
├─ ios/                       # cap add ios 결과
├─ capacitor.config.ts
├─ SECURITY.md                # 보안 대응 런북 요약 (9장 기반)
└─ package.json
```

---

## 5. 초기 세팅

```bash
npx sv create app --template minimal --types ts
cd app
npm i -D @sveltejs/adapter-static
npm i @capacitor/core
npm i -D @capacitor/cli
npx cap init "AppName" "com.example.app" --web-dir build
npm i @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npm i @capacitor/splash-screen @capacitor/app
npm run build && npx cap sync
```

`svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({ fallback: 'index.html' })
  }
};
```

`src/routes/+layout.ts`:

```ts
export const ssr = false;
export const prerender = false;
```

`capacitor.config.ts` (운영 기준):

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'AppName',
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
    SplashScreen: { launchAutoHide: false }
  }
};

export default config;
```

---

## 6. 성능 요구사항

- 첫 화면 JS 번들(gzip) 100KB 이하 목표
- 라우트 단위 코드 분할, 첫 화면에 필요 없는 화면은 지연 로드
- 스플래시는 첫 화면 렌더 완료 후 `SplashScreen.hide()` 호출 (흰 화면 깜빡임 방지)
- 애니메이션은 `transform`, `opacity`만 사용
- 긴 목록은 가상 스크롤 적용
- 이미지: WebP/AVIF, `loading="lazy"`, 크기 명시
- 메인 스레드 50ms 이상 작업 금지 → Web Worker로 이동
- 폰트는 번들 포함 + `font-display: swap`

---

## 7. 교체 가능 구조 (보안 이슈 대비)

보안 취약점이 생긴 구성요소를 **한 폴더만 고쳐서** 교체할 수 있게 설계함.

### 7.1 어댑터 패턴

```ts
// src/lib/native/types.ts
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface CameraService {
  takePhoto(): Promise<Blob>;
}

export interface NativeServices {
  secureStorage: SecureStorage;
  camera: CameraService;
}
```

```ts
// src/lib/native/index.ts
import type { NativeServices } from './types';
import { capacitorServices } from './capacitor';

// 구현체 교체 시 이 한 줄만 변경
export const native: NativeServices = capacitorServices;
```

- ESLint `no-restricted-imports` 규칙으로 `src/lib/native/` 밖에서 `@capacitor/*` import를 금지함
- Rust 연산도 같은 방식으로 `src/lib/compute/types.ts` 인터페이스 뒤에 둠

### 7.2 구성요소별 교체 후보

| 구성요소 | 1차 대응 | 교체 후보 | 교체 범위 |
|---|---|---|---|
| Capacitor 플러그인 (서드파티) | 패치 버전 업그레이드 | 공식 플러그인 → 직접 작성한 커스텀 플러그인 | `src/lib/native/capacitor/` 내 해당 파일 |
| Capacitor 코어 | 패치 업그레이드 | Tauri 2 모바일, 또는 WKWebView/WebView 직접 감싼 자체 껍데기 | `src/lib/native/` 구현체 + 네이티브 프로젝트 |
| 시스템 웹뷰 취약점 | OS/WebView 업데이트 유도, 최소 버전 차단 | 교체 불가 (OS 소관) → 기능 차단으로 완화 | 서버 설정 + 강제 업데이트 |
| Svelte/Vite/npm 의존성 | 패치 업그레이드 | SolidJS 등 (UI 계층만 영향) | `src/routes`, 컴포넌트 |
| Rust 크레이트 | 패치 업그레이드 | 대체 크레이트, 또는 JS 구현으로 임시 폴백 | `rust/`, `src/lib/compute/` |
| UniFFI 바인딩 | 패치 업그레이드 | 수동 FFI(C ABI) + JNI/Swift 래퍼 | 커스텀 플러그인 |

### 7.3 교체 판단 기준

```
취약점 공지
  ├─ 우리 앱에서 실제 악용 가능한가? (해당 기능·코드 경로 사용 여부)
  │    └─ 아니오 → 기록 후 정기 업데이트에 포함
  └─ 예
       ├─ 패치 버전 있음 → 업그레이드 (9장 절차)
       ├─ 패치 없음 + 우회 가능 → 완화조치 (킬스위치, CSP 강화, 서버 차단)
       └─ 패치 없음 + 장기 방치 or 유지보수 중단 → 7.2 교체 후보로 전환
```

- 메인테이너가 6개월 이상 응답 없거나 보안 패치를 안 내면 "유지보수 중단"으로 판단하고 교체 계획 수립

---

## 8. 보안 기본 통제 (구현 필수)

### 8.1 웹뷰

- `app.html`에 CSP 적용:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self';
           script-src 'self' 'wasm-unsafe-eval';
           style-src 'self' 'unsafe-inline';
           img-src 'self' data: blob: https:;
           connect-src 'self' https://api.example.com;
           object-src 'none';
           base-uri 'self';
           frame-ancestors 'none'">
```

- `{@html}` 사용 금지. 불가피하면 DOMPurify로 정제
- `eval`, `new Function` 금지
- 외부 링크는 웹뷰 안이 아니라 시스템 브라우저로 열기
- 운영 빌드에서 웹뷰 디버깅 비활성화 (5장 config)

### 8.2 네트워크

- HTTPS만 허용
  - iOS: ATS 기본값 유지, 예외 추가 금지
  - Android: `network_security_config.xml`에 `cleartextTrafficPermitted="false"`
- (선택, 고보안 앱) 인증서 피닝. 단, 인증서 교체 시 앱이 먹통이 되지 않도록 백업 핀 2개 이상 + 강제 업데이트 경로 확보

### 8.3 인증 정보 저장

- 토큰을 `localStorage`, `sessionStorage`, IndexedDB에 저장 금지
- iOS Keychain / Android Keystore 기반 보안 저장소 플러그인 사용 (`SecureStorage` 어댑터 경유)
- 앱 번들(JS)에 API 비밀키 포함 금지 → JS는 누구나 추출 가능하다고 가정
- 액세스 토큰은 짧게, 리프레시 토큰은 회전(rotation) 적용

### 8.4 네이티브 브리지

- 사용하는 플러그인만 설치, 미사용 플러그인 제거
- 커스텀 플러그인은 웹에서 넘어온 모든 인자를 네이티브 쪽에서 재검증
- 파일 경로 인자는 앱 샌드박스 밖 접근 차단

### 8.5 딥링크

- 커스텀 스킴보다 Universal Links(iOS) / App Links(Android) 사용
- 딥링크 파라미터는 화이트리스트 검증 후 라우팅

### 8.6 규제 대상 앱 추가 요건 (0장에서 해당 시)

- 루팅/탈옥 탐지
- 앱 위변조(무결성) 검증
- 코드 난독화 (Android R8, iOS 및 JS 번들 난독화)
- 화면 캡처 방지 (민감 화면)
- 소속 기관·감독기관 보안 가이드 기준 점검표를 별도로 받아 반영

### 8.7 공급망 보안

- `npm ci`로만 설치 (lockfile 기준)
- CI에서 매 빌드마다 실행:

```bash
npm audit --audit-level=high
npx osv-scanner --lockfile=package-lock.json
# Rust 사용 시
cargo audit
cargo deny check
```

- Dependabot 또는 Renovate로 의존성 업데이트 PR 자동 생성
- 릴리스마다 SBOM(CycloneDX) 생성·보관 → 취약점 공지 시 영향 여부 즉시 조회
- 신규 의존성 추가 기준: 주간 다운로드, 최근 커밋, 메인테이너 수, 보안 이력 확인

---

## 9. 보안 이슈 대응 런북

### 9.1 사전 준비 (출시 전 반드시 구현)

| 장치 | 내용 |
|---|---|
| 원격 앱 설정 API | 앱 시작 시 `GET /app-config` 호출, 아래 값 수신 |
| 강제 업데이트 | `minVersion`보다 낮으면 차단 화면 + 스토어 링크 |
| 기능 킬스위치 | `features: { camera: false, ... }` 로 기능 단위 원격 비활성화 |
| 공지 배너 | `notice` 필드로 앱 내 긴급 공지 |
| 서버측 차단 | 특정 앱 버전의 API 요청 거부 (헤더에 앱 버전 포함) |

```ts
// src/lib/security/app-config.ts
export interface AppConfig {
  minVersion: string;
  features: Record<string, boolean>;
  notice?: { level: 'info' | 'critical'; message: string };
}
```

- `/app-config` 응답 실패 시: 마지막 정상 값 사용, 없으면 기본값으로 동작 (앱이 먹통 되지 않게)
- 응답은 서명 검증 또는 피닝된 채널로 받아 위조 방지

### 9.2 탐지 (모니터링 대상)

- GitHub Security Advisories (Dependabot 알림)
- Capacitor 릴리스 노트 / 보안 공지
- Android 보안 게시판, Apple 보안 업데이트
- RustSec 권고 (Rust 사용 시)
- 앱 크래시·에러 수집 도구의 이상 징후, 서버 로그 이상 트래픽

### 9.3 대응 절차

1. **분류 (공지 확인 후 당일)**
   - SBOM으로 영향받는 버전 확인
   - 실제 악용 가능 여부 판단 (7.3)
   - 등급 부여: 긴급 / 높음 / 보통 / 낮음

2. **즉시 차단 (긴급·높음)**
   - 킬스위치로 해당 기능 비활성화
   - 필요 시 서버에서 취약 버전 요청 차단
   - 앱 내 공지 배너 게시

3. **수정**
   - 패치 업그레이드 또는 7.2 교체
   - 회귀 테스트: 로그인, 결제/핵심 플로우, 네이티브 기능

4. **배포**
   - iOS: 앱스토어 심사 시 긴급 심사(expedited review) 요청
   - Android: Play Console 단계적 출시 대신 전체 출시 검토
   - 배포 완료 후 `minVersion` 상향 → 구버전 강제 업데이트

5. **확인**
   - 신규 버전 점유율 모니터링
   - 킬스위치 해제 시점 결정

6. **사후 정리**
   - 원인, 영향 범위, 대응 시간, 재발 방지책 기록
   - 필요 시 CI 검사 규칙·CSP·의존성 정책 보강

### 9.4 등급별 목표 시간

| 등급 | 차단 | 패치 배포 |
|---|---|---|
| 긴급 (원격 코드 실행, 인증 우회, 데이터 유출) | 당일 | 72시간 이내 |
| 높음 | 24시간 이내 | 1주 이내 |
| 보통 | 해당 없음 | 다음 정기 릴리스 |
| 낮음 | 해당 없음 | 분기 점검 시 |

- 목표 시간은 조직 정책에 맞게 조정

---

## 10. 일반 이슈 대응 (참고)

| 증상 | 점검 항목 |
|---|---|
| 시작 시 흰 화면 | `webDir` 경로, `npx cap sync` 누락, 스플래시 숨김 시점, CSP 위반 콘솔 로그 |
| 스크롤 끊김 | 레이아웃 유발 애니메이션, 긴 목록 가상 스크롤 미적용, 큰 이미지 |
| 특정 Android 기기만 오류 | 시스템 WebView 버전 확인, 최소 버전 미만이면 업데이트 안내 |
| iOS만 오류 | WKWebView 미지원 웹 API 사용 여부, Safari 원격 디버깅(개발 빌드)으로 확인 |
| 플러그인 호출 실패 | 권한 선언(Info.plist, AndroidManifest), 플러그인 버전과 코어 버전 호환 |

---

## 11. Rust 확장 (필요 시)

### 11.1 1차: WebAssembly + Web Worker

```bash
cargo install wasm-pack
cd rust/compute
wasm-pack build --target web --release
```

- 생성된 `pkg/`를 Worker 안에서 import
- `src/lib/compute/` 어댑터로 감싸서 UI는 인터페이스만 호출
- CSP `script-src`에 `'wasm-unsafe-eval'` 필요 (8.1에 반영됨)

### 11.2 2차: 네이티브 라이브러리 (UniFFI)

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-ndk
```

- UniFFI로 Swift/Kotlin 바인딩 생성
- iOS는 XCFramework, Android는 `.so` + AAR로 패키징
- Capacitor 커스텀 플러그인으로 감싸서 웹에 노출
- 브리지 인자 재검증 규칙(8.4) 동일 적용

---

## 12. 완료 기준

- [ ] iOS 시뮬레이터, Android 에뮬레이터에서 실행 확인
- [ ] 첫 화면 번들 크기 목표 충족 (6장)
- [ ] `src/lib/native/` 밖에서 `@capacitor/*` import 시 린트 실패
- [ ] CSP 적용, 운영 빌드 웹뷰 디버깅 비활성화 확인
- [ ] 토큰이 웹 저장소에 남지 않음 확인
- [ ] `/app-config` 기반 강제 업데이트·킬스위치 동작 확인 (서버 응답 실패 시 폴백 포함)
- [ ] CI에서 `npm audit`, `osv-scanner` 통과
- [ ] SBOM 생성 확인
- [ ] `SECURITY.md`에 9장 런북 요약 작성
