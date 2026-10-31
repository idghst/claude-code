---
name: web-feature
description: >
  Supabase 테이블 하나에 대한 로그인 필요 화면을 만든다: zod 스키마, 목록 페이지(Server Component), 생성 폼(react-hook-form + shadcn field),
  생성·삭제 Server Action. requireUser(), force-dynamic, 서버 측 재검증, RLS 의존 규칙이 자동으로 들어간다. web-init 프로젝트 기준.
when_to_use: >
  "게시판/목록/CRUD 화면 만들어줘", "폼 페이지 추가", "관리 페이지", "Server Action 추가" 등 테이블 기반 기능 화면이 필요할 때.
  테이블이 아직 없으면 먼저 /web:web-supabase-table.
argument-hint: "[table-name] [fields]"
---

# 테이블 기반 기능 화면 생성

## 1. 전제 확인

- 프로젝트가 `/web:web-init`으로 만들어졌는지 확인한다(`src/lib/auth.ts`가 있어야 함).
- 대상 테이블이 있어야 한다. 없으면 같은 정의로 `/web:web-supabase-table`을 먼저 진행한다.
- 필드 정의는 web-supabase-table과 같은 문법(`이름:타입[:required]...`)을 쓰고, 테이블 컬럼과 일치시킨다. `jsonb` 컬럼은 폼에서 빼야 한다.
- 테이블 `--access`가 `read-only`이면 생성·삭제가 RLS에 막힌다. 그 경우 생성 폼과 삭제 버튼을 지우거나 사용자와 방식을 정한다.

## 2. 생성

```bash
node "${CLAUDE_SKILL_DIR}/scripts/new-feature.mjs" --name <table> --fields "<spec>" --dry-run
node "${CLAUDE_SKILL_DIR}/scripts/new-feature.mjs" --name <table> --fields "<spec>"
```

생성 파일 (`blog_posts` → URL `/blog-posts`, 컴포넌트 `BlogPosts`):

| 파일 | 내용 |
|---|---|
| `src/lib/validations/<kebab>.ts` | zod 스키마, 입력 타입, 행 타입 |
| `src/app/(protected)/<kebab>/actions.ts` | `create<Pascal>`, `delete<Pascal>` (requireUser + safeParse) |
| `src/app/(protected)/<kebab>/page.tsx` | 목록(최근 100개) + 폼 + 삭제 |
| `src/app/(protected)/<kebab>/<kebab>-form.tsx` | 클라이언트 폼 |

이미 있는 파일은 덮어쓰지 않는다(`--force`로만).

## 3. 다듬기

생성 코드는 동작하는 기본형이다. 사용자 요청에 맞춰 이어서 고친다.
- 라벨·제목이 컬럼 이름 그대로다. 한국어 라벨로 바꾼다.
- 긴 글은 `pnpm dlx shadcn@latest add textarea` 후 `Input`을 `Textarea`로, 체크박스를 shadcn으로 바꾸려면 `add checkbox` 후 `Controller`로 연결한다.
- 수정(update) 화면이 필요하면 같은 패턴으로 `update<Pascal>(id, values)`를 추가한다: `requireUser()` → id는 `z.uuid()`, 값은 스키마로 `safeParse` → `.update().eq("id", id)` → `revalidatePath`.
- `timestamptz` 입력(`datetime-local`)은 시간대가 없어 UTC로 저장된다. 시간대가 중요하면 서버에서 변환한다.
- 내비게이션 링크(대시보드 등)를 추가한다.

규칙(바꾸지 않는다):
- 페이지와 모든 Server Action 첫 줄의 `await requireUser()`.
- Server Action의 `safeParse`. 클라이언트 검증만 믿지 않는다.
- 보호 페이지의 `export const dynamic = "force-dynamic"`.
- 데이터 접근은 `@/lib/supabase/server`의 사용자 세션 클라이언트로. `createAdminClient()`를 쓰지 않는다.

## 4. 검증

```bash
pnpm lint && pnpm typecheck && pnpm build
node "${CLAUDE_PLUGIN_ROOT}/skills/web-security-audit/scripts/audit.mjs" .
```

실패하면 고치고 다시 돌린다. 실제 Supabase가 연결돼 있으면 `pnpm dev`로 생성·삭제를 한 번 확인한다.
