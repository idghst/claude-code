# 보안 대응 런북 ({{APP_NAME}})

전체 기준은 `docs/SPEC.md` 7~9장. 이 문서는 사고 때 바로 보는 요약이다.

## 1. 사전 준비 (출시 전)

| 장치 | 위치 |
|---|---|
| 원격 앱 설정 `GET /app-config` (서명 검증) | `src/lib/security/app-config.ts` |
| 강제 업데이트: `minVersion`보다 낮으면 차단 화면 + 스토어 링크 | `src/routes/+layout.svelte` |
| 기능 킬스위치: `features.<이름> = false` → `isEnabled('<이름>')`이 false | `src/lib/security/config.svelte.ts` |
| 공지 배너: `notice` | `src/routes/+layout.svelte` |
| 서버측 차단: 모든 API 요청에 `X-App-Version`, `X-App-Platform` 헤더 | `src/lib/api/client.ts` |

`/app-config` 실패 시 마지막 정상 값(보안 저장소 캐시), 없으면 기본값 `{ minVersion: '0.0.0', features: {} }`으로 동작한다.

### app-config 서명

응답 형식:

```json
{ "payload": "{\"minVersion\":\"1.2.0\",\"features\":{\"camera\":false},\"storeUrl\":{\"ios\":\"https://apps.apple.com/app/id000\",\"android\":\"https://play.google.com/store/apps/details?id={{APP_ID}}\"}}", "signature": "<base64>" }
```

- `payload`는 AppConfig JSON **문자열** 그대로 서명한다(다시 직렬화하지 않는다).
- 서명: ECDSA P-256 + SHA-256, IEEE P1363(r||s) 형식, base64.
- 비공개 키는 서버 비밀 저장소에만 둔다. 앱·저장소에 넣지 않는다.

키 쌍 만들기 (한 번):

```js
import crypto from 'node:crypto';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
console.log(publicKey.export({ type: 'spki', format: 'der' }).toString('base64')); // → .env의 VITE_APP_CONFIG_PUBLIC_KEY
console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }));                 // → 서버 비밀 저장소
```

서버에서 서명:

```js
import crypto from 'node:crypto';
const payload = JSON.stringify({ minVersion: '1.2.0', features: { camera: false } });
const signature = crypto.sign('sha256', Buffer.from(payload), { key: privateKeyPem, dsaEncoding: 'ieee-p1363' }).toString('base64');
// 응답: { payload, signature }
```

공개키가 비어 있으면 개발 모드에서만 서명 없이 받고, 운영 빌드는 원격 설정을 무시한다. 재전송(예전 서명 응답 재사용)은 아직 막지 않는다(`app-config.ts`의 `shortcut:` 참고).

## 2. 탐지

- GitHub Security Advisories / Dependabot 알림
- Capacitor 릴리스 노트·보안 공지, Android 보안 게시판, Apple 보안 업데이트
- RustSec 권고 (Rust 사용 시)
- 크래시·에러 수집 도구 이상 징후, 서버 로그 이상 트래픽

## 3. 대응 절차

1. **분류 (당일)**: CI 아티팩트 `sbom-cyclonedx`로 영향 버전 확인 → 실제 악용 가능한지 판단(스펙 7.3) → 등급(긴급/높음/보통/낮음).
2. **즉시 차단 (긴급·높음)**: 킬스위치로 기능 끄기, 필요하면 서버에서 취약 버전(`X-App-Version`) 요청 차단, 공지 배너 게시.
3. **수정**: 패치 업그레이드 또는 교체(스펙 7.2). 교체 범위는 `src/lib/native/capacitor/<기능>.ts` 한 파일이 기본. 회귀 테스트: 로그인, 핵심 플로우, 네이티브 기능.
4. **배포**: iOS 긴급 심사(expedited review) 요청, Android 전체 출시 검토. 배포 후 `minVersion` 상향.
5. **확인**: 신규 버전 점유율 모니터링, 킬스위치 해제 시점 결정.
6. **사후 정리**: 원인·영향·대응 시간·재발 방지책 기록, CI 규칙·CSP·의존성 정책 보강.

## 4. 등급별 목표 시간

| 등급 | 차단 | 패치 배포 |
|---|---|---|
| 긴급 (원격 코드 실행, 인증 우회, 데이터 유출) | 당일 | 72시간 이내 |
| 높음 | 24시간 이내 | 1주 이내 |
| 보통 | 해당 없음 | 다음 정기 릴리스 |
| 낮음 | 해당 없음 | 분기 점검 시 |

목표 시간은 조직 정책에 맞게 조정한다.
