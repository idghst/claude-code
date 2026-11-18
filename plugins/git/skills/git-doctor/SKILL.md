---
name: git-doctor
description: git 저장소를 점검한다. 환경(git·gh 설치와 인증, user 설정, 원격), 브랜치 규칙(develop 존재, main·develop 직접 커밋, feature/* 브랜치, develop 외 base PR, 브랜치 보호), 저장소 상태(미커밋·미푸시, 갈라진 브랜치, 머지 후 남은 브랜치, 진행 중인 rebase 등, 큰 파일·비밀값)를 표로 보고하고, 고칠 수 있는 항목은 사용자가 고른 것만 고친다.
when_to_use: 저장소 건강 상태를 물을 때("git 점검", "저장소 상태 확인", "git doctor", "브랜치 정리 필요한지 봐줘", "규칙 잘 지키고 있어?"), 그리고 git-feature·git-pr-merge·git-main-merge가 환경 문제로 실패했을 때.
argument-hint: "[저장소 경로]"
---

# git 저장소 점검

인자가 있으면 그 경로, 없으면 현재 디렉터리에서 점검한다. `git rev-parse --show-toplevel`이 실패하면 git 저장소가 아니라고 보고하고 끝낸다.

점검 중에는 **아무것도 바꾸지 않는다.** 원격 정보는 `git fetch origin`으로만 갱신한다(`--prune`은 수정 단계에서 한다). 명령이 권한·네트워크 문제로 실패하면 그 항목을 "확인 불가"로 적고 다음으로 넘어간다.

브랜치 규칙(develop에서 `feature/*`, PR은 develop으로, main 반영은 `git-main-merge`)은 `origin`에 develop이 있는 저장소에만 적용한다. 없으면 규칙 항목은 "develop 없음" 한 줄만 적는다.

## 1. 환경

| 항목 | 확인 | 판정 |
|---|---|---|
| git | `git --version` | 없으면 문제 |
| gh | `gh --version`, `gh auth status` | 없거나 미인증이면 경고(PR 관련 점검은 확인 불가) |
| 사용자 정보 | `git config user.name`, `git config user.email` | 비어 있으면 문제 |
| 원격 | `git remote -v` | `origin`이 없으면 문제(원격 점검은 건너뜀) |

## 2. 브랜치 규칙

```bash
git fetch origin
git ls-remote --exit-code --heads origin develop
```

| 항목 | 확인 | 판정 |
|---|---|---|
| develop | 위 `ls-remote` | 없으면 경고 |
| 직접 커밋 | `git log --first-parent --format=%H -20 origin/<main\|develop>`의 각 커밋에 `gh api repos/{owner}/{repo}/commits/<sha>/pulls --jq length`가 0 | PR 없이 들어간 커밋이 있으면 경고(SHA·제목 나열) |
| 작업 브랜치 이름 | `git branch --format='%(refname:short)'` 중 main·develop·`feature/*`·`release/*`가 아닌 것 | 있으면 경고 |
| 현재 브랜치 | `git branch --show-current`가 main·develop이고 커밋 안 한 변경이 있음 | 문제(feature 브랜치로 옮겨야 함) |
| PR base | `gh pr list --state open --json number,title,baseRefName,headRefName` 중 base가 develop이 아니고 head가 `release/*`도 아닌 것 | 있으면 문제 |
| 브랜치 보호 | `gh api repos/{owner}/{repo}/rules/branches/<main\|develop> --jq length` | 0이면 경고(규칙 없음). 기존 보호 방식은 `gh api repos/{owner}/{repo}/branches/<브랜치>/protection` (404 = 없음, 403 = 확인 불가) |

## 3. 저장소 상태

| 항목 | 확인 | 판정 |
|---|---|---|
| 커밋 안 한 변경 | `git status --porcelain` | 있으면 경고 |
| 진행 중인 작업 | `.git` 안 `rebase-merge`·`rebase-apply`·`MERGE_HEAD`·`CHERRY_PICK_HEAD` 존재(`git rev-parse --git-path <이름>`으로 경로를 얻는다), detached HEAD(`git symbolic-ref -q HEAD` 실패) | 있으면 문제 |
| 푸시 안 한 커밋·갈라짐 | `git for-each-ref --format='%(refname:short) %(upstream:short) %(upstream:track)' refs/heads` | `[ahead N]`은 경고, `[ahead N, behind M]`은 문제(갈라짐), 업스트림 없음은 경고 |
| 원격에서 지워진 추적 브랜치 | 위 출력의 `[gone]` | 있으면 경고 |
| 머지됐는데 남은 브랜치 | `git branch --merged origin/develop`(develop 없으면 `origin/main`) 중 main·develop 제외, 그리고 `gh pr list --state merged --limit 100 --json headRefName`의 head와 이름이 같은 로컬 브랜치(squash 머지는 `--merged`에 안 잡힌다) | 있으면 경고 |
| 큰 파일 | `git ls-tree -r -l HEAD \| awk '$4 > 5242880'` | 5MB 넘는 추적 파일이 있으면 경고 |
| 비밀값 파일 | `git ls-files \| grep -Ei '(^\|/)(\.env(\..+)?\|.+\.(pem\|key\|p12\|pfx\|keystore\|jks)\|id_(rsa\|ed25519)\|credentials(\..+)?)$' \| grep -Eiv 'example\|sample\|template'` | 있으면 문제 |
| 비밀값 문자열 | `git grep -I -n -E -e 'AKIA[0-9A-Z]{16}' -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'gh[pousr]_[A-Za-z0-9]{36,}' -e 'sk-[A-Za-z0-9_-]{20,}' -e 'xox[abpr]-[A-Za-z0-9-]{10,}'` | 있으면 문제(값은 출력하지 말고 `파일:줄`만 적는다) |

## 4. 보고

항목별 표로 보고한다: `항목 | 판정(OK·경고·문제·확인 불가) | 내용`. 문제 → 경고 순으로 정렬하고 OK는 개수만 적는다. 마지막에 한 줄 요약.

## 5. 수정 (고를 수 있게)

아래 "고칠 수 있는 항목" 중 이번 점검에서 걸린 것이 있으면 AskUserQuestion으로 **한 번** 묻는다(`multiSelect: true`, 선택지 하나 = 수정 하나, 설명에 실행할 명령을 적는다. 4개를 넘으면 영향이 큰 순으로 4개를 두고 나머지는 질문 본문에 적어 "Other"로 고르게 한다). 고른 것만 실행하고 결과를 보고한다. 고른 게 없으면 끝낸다.

| 항목 | 수정 |
|---|---|
| 원격에서 지워진 추적 정보 | `git fetch --prune origin` |
| 머지됐는데 남은 로컬 브랜치 | `git branch -d <브랜치>`. squash 머지라 `-d`가 거부하면, 머지된 PR의 head인 것을 확인한 브랜치만 `-D` |
| develop 없음 | `git switch -c develop origin/main && git push -u origin develop` 후 원래 브랜치로 돌아간다 |
| feature 브랜치의 푸시 안 한 커밋 | `git push -u origin <브랜치>` (`feature/*`·`release/*`만. main·develop은 직접 푸시하지 않는다) |
| main·develop에서 커밋 안 한 변경 | `git switch -c feature/<기능명>`으로 변경을 feature 브랜치로 옮긴다(이름은 변경 내용으로 정하고 선택지 설명에 적는다) |

다음은 고치지 않고 **방법만 안내한다.**

- **사용자 정보 없음**: `git config --global user.name "<이름>"`, `git config --global user.email "<이메일>"` (값은 사용자가 정한다)
- **gh 미설치·미인증**: 설치 방법과 `gh auth login`
- **진행 중인 rebase·merge·cherry-pick**: `--continue`/`--abort` 중 무엇이 맞는지 상황과 함께 설명한다. 작업이 사라질 수 있어 직접 실행하지 않는다.
- **갈라진 브랜치**: rebase·merge 선택지를 설명한다. 강제 푸시는 권하지 않는다.
- **직접 커밋·잘못된 base PR**: 이미 들어간 커밋은 되돌리지 않는다. PR은 `gh pr edit <번호> --base develop`로 base를 바꿀 수 있다고 안내한다.
- **브랜치 보호 없음**: GitHub 저장소 Settings → Rules(Rulesets)에서 main·develop에 PR 필수·강제 푸시 금지를 거는 방법을 안내한다.
- **비밀값·큰 파일**: 커밋된 비밀값은 **즉시 폐기·재발급**이 먼저다. 이후 `.gitignore` 추가와 `git rm --cached <파일>`을 안내하고, 기록에서 지우려면 `git filter-repo` 같은 기록 재작성이 필요하며 모든 협업자에게 영향이 있음을 알린다. 큰 파일은 Git LFS를 안내한다.
