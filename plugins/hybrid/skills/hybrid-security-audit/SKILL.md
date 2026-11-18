---
name: hybrid-security-audit
description: >
  Capacitor + SvelteKit 하이브리드 앱의 보안 점검. 정적 검사 스크립트로 원격 로드(server.url), 하드코딩 비밀·VITE_ 비밀 변수,
  src/lib/native/ 밖 플러그인 import, 웹뷰 디버깅·혼합 콘텐츠·평문 HTTP·ATS 해제, CSP 누락·unsafe script-src, 웹 저장소·eval,
  lockfile·CI 의존성 검사 누락, {@html}, 커스텀 URL 스킴, 미사용 플러그인을 파일:줄 단위로 찾고, 스크립트가 못 보는 부분은
  체크리스트로 직접 검토해 고친다.
when_to_use: >
  사용자가 Capacitor/하이브리드/Svelte 앱을 명시하거나 docs/SPEC.md(하이브리드 앱 스펙)를 언급하면서 "보안 점검", "보안 검토",
  "security audit", "배포 전 점검", "출시 전 점검"을 요청할 때, 그리고 hybrid-init·hybrid-native 작업을 마친 뒤.
  그 외 앱 요청은 전역 규칙(네이티브 SwiftUI/Compose)을 따르고 이 스킬을 쓰지 않는다.
argument-hint: "[project-dir]"
---

# 하이브리드 앱 보안 점검

근거는 프로젝트의 `docs/SPEC.md` 8장(보안 기본 통제)·7.1(어댑터)·12장(완료 기준)이다.

## 1. 정적 검사

```bash
node "${CLAUDE_SKILL_DIR}/scripts/audit.mjs" <project-dir>
```

`<project-dir>`는 인자로 받은 경로, 없으면 `.`.

`--json`으로 기계용 출력. 종료 코드: critical/high가 있으면 1, 없으면 0, 실행 오류는 2.
`node_modules`, `build`, `.svelte-kit`, `dist`, `Pods`, `.gradle` 등 생성물은 건너뛰고, `android/`·`ios/`는 설정 파일(AndroidManifest, `res/xml`, Info.plist, capacitor.config.json)만 본다.

| 규칙 | 심각도 | 내용 |
|---|---|---|
| `remote-server-url` | critical | capacitor.config에 `server.url` (원격 로드) |
| `hardcoded-secret` | critical | 개인키 PEM, `AKIA…`, `sk_live_…`, `ghp_…`, `xox?-…`, `sb_secret_…`가 커밋 대상 파일에 있음 |
| `public-secret-env` | critical | `VITE_` 변수 이름에 SECRET/PRIVATE/PASSWORD/SERVICE_ROLE |
| `native-import-outside-adapter` | high | `src/lib/native/` 밖에서 `@capacitor/*`·`@aparajita/*` import |
| `webview-debugging` | high | `webContentsDebuggingEnabled: true` |
| `mixed-content` | high | `allowMixedContent: true` |
| `cleartext-traffic` | high | `cleartext: true`, `cleartextTrafficPermitted="true"`, `usesCleartextTraffic="true"` |
| `ats-arbitrary-loads` | high | Info.plist `NSAllowsArbitraryLoads` = true |
| `no-csp` | high | `kit.csp`도 app.html CSP meta도 없음 |
| `unsafe-script-src` | high | `script-src`에 `'unsafe-eval'`·`'unsafe-inline'` (`'wasm-unsafe-eval'`은 허용) |
| `web-storage` | high | `src`의 `localStorage`/`sessionStorage`/`indexedDB` |
| `dynamic-code` | high | `src`의 `eval(`/`new Function(` |
| `no-lockfile` | high | `package-lock.json` 없음 |
| `html-tag` | medium | `{@html}` |
| `no-network-security-config` | medium | `android/`가 있는데 Manifest에 `networkSecurityConfig` 미연결 |
| `allow-backup` | medium | `android:allowBackup="true"` |
| `ats-exception` | medium | Info.plist `NSExceptionDomains` |
| `http-literal` | medium | `src`의 `http://` (localhost 제외) |
| `no-dependency-scan` | medium | CI 워크플로에 `npm audit` 또는 `osv-scanner` 없음 |
| `external-link` | medium | `target="_blank"`·`window.open` (`native.links.open` 권장) |
| `no-security-md` | low | `SECURITY.md` 없음 |
| `custom-url-scheme` | low | `CFBundleURLSchemes`, http(s)가 아닌 `android:scheme` → Universal/App Links 권장 |
| `unused-plugin` | low | `dependencies`의 플러그인을 `src/lib/native/`에서 안 씀 (core·cli·android·ios 제외) |

