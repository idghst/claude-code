---
name: nextjs-init
description: >
  Next.js + Supabase + ShadCN + pnpm + Pretendard 스택의 웹 프로젝트를 보안 베스트 프랙티스 기반으로 초기화하는 스킬.
  "프로젝트 초기화", "프로젝트 셋업", "프로젝트 세팅", "init project", "새 프로젝트 만들어줘",
  "웹 프로젝트 시작", "보일러플레이트 생성", "프로젝트 scaffolding" 등의 요청 시 반드시 사용.
  Next.js, Supabase, ShadCN, pnpm, Pretendard 중 하나라도 언급되면서 프로젝트 시작/초기화를 요청하면 이 스킬을 트리거할 것.
  Claude Code 환경에서 실행되며, 항상 동일한 결과를 보장하는 결정론적 초기화 프로세스를 따름.
---

# Next.js 프로젝트 초기화 스킬

## 개요

이 스킬은 아래 고정 스택으로 웹 프로젝트를 초기화한다.
매번 동일한 결과를 보장하기 위해, 모든 단계를 순서대로 실행하며 사용자 확인 없이 자동 진행한다.

| 항목 | 고정값 |
|------|--------|
| Framework | Next.js (최신 stable, App Router) |
| DB/Auth | Supabase (@supabase/ssr) |
| UI | ShadCN UI |
| Package Manager | pnpm |
| Font | Pretendard (Variable, local) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Validation | zod + react-hook-form |

## 실행 전 확인

1. 사용자에게 **프로젝트 이름**을 반드시 확인한다 (예: `my-app`)
2. Supabase 프로젝트 URL과 Anon Key를 가지고 있는지 확인한다 (없으면 `.env.local`에 placeholder로 생성)
3. 프로젝트 생성 경로를 확인한다 (기본: 현재 디렉토리)

## 초기화 프로세스 (순서 엄수)

### Phase 1: 프로젝트 생성

```bash
pnpm create next-app@latest <project-name> \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --turbopack \
  --yes

cd <project-name>
```

### Phase 2: 핵심 패키지 설치

```bash
# Supabase
pnpm add @supabase/supabase-js @supabase/ssr

# Validation
pnpm add zod react-hook-form @hookform/resolvers

# Theming
pnpm add next-themes

# Dev dependencies
pnpm add -D @types/node
```

### Phase 3: ShadCN UI 초기화

```bash
pnpm dlx shadcn@latest init -y -d
```

초기화 후 필수 컴포넌트 설치:

```bash
pnpm dlx shadcn@latest add button input label card form toast sonner
```

### Phase 4: Pretendard 폰트 설정

1. `src/app/fonts/` 디렉토리를 생성한다
2. Pretendard Variable 폰트 파일(`PretendardVariable.woff2`)을 다운로드하거나, CDN fallback을 설정한다
3. `src/app/layout.tsx`에서 `next/font/local`로 로드한다

```typescript
// src/app/layout.tsx
import localFont from "next/font/local";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

4. `tailwind.config.ts`(또는 CSS 변수 방식)에서 `--font-pretendard`를 `font-sans`로 바인딩한다

### Phase 5: 디렉토리 구조 생성

아래 구조를 정확히 따른다:

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (protected)/
│   │   └── dashboard/page.tsx
│   ├── auth/
│   │   └── confirm/route.ts
│   ├── fonts/
│   │   └── PretendardVariable.woff2
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/              ← ShadCN 컴포넌트 (자동 생성됨)
│   └── providers/
│       └── theme-provider.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts     ← 브라우저용 클라이언트
│   │   ├── server.ts     ← Server Component용 클라이언트
│   │   └── admin.ts      ← service_role 전용 (server-only)
│   ├── utils.ts
│   └── validations/
│       └── auth.ts       ← zod 스키마
├── hooks/
│   └── use-user.ts
├── types/
│   └── database.ts       ← Supabase 타입 (gen types로 생성)
└── middleware.ts
```

### Phase 6: 보안 파일 생성

`references/security-config.md`를 읽고, 아래 파일들을 정확히 생성한다:

1. **`src/middleware.ts`** — CSP nonce + Supabase 세션 갱신 + 보호 라우트 리다이렉트
2. **`src/lib/supabase/client.ts`** — `createBrowserClient` 래퍼
3. **`src/lib/supabase/server.ts`** — `createServerClient` 래퍼 (쿠키 기반)
4. **`src/lib/supabase/admin.ts`** — `import 'server-only'` + `service_role` 클라이언트
5. **`src/app/auth/confirm/route.ts`** — PKCE 토큰 교환 핸들러

각 파일의 정확한 코드는 `references/security-config.md`에 정의되어 있다.

### Phase 7: 환경변수 및 설정 파일

1. **`.env.local`** 생성:
```bash
# Public (클라이언트 노출 가능 — RLS가 보호)
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Private (서버 전용 — 절대 NEXT_PUBLIC_ 접두사 금지)
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

2. **`.env.example`** 생성 (키값 없이 구조만)

3. **`.gitignore`** 업데이트:
```
.env.local
.env*.local
```

4. **`next.config.ts`** 보안 헤더 추가 (references/security-config.md 참조)

### Phase 8: CLAUDE.md 생성

`references/CLAUDE.md.template`를 읽고, `<project-name>`을 실제 프로젝트 이름으로 치환하여 프로젝트 루트에 `CLAUDE.md`를 생성한다.

### Phase 9: 최종 검증

```bash
pnpm build
```

빌드 성공을 확인한다. 실패 시 에러를 분석하고 수정한다.

## 참조 파일

| 파일 | 용도 | 읽는 시점 |
|------|------|-----------|
| `references/security-config.md` | 보안 관련 파일의 정확한 코드 | Phase 6, 7 |
| `references/CLAUDE.md.template` | CLAUDE.md 템플릿 | Phase 8 |

## 주의사항

- **결정론적 실행**: 사용자 선택지를 최소화하고, 모든 설정은 이 스킬에 정의된 고정값을 따른다
- **보안 우선**: 4계층 방어(Edge → Middleware → Server Component → RLS)를 기본 적용한다
- **ISR 금지**: 인증 관련 페이지에서 `export const dynamic = 'force-dynamic'`을 반드시 설정한다
- **미들웨어 의존 금지**: 미들웨어는 낙관적 검증만 수행. 실제 인증은 Server Component에서 `getUser()` 호출
- **service_role 격리**: `import 'server-only'` 필수, `NEXT_PUBLIC_` 접두사 절대 금지
