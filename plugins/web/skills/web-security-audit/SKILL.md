---
name: web-security-audit
description: >
  Next.js + Supabase 프로젝트의 보안 점검. 정적 검사 스크립트로 비밀 키 노출(NEXT_PUBLIC_, 하드코딩), 클라이언트의 admin 클라이언트 사용,
  server-only 누락, 서버 getSession, 인증 없는 보호 페이지·Server Action, RLS 미적용 테이블, FOR ALL 정책, user_metadata 인가,
  CSP·.gitignore 누락을 파일:줄 단위로 찾고, 스크립트가 못 보는 부분은 체크리스트로 직접 검토해 고친다.
when_to_use: >
  "보안 점검", "보안 검토", "security audit", "배포 전 점검", "RLS 확인", "키 노출 확인" 등을 요청받았을 때,
  그리고 nextjs-init·supabase-table·nextjs-feature 작업을 마친 뒤.
argument-hint: "[project-dir]"
---

# 웹 보안 점검

## 1. 정적 검사

```bash
node "${CLAUDE_SKILL_DIR}/scripts/audit.mjs" <project-dir>
```

`<project-dir>`는 인자로 받은 경로, 없으면 `.`.

`--json`으로 기계용 출력. 종료 코드: critical/high가 있으면 1, 없으면 0, 실행 오류는 2.

| 규칙 | 심각도 | 내용 |
|---|---|---|
| `public-secret-env` | critical | `NEXT_PUBLIC_`에 SECRET/SERVICE_ROLE/PRIVATE/PASSWORD |
| `hardcoded-secret-key` | critical | `sb_secret_…` 실제 키가 커밋 대상 파일에 있음 |
| `admin-in-client` | critical | `"use client"` 파일에서 admin 클라이언트·secret 키 사용 |
| `secret-without-server-only` | high | secret 키를 읽는 파일에 `import "server-only"` 없음 |
| `server-get-session` | high | 서버 코드의 `getSession()` |
| `protected-page-no-auth` | high | `(protected)` 페이지에 `requireUser()`/`getClaims()` 없음 |
| `table-without-rls` | high | 마이그레이션의 테이블에 RLS 미적용 |
| `user-metadata-authz` | high | SQL에서 `user_metadata` 사용 |
| `env-not-ignored` | high | `.gitignore`에 `.env*` 없음 |
| `protected-page-cacheable` | medium | 보호 페이지에 `force-dynamic` 없음 |
| `server-action-no-auth` | medium | `(auth)` 밖 Server Action 파일에 인증 확인 없음 |
| `policy-for-all` | medium | `FOR ALL` 정책 |
| `definer-no-search-path` | medium | `security definer` 함수에 `search_path` 없음 |
| `no-proxy` / `no-csp` | medium | proxy 또는 CSP 없음 |
| `dangerous-html` | medium | `dangerouslySetInnerHTML` |
| `uid-not-wrapped` | low | `auth.uid()`를 `(select auth.uid())`로 안 감쌈 |
| `middleware-deprecated` | low | `middleware.ts` (Next 16은 `proxy.ts`) |
| `powered-by-header` | low | `poweredByHeader: false` 없음 |

정규식 기반이라 오탐·누락이 있을 수 있다. 각 발견 사항은 해당 줄을 읽고 실제 문제인지 판단한다.

## 2. 수동 검토 (스크립트가 못 보는 것)

해당 파일을 직접 읽고 확인한다.
1. **Server Action 인가**: `requireUser()` 뒤에 "이 사용자가 이 행을 바꿔도 되는가"를 RLS 또는 코드가 보장하는지. `createAdminClient()` 사용처는 RLS를 우회하므로 소유권을 코드로 검사하는지.
2. **입력 검증**: Server Action·Route Handler가 `unknown` 입력을 zod로 `safeParse`하는지. id 파라미터는 `z.uuid()`.
3. **리다이렉트**: 사용자 입력(`next`, `redirect_to` 등)으로 리다이렉트하는 곳이 같은 사이트 경로(`/`로 시작, `//` 아님)만 허용하는지.
4. **RLS 정책 의미**: `using`과 `with check`가 둘 다 있는지(update), `to authenticated`/`anon` 대상이 맞는지, public-read 테이블에 민감 컬럼이 없는지.
5. **Supabase 원격 설정**: Supabase MCP가 있으면 `get_advisors`(type: security)를 돌려 결과를 함께 보고한다. 없으면 대시보드 Advisors를 확인하라고 안내한다.
6. **의존성**: `pnpm audit --prod`로 알려진 취약점을 확인한다.
7. **에러 노출**: 사용자에게 돌려주는 에러 메시지에 DB 오류 원문·스택이 들어가지 않는지.

## 3. 수정과 보고

- critical/high는 바로 고친다. 키가 노출됐으면 코드 수정과 별개로 **Supabase 대시보드에서 키를 폐기하고 새로 발급**하라고 사용자에게 분명히 알린다(git 기록에 남은 키는 지워도 유효하다).
- medium/low는 고칠 목록으로 보고하고, 사용자가 원하면 고친다.
- 고친 뒤 스크립트를 다시 돌려 종료 코드 0을 확인한다.

보고 형식: 심각도순 `파일:줄 — 문제 — 조치`, 마지막에 남은 항목과 수동 검토 결과.
