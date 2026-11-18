---
name: hybrid-init
description: >
  Capacitor 8 + Svelte 5/SvelteKit 3(adapter-static SPA) + TypeScript + npm 하이브리드 모바일 앱을 스펙(docs/SPEC.md)의
  보안 기본값과 함께 새로 만든다. 네이티브 어댑터(src/lib/native), Keychain/Keystore 토큰 저장, 서명 검증 원격 설정
  (강제 업데이트·킬스위치·공지), CSP, ESLint 보안 규칙, Android HTTPS 강제, 첫 화면 번들 100KB 예산,
  CI(npm audit·osv-scanner·SBOM)까지 넣고 린트·타입·빌드·cap sync·iOS 시뮬레이터 실행으로 검증한다.
when_to_use: >
  사용자가 Capacitor/하이브리드/Svelte 모바일 앱을 명시하거나 이 하이브리드 앱 스펙을 언급하며 새 프로젝트를 만들 때만
  ("Capacitor 앱 만들어줘", "하이브리드 앱 초기화", "Svelte로 iOS·Android 앱"). 그 외 앱 요청은 전역 규칙(네이티브
  SwiftUI/Compose)을 따른다. 기존 프로젝트 수정에는 쓰지 않는다.
argument-hint: "[project-name]"
---

# 하이브리드 앱 프로젝트 초기화

고정 스택으로 프로젝트를 만든다. 코드는 `assets/template/`의 실제 파일을 스크립트로 복사하므로 매번 같은 결과가 나온다. 템플릿 코드를 손으로 다시 쓰지 않는다. 근거 스펙은 템플릿의 `docs/SPEC.md`(프로젝트에 그대로 복사된다).

| 항목 | 값 |
|---|---|
| 네이티브 껍데기 | Capacitor 8 (iOS는 SPM, CocoaPods 불필요) |
| 웹 | Svelte 5 + SvelteKit 3, `adapter-static` SPA. Kit 설정은 `vite.config.ts` 안의 `sveltekit({...})` (svelte.config.js 없음) |
| 언어 | TypeScript strict. 내부 import는 `#lib/<경로>.ts` (확장자 필수) |
| 패키지 매니저 | npm (`package-lock.json`, `npm ci`) |
| 기본 플러그인 | `@capacitor/app`, `@capacitor/splash-screen`, `@capacitor/browser`, `@aparajita/capacitor-secure-storage` |

## 0. 사전 확인 (스펙 0장)

1. 환경: `node -v`가 22.17 이상, `npm -v`, iOS용 `xcodebuild -version`. Android 빌드는 Android Studio(SDK·Java)가 있을 때만 한다. 없으면 `cap add/sync`까지만 하고 보고한다.
2. 미정 항목을 AskUserQuestion으로 **하나씩**, 추천 답을 첫 선택지로 묻는다. 답을 받은 뒤 다음 질문으로 넘어간다.
   1. **앱 이름**(표시명)과 프로젝트 폴더 이름. 인자 `$ARGUMENTS`가 있으면 폴더 이름으로 쓴다. 폴더 이름은 소문자·숫자·하이픈. 현재 디렉터리 아래 `<name>/`이 이미 있으면 멈추고 알린다.
   2. **번들 ID**. 추천: `kr.co.idghst.<앱 영문 이름을 소문자 영숫자로만 붙인 것>`(예: Hello App → `kr.co.idghst.helloapp`). 스토어에 올린 뒤에는 바꿀 수 없다고 알린다.
   3. **API 주소와 인증 방식**. 주소는 경로 없는 https 출처(예: `https://api.example.com`). 아직 없으면 `https://api.example.com`으로 두고 보고에 남긴다. 인증 추천: JWT 액세스 + 리프레시 토큰(Bearer). 템플릿은 `POST /auth/refresh {refreshToken} → {accessToken, refreshToken}`을 가정한다. 세션 쿠키는 웹뷰 출처(`capacitor://localhost`)와 API 출처가 달라 권하지 않는다. 다른 방식이면 init 뒤 `src/lib/api/client.ts`의 `refresh()`와 `src/lib/security/tokens.ts`를 고친다.
   4. **필요한 네이티브 기능**(카메라, 푸시, 파일, 생체인증 등). 지금 설치하지 않는다. 목록만 받아 두고 init 뒤 기능마다 `/hybrid:hybrid-native`로 추가한다(스펙 8.4: 쓰는 플러그인만).
   5. **규제 대상(금융·개인정보 등) 여부**. 추천: 아니오. 예라면 init은 그대로 진행하고, 보고에 스펙 8.6 추가 작업(루팅/탈옥 탐지, 앱 위변조 검증, 난독화(Android R8, iOS·JS 번들), 민감 화면 캡처 방지)을 미이행 목록으로 적고, 소속 기관·감독기관 보안 점검표를 달라고 요청한다.
   6. **최소 지원 OS**. 추천: Capacitor 8 최소치 그대로(iOS 15, Android 7.0 = API 24). 더 낮으면 Capacitor 8로는 불가하다고 알리고 다시 고르게 한다. 더 높으면 4단계에서 올린다.

