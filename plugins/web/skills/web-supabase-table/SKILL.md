---
name: web-supabase-table
description: >
  Supabase 테이블 마이그레이션을 RLS 정책(CRUD별, (select auth.uid()) 최적화), 인덱스, grant, updated_at 트리거까지 포함해 생성하고
  적용·타입 생성까지 진행한다. web-init으로 만든 프로젝트 기준.
when_to_use: >
  "테이블 만들어줘", "DB 스키마 추가", "Supabase 테이블", "마이그레이션 생성", "RLS 정책" 등 Supabase에 새 테이블이 필요할 때.
  기존 테이블 변경(alter)에는 스크립트를 쓰지 않고 아래 규칙대로 직접 SQL을 쓴다.
argument-hint: "[table-name] [fields]"
---

# Supabase 테이블 생성

## 1. 정의 정리

사용자 요청에서 테이블 이름(snake_case 복수형, 예: `blog_posts`), 컬럼, 접근 방식을 정한다. 애매하면 한 번에 묶어 묻는다.

컬럼 문법: `이름:타입[:required][:default=값][:ref=테이블]`을 쉼표로 구분.

| 타입 | SQL | 비고 |
|---|---|---|
| `text` | text | |
| `integer`, `bigint`, `numeric` | 같음 | |
| `boolean` | boolean | `default=false` 권장 |
| `date`, `timestamptz` | 같음 | |
| `uuid` | uuid | `ref=테이블`이면 FK + 인덱스 |
| `jsonb` | jsonb | 폼 생성(web-feature) 미지원 |

기본값은 숫자, `true`/`false`, `now()`, `gen_random_uuid()`, `'문자열'`만 허용한다.
`id`, `user_id`, `created_at`, `updated_at`은 자동으로 들어가므로 지정하지 않는다.

접근 방식 `--access`:

| 값 | 읽기 | 쓰기 |
|---|---|---|
| `owner` (기본) | 본인 행만 | 본인 행만 |
| `public-read` | 누구나(anon 포함) | 본인 행만 |
| `read-only` | 로그인 사용자 | 정책 없음, secret 키로만 (`user_id` 없음) |

## 2. 마이그레이션 생성

먼저 `--dry-run`으로 SQL을 보여 주고, 그대로 파일을 만든다.

```bash
node "${CLAUDE_SKILL_DIR}/scripts/new-table.mjs" --name <table> --fields "<spec>" --access owner --dry-run
node "${CLAUDE_SKILL_DIR}/scripts/new-table.mjs" --name <table> --fields "<spec>" --access owner
```

`supabase/migrations/<timestamp>_create_<table>.sql`이 생긴다. 같은 테이블 마이그레이션이 이미 있으면 멈춘다. 참조 테이블(`ref=`)은 먼저 만들어져 있어야 한다.

## 3. 적용

아래 중 가능한 첫 번째 방법을 쓴다. 원격 DB에 적용하는 것이므로 사용자에게 대상 프로젝트를 확인받은 뒤 실행한다.

1. Supabase MCP의 `apply_migration` 도구가 있으면: 파일 내용을 `query`로, `create_<table>`을 `name`으로 넘긴다. 이후 `get_advisors`(security)로 경고를 확인한다.
2. Supabase CLI가 연결돼 있으면(`supabase link` 완료): `pnpm dlx supabase db push`.
3. 둘 다 없으면: SQL을 Supabase 대시보드 SQL Editor에서 실행하라고 안내한다.

## 4. 타입 생성

```bash
pnpm db:types
```

`src/types/database.types.ts`가 생기면, 클라이언트에 타입을 연결하지 않았을 때 한 번만 연결한다.
- `src/lib/supabase/{client,server}.ts`: `createBrowserClient<Database>(...)`, `createServerClient<Database>(...)`
- `src/lib/supabase/admin.ts`: `createClient<Database>(...)`
- import: `import type { Database } from "@/types/database.types";`

그다음 `pnpm typecheck`.

## 5. 다음 단계

화면이 필요하면 같은 `--name`, `--fields`로 `/web:web-feature`를 이어서 실행한다.

## 기존 테이블 변경 규칙 (직접 SQL 작성 시)

- 새 파일 `supabase/migrations/<YYYYMMDDHHMMSS>_<설명>.sql`로 쓴다. 이미 적용된 마이그레이션은 고치지 않는다.
- 정책은 CRUD별로 나누고 `for all`을 쓰지 않는다. `auth.uid()`는 `(select auth.uid())`로 감싼다.
- 정책에 쓰는 컬럼에 인덱스를 건다. 인가 판단에 `raw_user_meta_data`를 쓰지 않는다(`raw_app_meta_data` 사용).
- `security definer` 함수는 `set search_path = ''`를 지정한다.
- 끝나면 `/web:web-security-audit`로 점검한다.
