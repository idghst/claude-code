# 저장소 관리 규칙

이 저장소는 Claude Code 플러그인 마켓플레이스다. 아래 규칙은 공식 문서(https://code.claude.com/docs/en/plugins/)를 따른다. 스펙이 의심되면 문서와 `claude plugin validate`를 기준으로 한다.

## 구조

```
.claude-plugin/marketplace.json      # 마켓플레이스 카탈로그 (name, owner, plugins 필수)
plugins/<plugin>/
├── .claude-plugin/plugin.json       # 이 폴더에는 plugin.json만 둔다
├── skills/<skill>/SKILL.md          # 스킬 (참조 파일은 같은 폴더의 references/ 등)
├── agents/*.md                      # 서브에이전트
├── hooks/hooks.json                 # 훅
├── .mcp.json                        # MCP 서버
├── bin/                             # 실행 파일 (Bash 도구 PATH에 추가됨)
└── scripts/                         # 훅·MCP가 쓰는 스크립트
```

- 새 플러그인은 `commands/` 대신 `skills/`를 쓴다.
- 플러그인 루트의 `CLAUDE.md`는 컨텍스트로 로드되지 않는다. 지시문은 스킬로 넣는다.
- 플러그인 밖 파일(`../shared` 등)은 설치 시 복사되지 않으므로 참조하지 않는다.

## 플러그인 추가 절차

1. `plugins/<plugin>/.claude-plugin/plugin.json` 작성. `name`은 kebab-case, 마켓플레이스 엔트리 `name`과 같게 한다(다르면 설치 실패).
2. `marketplace.json`의 `plugins`에 엔트리 추가. `source`는 `./plugins/<plugin>` 형태(`./`로 시작, `..` 금지).
3. README의 플러그인 목록 표에 한 줄 추가.
4. `claude plugin validate .` 와 `claude plugin validate ./plugins/<plugin>` 실행.

외부 플러그인은 기본적으로 `git-subdir`/`github` 소스로 원본을 참조한다. 엔트리 `name`은 원본 `plugin.json`의 `name`과 같게 한다.

예외: `plugins/pstack`은 claude.ai 동기화 경고(`$schema` 키)를 없애려고 복사한 사본이다. 원본은 cursor/plugins의 `harness/pstack/claude-code`(마지막 동기화 커밋 `4dd1d05`, v0.15.36). 직접 수정하지 않는다. 갱신 절차:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins.git "$TMPDIR/cp" && git -C "$TMPDIR/cp" sparse-checkout set harness/pstack/claude-code
rm -rf plugins/pstack && cp -R "$TMPDIR/cp/harness/pstack/claude-code" plugins/pstack
sed -i '' '/"\$schema"/d' plugins/pstack/plugin.json plugins/pstack/.claude-plugin/plugin.json
```

갱신 후 위 커밋·버전 표기를 고친다.

claude.ai/Cowork 조직 동기화 조건: 이 저장소가 private/internal이어야 하고, 소스는 `./` 상대 경로·`github`·`url`·`git-subdir`만 허용되며(`url`·`git-subdir`의 `url`은 `owner/repo` 축약 대신 `https://` 전체 URL),  최상위 `bin/`이 있는 플러그인은 거부된다.

예약 이름 금지: `claude-`, `anthropic-` 접두어, `claude`, `claude-code`, `anthropic` 등.

## 버전

- 버전은 `plugin.json`의 `version`에만 둔다(마켓플레이스 엔트리에 두지 않는다. 둘 다 있으면 plugin.json이 이긴다).
- 사용자는 이 버전 문자열이 바뀔 때만 업데이트를 받는다. 배포할 변경이 있으면 semver로 올린다.
- 로컬 경로로 추가한 마켓플레이스는 제자리 로드되므로 개발 중에는 `/reload-plugins`만 하면 된다.

## 구성 요소별 규칙

### 스킬 (`skills/<skill>/SKILL.md`)
- 첫 줄은 `---` frontmatter. `name`(기본값: 폴더명), `description`(무엇을, 언제 쓰는지) 작성.
- `description` + `when_to_use` 합계 1,536자에서 잘린다.
- 자동 호출을 막으려면 `disable-model-invocation: true`. 플러그인 스킬은 `/<plugin>:<skill>`로 호출된다.
- 스킬 폴더 파일은 `${CLAUDE_SKILL_DIR}`로 참조한다.

### 훅 (`hooks/hooks.json`)
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh", "timeout": 30 }
        ]
      }
    ]
  }
}
```
- 최상위 `"hooks"` 래퍼 필수. 스크립트 경로는 `${CLAUDE_PLUGIN_ROOT}`로 쓴다.
- 종료 코드 `2`는 차단(stderr가 사유), `0`은 성공.
- 지속 데이터(캐시, `node_modules`)는 `${CLAUDE_PLUGIN_DATA}`에 둔다. `${CLAUDE_PLUGIN_ROOT}`는 버전마다 바뀐다.
- 자동화 스크립트는 Rust(`cargo build --release` 바이너리)로 작성한다.

### MCP (`.mcp.json`)
```json
{
  "mcpServers": {
    "my-server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/bin/my-server",
      "args": ["--stdio"]
    }
  }
}
```
- 도구 이름은 `mcp__plugin_<plugin>_<server>__<tool>`이 된다.

### 서브에이전트 (`agents/*.md`)
- frontmatter에 `name`, `description` 필수. `name`에 `:` 금지.
- 플러그인 에이전트에서는 `hooks`, `mcpServers`, `permissionMode`가 무시된다. 필요하면 `hooks/hooks.json`, `.mcp.json`으로 옮긴다.

## 검증·테스트

```bash
claude plugin validate .                     # 마켓플레이스
claude plugin validate ./plugins/<plugin>    # 각 플러그인 (마켓플레이스 검증은 플러그인 내부를 안 본다)
claude --plugin-dir ./plugins/<plugin>       # 설치 없이 세션 한정 로드
```