이 외에는 묻지 않고 아래 순서대로 끝까지 진행한다.

## 1. SvelteKit 프로젝트 생성

프롬프트가 뜨지 않도록 옵션을 모두 주고 stdin을 막는다.

```bash
npx sv@latest create <name> --template minimal --types ts --add eslint "sveltekit-adapter=adapter:static" --install npm </dev/null
cd <name>
```

## 2. Capacitor 설치와 네이티브 프로젝트 생성

```bash
npm i @capacitor/core @capacitor/app @capacitor/splash-screen @capacitor/browser @aparajita/capacitor-secure-storage
npm i -D @capacitor/cli
npx cap init "<앱 이름>" <번들 ID> --web-dir build </dev/null
npm i @capacitor/android @capacitor/ios
npx cap add android </dev/null
npx cap add ios </dev/null
```

`sync could not run--missing build directory` 경고는 정상이다(5단계에서 빌드 후 sync).

## 3. 템플릿 적용

```bash
node "${CLAUDE_SKILL_DIR}/scripts/apply-template.mjs" . --name <name> --app-name "<앱 이름>" --app-id <번들 ID> --api-origin <https 출처>
```

스크립트가 하는 일:
- 입력 검증(번들 ID 형식, 경로 없는 https 출처, 앱 이름에 따옴표·중괄호·꺾쇠 금지)과 전제 확인(필수 패키지, `ios/`·`android/`, `capacitor.config.ts`의 appId 일치).
- `assets/template/` 복사와 `{{PROJECT_NAME}}`·`{{APP_NAME}}`·`{{APP_ID}}`·`{{API_ORIGIN}}` 치환. sv·cap init 기본 파일(`vite.config.ts`, `eslint.config.js`, `capacitor.config.ts`, `src/app.html`, `src/routes/+layout.svelte`, `+page.svelte`)만 덮어쓰고, 다른 파일이 이미 있으면 아무것도 쓰지 않고 멈춘다.
- `AndroidManifest.xml`에 `networkSecurityConfig` 연결, `allowBackup="false"`.
- `package.json`에 `size` 스크립트, `.env`가 없으면 `.env.example`로 생성, `.gitignore`에 `.env*`·`!.env.example` 보장.

`✘`로 끝나면 메시지대로 앞 단계를 고친 뒤 다시 실행한다.

생성되는 주요 파일:

| 파일 | 역할 |
|---|---|
| `src/lib/native/{types,index}.ts`, `capacitor/*.ts` | 네이티브 어댑터. 교체는 `index.ts` 한 줄, 플러그인 교체는 해당 파일 하나 |
| `src/lib/security/app-config.ts` | `/app-config` ECDSA 서명 검증, 캐시 → 기본값 폴백 (의존성 주입, `node --test` 가능) |
| `src/lib/security/config.svelte.ts` | 현재 설정 상태, 킬스위치 `isEnabled(name)` |
| `src/lib/security/tokens.ts`, `src/lib/api/client.ts` | 토큰(메모리·보안 저장소, 회전), API 래퍼(https, 앱 버전 헤더, 401 시 1회 갱신) |
| `src/routes/+layout.svelte` | 캐시 설정으로 첫 렌더 → 스플래시 숨김 → 원격 설정, 강제 업데이트 화면·공지 배너 |
| `vite.config.ts` | adapter-static SPA + CSP(hash 모드, `build/index.html`에 meta) |
| `eslint.config.js` | 어댑터 밖 `@capacitor/*` import, 웹 저장소, `eval`, `{@html}` 금지 |
| `scripts/check-bundle.mjs` | 첫 화면 JS gzip 100KB 예산 (`npm run size`) |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` | lint·check·build·size·audit·osv-scanner·SBOM, 의존성 갱신 PR |
| `SECURITY.md`, `CLAUDE.md`, `docs/SPEC.md` | 런북·app-config 서명 방법, 프로젝트 규칙, 원 스펙 |

## 4. 최소 OS 올리기 (0단계에서 기본값보다 높게 정한 경우만)

- iOS: `sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = 15.0;/IPHONEOS_DEPLOYMENT_TARGET = <버전>;/' ios/App/App.xcodeproj/project.pbxproj` (`CapApp-SPM/Package.swift`는 CLI가 관리하므로 고치지 않는다).
- Android: `android/variables.gradle`의 `minSdkVersion = 24`를 원하는 API 레벨로 바꾼다.

