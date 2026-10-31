---
name: web-nextjs-init
description: >
  Next.js 16 + Supabase + shadcn/ui + Tailwind v4 + pnpm + Pretendard 웹 프로젝트를 보안 기본값(CSP nonce, getClaims 인증,
  publishable/secret 키 분리, RLS 규칙)과 함께 새로 만든다. 로그인·회원가입·이메일 확인·보호 페이지까지 동작하는 상태로 생성하고
  빌드·린트·타입체크·보안 점검까지 통과시킨다.
when_to_use: >
  "프로젝트 초기화", "새 웹 프로젝트", "Next.js 프로젝트 만들어줘", "Supabase 붙은 보일러플레이트", "init project",
  "프로젝트 셋업/세팅/scaffolding" 등 새 Next.js 웹 프로젝트를 시작할 때. 기존 프로젝트 수정에는 쓰지 않는다.
argument-hint: "[project-name]"
---

# Next.js + Supabase 프로젝트 초기화

고정 스택으로 프로젝트를 만든다. 코드는 `assets/template/`의 실제 파일을 스크립트로 복사하므로 매번 같은 결과가 나온다. 템플릿 코드를 손으로 다시 쓰지 않는다.

| 항목 | 값 |
|---|---|
| Framework | Next.js 최신 (App Router, `src/`, Turbopack, Cache Components 끔) |
| DB/Auth | Supabase (`@supabase/ssr`, publishable/secret 키) |
| UI | shadcn/ui `radix-nova` + `sonner` + `field` |
| Styling | Tailwind CSS v4 (CSS-first, `tailwind.config` 없음) |
| Form | react-hook-form + zod 4 + `@hookform/resolvers@^5` |
| Font | Pretendard Variable (`next/font/local`) |

## 0. 사전 확인

1. 프로젝트 이름: 인자 `$ARGUMENTS`가 있으면 쓰고, 없으면 사용자에게 한 번만 묻는다. 소문자·숫자·하이픈만 허용.
2. 만들 위치: 현재 디렉터리 아래 `<name>/`. 이미 있으면 멈추고 알린다.
3. `node -v`가 20.9 이상, `pnpm -v`가 있는지 확인한다. 없으면 설치 방법을 알리고 멈춘다.

이 외에는 묻지 않고 아래 순서대로 끝까지 진행한다.

## 1. 프로젝트 생성

```bash
pnpm create next-app@latest <name> --ts --tailwind --eslint --app --src-dir --import-alias "@/*" \
  --use-pnpm --no-react-compiler --no-cache-components --yes
cd <name>
```

- `--no-cache-components`: nonce 기반 CSP는 동적 렌더링이 필요해 Cache Components(PPR)와 함께 쓸 수 없다.
- `--turbopack` 플래그는 없다(기본값). 넣으면 실패한다.

## 2. 패키지 설치

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod react-hook-form "@hookform/resolvers@^5" next-themes server-only
pnpm add -D pretendard
```

## 3. shadcn 초기화

프롬프트가 뜨지 않도록 옵션을 모두 주고 stdin을 막는다.

```bash
pnpm dlx shadcn@latest init -t next -b radix -p nova -y --no-monorepo </dev/null
pnpm dlx shadcn@latest add button input label card field sonner -y </dev/null
```

`toast`, `form` 컴포넌트는 쓰지 않는다(radix-nova에서 제거됨, `sonner`·`field`로 대체).

## 4. 템플릿 적용

```bash
node "${CLAUDE_SKILL_DIR}/scripts/apply-template.mjs" . --name <name>
```

스크립트가 하는 일:
- `assets/template/` 복사(`{{PROJECT_NAME}}` 치환). 기본 `layout.tsx`, `page.tsx`만 덮어쓰고 다른 파일이 이미 있으면 아무것도 쓰지 않고 멈춘다.
- Pretendard 폰트를 `src/app/fonts/`로 복사, `supabase/migrations/` 생성.
- `.env.local`이 없으면 `.env.example`로 placeholder 생성, `.gitignore`에 `.env*`·`!.env.example` 보장.
- `package.json`에 `typecheck`, `db:types` 스크립트 추가, `next.config.ts`에 `poweredByHeader: false` 추가.

`✘`로 끝나면 메시지대로 앞 단계를 고친 뒤 다시 실행한다.

생성되는 주요 파일:

| 파일 | 역할 |
|---|---|
| `src/proxy.ts` | CSP nonce, 보안 헤더, 세션 갱신 (인가 판단 안 함) |
| `src/lib/supabase/{client,server,proxy,admin}.ts` | 용도별 Supabase 클라이언트 (`admin`은 secret 키 + `server-only`) |
| `src/lib/auth.ts` | `getCurrentUser()`(getClaims), `requireUser()` |
| `src/app/(auth)/` | 로그인·회원가입 폼과 Server Action |
| `src/app/auth/confirm/route.ts` | 이메일 확인 링크 처리 (오픈 리다이렉트 차단) |
| `src/app/(protected)/dashboard/page.tsx` | 보호 페이지 예시 |
| `CLAUDE.md` | 이 프로젝트의 규칙 (`@AGENTS.md` 포함) |

## 5. 검증

모두 통과해야 끝난다. 실패하면 원인을 고치고 다시 돌린다. 템플릿 결함이면 사용자에게 알린다.

```bash
pnpm lint
pnpm typecheck
pnpm build
node "${CLAUDE_PLUGIN_ROOT}/skills/web-security-audit/scripts/audit.mjs" .
```

placeholder `.env.local`로도 빌드는 성공해야 한다.

## 6. 보고

사용자에게 다음을 알린다.
1. `.env.local`에 실제 값 넣기: Supabase 대시보드 > Project Settings > API Keys의 publishable·secret 키, Project URL, project ref.
2. Supabase Auth 설정: Authentication > URL Configuration의 Site URL과 Redirect URL에 `http://localhost:3000/auth/confirm` 추가. 이메일 템플릿의 확인 링크를 `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`로 변경.
3. 다음 단계: 테이블은 `/web:web-supabase-table`, 화면은 `/web:web-nextjs-feature`, 점검은 `/web:web-security-audit`.

git 초기화는 create-next-app이 이미 했다. 커밋은 사용자가 요청할 때만 한다.
