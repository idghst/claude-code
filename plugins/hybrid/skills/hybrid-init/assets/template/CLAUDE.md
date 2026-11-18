# {{PROJECT_NAME}}

{{APP_NAME}} (`{{APP_ID}}`) 하이브리드 앱. 전체 스펙은 `docs/SPEC.md`, 보안 대응은 `SECURITY.md`.

## 스택

| 항목 | 값 |
|---|---|
| 네이티브 껍데기 | Capacitor 8 (iOS WKWebView, Android System WebView) |
| 웹 | Svelte 5 (runes) + SvelteKit 3, `adapter-static` SPA (`fallback: 'index.html'`) |
| 빌드 | Vite. SvelteKit 설정은 `vite.config.ts`의 `sveltekit({...})` (svelte.config.js 없음) |
| 언어 | TypeScript strict. 내부 import는 확장자까지 쓴 `#lib/<경로>.ts` (예: `#lib/native/index.ts`) |
| 패키지 매니저 | npm (`package-lock.json`, CI는 `npm ci`) |

## 명령

```bash
npm run dev                 # 브라우저 개발 서버 (네이티브 기능은 웹 대체 동작)
npm run lint                # ESLint (보안 규칙 포함)
npm run check               # svelte-check 타입 검사
npm run build               # build/ 생성
npm run size                # 첫 화면 JS gzip 100KB 이하 확인
npm run build && npx cap sync   # 네이티브 프로젝트에 반영
npx cap open ios | android
```

## 규칙

- 어댑터: UI(`src/routes`, 컴포넌트)는 `@capacitor/*`·플러그인을 직접 import하지 않는다. `#lib/native/index.ts`의 `native`만 쓴다(ESLint가 막는다). 인터페이스는 `src/lib/native/types.ts`, 구현은 `src/lib/native/capacitor/<기능>.ts`. 새 네이티브 기능은 `/hybrid:hybrid-native`.
- 플러그인: 쓰는 것만 설치하고 안 쓰면 제거한다. 설치 후 `npx cap sync`.
- SPA 유지: `src/routes/+layout.ts`의 `ssr = false`, `prerender = false`를 바꾸지 않는다. `server.url`(원격 로드)을 설정하지 않는다.
- 저장: 토큰·개인정보를 `localStorage`·`sessionStorage`·IndexedDB에 두지 않는다. 액세스 토큰은 메모리, 리프레시 토큰은 `native.secureStorage` (`src/lib/security/tokens.ts`).
- API: `src/lib/api/client.ts`의 `api()`로만 호출한다(https, 앱 버전 헤더, 401 시 1회 갱신).
- 비밀: `VITE_*`는 번들에 그대로 들어간다. API 비밀 키를 넣지 않는다.
- CSP: `vite.config.ts`의 `csp`. 외부 도메인을 추가하면 이유를 남긴다. `{@html}`, `eval`, `new Function` 금지.
- 외부 링크는 `native.links.open(url)`(시스템 브라우저, https만)로 연다.
- 킬스위치: 원격으로 끌 수 있어야 하는 기능은 `isEnabled('<이름>')`(`#lib/security/config.svelte.ts`)로 감싼다.
- 무거운 연산(메인 스레드 50ms 이상)은 `src/lib/compute/` 인터페이스 뒤에 둔다. Rust가 필요하면 `/hybrid:hybrid-rust`.
- 네트워크: iOS ATS 예외를 추가하지 않는다. Android는 `network_security_config.xml`이 http를 막는다(라이브 리로드가 http면 debug 소스셋에만 예외를 둔다).

## 다음 단계

- `/hybrid:hybrid-native`: 네이티브 기능(카메라, 푸시 등) 추가
- `/hybrid:hybrid-security-audit`: 배포 전·변경 후 보안 점검
- `/hybrid:hybrid-incident`: 취약점 공지 대응 (SECURITY.md 런북)
- `/hybrid:hybrid-rust`: Rust(WASM/UniFFI) 연산 붙이기
