# idghst Claude Code 플러그인 마켓플레이스

직접 만든 Claude Code 플러그인(스킬, 훅, MCP 서버, 서브에이전트 등)을 모아 관리하는 마켓플레이스 저장소입니다.

## 설치

```bash
/plugin marketplace add idghst/claude-code
/plugin install web@idghst-claude-code-plugins
```

Claude Code 2.1.275 이상에서는 한 번에 설치할 수 있습니다.

```bash
/plugin install web --marketplace idghst/claude-code
```

## 플러그인 목록

| 플러그인 | 설명 | 구성 요소 |
|---|---|---|
| `web` | Next.js + Supabase 웹 개발 도구 | 스킬 4개: `nextjs-init`(보안 기본값을 갖춘 프로젝트 생성), `supabase-table`(테이블·RLS 마이그레이션), `nextjs-feature`(보호 화면·Server Action 생성), `web-security-audit`(정적 보안 점검) |
| `pstack` | [cursor/plugins](https://github.com/cursor/plugins)의 pstack 사본 (MIT, Lauren Tan) | 원칙 기반 에이전트 워크플로 스킬과 서브에이전트 |

## 개발

플러그인 추가·수정 규칙은 [CLAUDE.md](CLAUDE.md)에 있습니다. 변경 후에는 검증을 실행합니다.

```bash
claude plugin validate .
node --test plugins/web/tests   # web 플러그인 스크립트 테스트
```
