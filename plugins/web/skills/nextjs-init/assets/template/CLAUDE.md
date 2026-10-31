@AGENTS.md

# {{PROJECT_NAME}}

## 스택

| 항목 | 값 |
|---|---|
| Framework | Next.js 16+ (App Router, `src/`, Turbopack) |
| Language | TypeScript strict |
| DB / Auth | Supabase (`@supabase/ssr`, publishable/secret 키, RLS 필수) |
| UI | shadcn/ui (radix-nova), Tailwind CSS v4, sonner |
| Form | react-hook-form + zod + shadcn `field` |
| Font | Pretendard Variable (`next/font/local`, `--font-sans`) |
| Package Manager | pnpm |

## 구조

```
src/
├── proxy.ts                 # CSP nonce + 보안 헤더 + Supabase 세션 갱신 (인가 판단 없음)
├── app/
│   ├── (auth)/              # login, signup, actions.ts(login/signup/logout)
│   ├── (protected)/         # 로그인 필요한 페이지. 각 page에서 requireUser()
│   └── auth/confirm/        # 이메일 확인 링크 처리
├── components/ui/           # shadcn 컴포넌트
├── lib/
│   ├── auth.ts              # getCurrentUser(), requireUser()
│   ├── env.ts               # 환경 변수 검증
│   ├── supabase/            # client(브라우저) / server / proxy / admin(secret 키)
│   └── validations/         # zod 스키마
└── types/database.types.ts  # pnpm db:types 로 생성
supabase/migrations/         # SQL 마이그레이션
```

## 규칙

### 인증·인가
- 보호 페이지와 Server Action은 첫 줄에서 `await requireUser()`를 호출한다. proxy만 믿지 않는다.
- 서버에서 사용자 확인은 `getClaims()`(JWT 서명 검증) 기반 `getCurrentUser()`를 쓴다. 최신 사용자 레코드가 필요할 때만 `supabase.auth.getUser()`.
- 서버 코드에서 `getSession()` 결과를 믿지 않는다(쿠키 위조 가능).
- 보호 페이지에는 `export const dynamic = "force-dynamic"`을 둔다. 인증된 응답이 캐시되면 다른 사용자에게 세션이 노출된다.

### Supabase
- `createAdminClient()`(secret 키)는 RLS를 우회한다. Server Action·Route Handler에서만, 꼭 필요할 때만 쓴다. 해당 파일은 `import "server-only"`.
- secret 키·`SUPABASE_SECRET_KEY`에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- 모든 테이블에 RLS를 켜고 정책은 CRUD별로 나눈다(`FOR ALL` 금지). `auth.uid()`는 `(select auth.uid())`로 감싸고 정책에 쓰는 컬럼에 인덱스를 건다.
- 인가 정보는 `raw_app_meta_data`에 둔다. `raw_user_meta_data`는 사용자가 수정할 수 있다.
- 테이블 추가는 `/web:supabase-table`, 화면·Server Action 추가는 `/web:nextjs-feature`를 쓴다.

### 코드
- Server Component 우선. `"use client"`는 상호작용이 필요한 가장 작은 컴포넌트에만.
- Server Action은 `unknown` 입력을 zod `safeParse`로 다시 검증한다.
- 폼은 react-hook-form + `zodResolver` + shadcn `Field`/`FieldLabel`/`FieldError`.
- `any` 금지. import는 `@/` 별칭. 파일명 kebab-case, 컴포넌트 PascalCase.
- `dangerouslySetInnerHTML` 금지(필요하면 sanitize 후 리뷰).

## 명령

```bash
pnpm dev          # 개발 서버
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm db:types     # Supabase 타입 생성 (SUPABASE_PROJECT_ID 필요, supabase login 선행)
pnpm dlx shadcn@latest add <component>
```

변경 후 `/web:web-security-audit`로 보안 점검을 돌린다.