## 5. 검증

모두 통과해야 끝난다. 실패하면 원인을 고치고 다시 돌린다. 템플릿 결함이면 사용자에게 알린다.

```bash
npm run lint && npm run check && npm run build && npm run size && npx cap sync
node "${CLAUDE_PLUGIN_ROOT}/skills/hybrid-security-audit/scripts/audit.mjs" .
```

린트 가드 확인(스펙 12장). 반드시 실패해야 하고, 확인 후 지운다:

```bash
printf "import { App } from '@capacitor/app';\nvoid App;\nlocalStorage.setItem('t', 'x');\n" > src/routes/lint-probe.ts
npx eslint src/routes/lint-probe.ts; echo "exit=$?"   # exit=1, no-restricted-imports·no-restricted-globals 오류
rm src/routes/lint-probe.ts
```

CSP 확인: 인라인 부트스트랩 스크립트 해시가 meta CSP에 들어 있어야 한다(`MATCH`).

```bash
node -e 'const h=require("fs").readFileSync("build/index.html","utf8");const csp=/content-security-policy" content="([^"]+)"/.exec(h)[1];console.log(csp);for(const [,s] of h.matchAll(/<script>([\s\S]*?)<\/script>/g)){const d="sha256-"+require("crypto").createHash("sha256").update(s).digest("base64");console.log(d,csp.includes(d)?"MATCH":"MISSING")}'
```

iOS 시뮬레이터 실행. `xcodebuild`·`simctl`은 CoreSimulator 접근 때문에 샌드박스 밖에서 실행해야 한다. `CODE_SIGNING_ALLOWED=NO`를 넣지 않는다(서명이 없으면 Keychain이 `-34018`로 실패해 보안 저장소가 안 된다).

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$TMPDIR/<name>-dd" build
xcrun simctl list devices booted            # 부팅된 기기가 있으면 그 UDID를 재사용
xcrun simctl boot "<기기 이름>"              # 없을 때만. 화면은 open -a /Applications/Xcode.app/Contents/Applications/DeviceHub.app
xcrun simctl install <UDID> "$TMPDIR/<name>-dd/Build/Products/Debug-iphonesimulator/App.app"
xcrun simctl launch <UDID> <번들 ID>
sleep 10 && xcrun simctl io <UDID> screenshot "$TMPDIR/<name>.png"
```

스크린샷을 Read로 열어 흰 화면이 아니고 홈 화면 문구가 보이는지 확인한다. 설치 직후 첫 실행은 웹뷰 준비로 5초 넘게 흰 화면일 수 있으니, 흰 화면이면 몇 초 뒤 한 번 더 찍는다. 그래도 흰 화면이면 스펙 10장(webDir, `cap sync` 누락, 스플래시, CSP 위반)을 점검한다.

Android: SDK가 있으면 `cd android && ./gradlew assembleDebug`, 없으면 `cap sync`까지만 확인하고 미검증으로 보고한다.

## 6. 보고

사용자에게 다음을 알린다.
1. `.env`의 `VITE_APP_CONFIG_PUBLIC_KEY`: SECURITY.md대로 키 쌍을 만들어 공개키를 넣는다. 비어 있으면 운영 빌드는 원격 설정을 무시한다(캐시·기본값만 사용).
2. 서버가 구현할 계약: `GET /app-config`(서명 응답 `{payload, signature}`), `POST /auth/refresh`, `X-App-Version`·`X-App-Platform` 헤더 기반 버전 차단.
3. 0단계에서 받은 네이티브 기능 목록 → 기능마다 `/hybrid:hybrid-native`. 규제 대상이면 8.6 미이행 목록과 기관 점검표 요청.
4. 화면 디자인(안전 영역, 스타일)은 템플릿에 없다. 첫 화면 작업 때 정한다.
5. sv는 git 저장소를 만들지 않는다. `git init` 후 GitHub에 올리면 CI가 돈다. 커밋은 사용자가 요청할 때만 한다.
6. 다음 단계: `/hybrid:hybrid-native`, `/hybrid:hybrid-security-audit`, 사고 대응은 `/hybrid:hybrid-incident`, 무거운 연산은 `/hybrid:hybrid-rust`.
7. 검증하지 못한 항목(예: Android 빌드·에뮬레이터)과 이유.