정규식 기반이라 오탐·누락이 있을 수 있다. `//`·`/* */`·`<!-- -->`·`#`(env·yml) 주석 줄은 무시한다. 각 발견 사항은 해당 줄을 읽고 실제 문제인지 판단한다.

## 2. 수동 검토 (스크립트가 못 보는 것)

해당 파일을 직접 읽고 확인한다.
1. **토큰 저장 흐름**: 액세스 토큰은 메모리만, 리프레시 토큰은 `native.secureStorage`(Keychain/Keystore)만 쓰는지. 갱신 응답의 새 리프레시 토큰으로 교체(회전)하는지. 로그아웃 시 지우는지.
2. **브리지 인자 재검증**: 커스텀 플러그인(UniFFI 포함)이 있으면 웹에서 넘어온 모든 인자를 네이티브 쪽에서 다시 검증하는지, 파일 경로 인자가 앱 샌드박스 밖을 가리키지 못하는지 (8.4).
3. **딥링크**: 딥링크 파라미터를 화이트리스트로 검증한 뒤 라우팅하는지 (8.5).
4. **app-config**: `/app-config` 응답 서명을 검증하는지, 운영 빌드에 `VITE_APP_CONFIG_PUBLIC_KEY`가 설정됐는지, 실패 시 마지막 정상값 → 기본값으로 폴백해 앱이 먹통 되지 않는지, `minVersion`·킬스위치가 실제로 화면을 막는지 (9.1).
5. **인증서 피닝**: 쓰는 경우 백업 핀이 2개 이상이고 강제 업데이트 경로가 있는지 (8.2).
6. **규제 대상 앱**: 금융·개인정보 등 해당하면 8.6 항목(루팅/탈옥 탐지, 무결성 검증, 난독화, 화면 캡처 방지, 기관 점검표) 반영 여부.
7. **의존성**: `npm audit --audit-level=high`와 `npx osv-scanner --lockfile=package-lock.json`을 직접 돌린다. Rust를 쓰면 `cargo audit`, `cargo deny check`도.
8. **운영 빌드 웹뷰 디버깅**: `capacitor.config.ts`뿐 아니라 `npx cap sync` 후 `android/app/src/main/assets/capacitor.config.json`, `ios/App/App/capacitor.config.json`에도 디버깅이 꺼져 있는지.
9. **웹 저장소 잔여물**: 개발 빌드에서만 iOS 시뮬레이터 + Safari 웹 인스펙터(또는 Android `chrome://inspect`)로 로그인 후 Local Storage·Session Storage·IndexedDB·쿠키에 토큰이 남지 않는지 확인한다. 운영 빌드는 디버깅이 꺼져 있어야 정상이다 (12장).

## 3. 수정과 보고

- critical/high는 바로 고친다. 비밀이 커밋됐으면 코드 수정과 별개로 **발급처에서 키를 폐기하고 새로 발급**하라고 사용자에게 분명히 알린다(git 기록에 남은 키는 지워도 유효하다). 앱 번들에 들어간 값은 이미 배포된 버전에서 추출될 수 있다고 가정한다.
- medium/low는 고칠 목록으로 보고하고, 사용자가 원하면 고친다.
- 고친 뒤 스크립트를 다시 돌려 종료 코드 0을 확인한다.

보고 형식: 심각도순 `파일:줄 — 문제 — 조치`, 마지막에 남은 항목과 수동 검토 결과.
