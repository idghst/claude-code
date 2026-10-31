# idghst Claude Code 플러그인 마켓플레이스

직접 만든 Claude Code 플러그인(스킬, 훅, MCP 서버, 서브에이전트 등)을 모아 관리하는 마켓플레이스 저장소입니다.

## 설치

```bash
/plugin marketplace add idghst/claude-code
/plugin install next-js@idghst-claude-code-plugins
```

Claude Code 2.1.275 이상에서는 한 번에 설치할 수 있습니다.

```bash
/plugin install next-js --marketplace idghst/claude-code
```

## 플러그인 목록

| 플러그인 | 설명 | 구성 요소 |
|---|---|---|
| `next-js` | Next.js 개발용 도구 | 스킬 `nextjs-init`: Next.js + Supabase + ShadCN + pnpm + Pretendard 프로젝트를 보안 설정까지 포함해 초기화 |
| `pstack` | [cursor/plugins](https://github.com/cursor/plugins)의 pstack 사본 (MIT, Lauren Tan) | 원칙 기반 에이전트 워크플로 스킬과 서브에이전트 |

## 개발

플러그인 추가·수정 규칙은 [CLAUDE.md](CLAUDE.md)에 있습니다. 변경 후에는 검증을 실행합니다.

```bash
claude plugin validate .
```
