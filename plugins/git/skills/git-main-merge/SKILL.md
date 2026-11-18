---
name: git-main-merge
description: develop에 머지됐지만 아직 main에 없는 기능(PR)을 골라 main에 반영한다. 기능 목록을 보여 주고 선택받은 뒤 확인을 받아, main에서 release 브랜치를 만들어 해당 PR의 머지 커밋을 cherry-pick하고 main으로 PR을 열어 CI 통과 후 머지한다.
when_to_use: 사용자가 특정 기능을 main(운영)에 반영해 달라고 할 때("로그인 기능 main으로 머지해줘", "main에 뭐 올릴 수 있어?", "배포할 기능 골라줘", "/git:git-main-merge"). develop으로의 머지에는 git-pr-merge를 쓴다.
argument-hint: "[기능 이름 또는 PR 번호]"
---

# 기능을 골라 main에 반영

develop에서 PR로 들어온 기능 중 고른 것만 main에 올린다. 질문은 최소로 한다.

- 기능을 말하지 않고 부르면: **① 기능 선택 → ② 머지 확인**, 두 번 묻는다.
- 기능을 함께 말하면: 선택은 건너뛰고 **② 머지 확인** 한 번만 묻는다.

②에서 예를 받으면 이후 단계(브랜치·PR·머지)는 다시 묻지 않고 끝까지 진행한다. 단, 아래 "멈춤 조건"에 걸리면 멈추고 보고한다.

## 1. 후보 기능 목록 만들기

```bash
git fetch origin
gh pr list --base develop --state merged --limit 100 --json number,title,mergeCommit,mergedAt,author,url
```

각 PR의 `mergeCommit.oid`(`<oid>`)가 이미 main에 있으면 후보에서 뺀다. 둘 중 하나라도 해당하면 main에 있는 것이다.

```bash
git merge-base --is-ancestor <oid> origin/main          # 종료 코드 0: main에 포함됨
git log origin/main --format=%B | grep -F "cherry picked from commit <oid>"   # 이전에 이 스킬로 반영됨
```

남은 PR을 머지 시각 순으로 정리한다. 후보가 없으면 "main에 반영할 기능이 없습니다"라고 보고하고 끝낸다.

## 2. 기능 선택 (기능을 말하지 않았을 때만)

AskUserQuestion으로 후보를 보여 주고 고르게 한다(`multiSelect: true`). 선택지 하나 = PR 하나, 라벨은 PR 제목, 설명은 `#번호 · 작성자 · 머지 날짜`. 후보가 4개를 넘으면 최근 4개를 선택지로 두고 나머지는 질문 본문에 `#번호 제목` 목록으로 적어 "Other"로 고를 수 있게 한다.

기능을 함께 말했으면 후보 중 PR 번호나 제목이 맞는 것을 찾는다. 하나로 특정되지 않거나 후보에 없으면(이미 main에 있음 등) 그 사실과 함께 후보를 보여 주고 고르게 한다.

## 3. 머지 확인

고른 PR마다 무엇을 하는 기능인지 확인하고(`gh pr view <번호> --json title,body,files`, 필요하면 `git show --stat <oid>`) 한두 문장으로 요약한다. 그리고 AskUserQuestion으로 묻는다.

> "<기능 요약>입니다. main으로 머지를 진행할까요?" — 선택지: **예** / **아니오**

아니오면 아무것도 바꾸지 않고 끝낸다.

## 4. release 브랜치에 cherry-pick

브랜치 이름은 `release/<첫 PR 제목을 줄인 kebab-case>`(이미 있으면 `-<PR 번호>`를 붙인다).

```bash
git status --porcelain                 # 커밋 안 한 변경이 있으면 멈춤 조건
git switch -c release/<이름> origin/main
```

고른 PR을 **develop에 머지된 순서대로** cherry-pick한다. `-x`로 원본 커밋을 기록한다(1단계의 "이미 반영됨" 판별에 쓰인다).

```bash
git rev-list --parents -n 1 <oid>      # 부모가 2개면 머지 커밋
git cherry-pick -x <oid>               # 일반(squash·rebase) 커밋
git cherry-pick -x -m 1 <oid>          # 머지 커밋
```

rebase로 머지된 PR은 커밋이 여러 개인데 `mergeCommit`은 마지막 것만 가리킨다. 머지 커밋이 아니고 `gh pr view <번호> --json commits --jq '.commits | length'`가 N(>1)이면 범위로 고른다: `git cherry-pick -x <oid>~N..<oid>`.

충돌하면 `git cherry-pick --abort` 후 원래 브랜치로 돌아가고(`git switch -`), release 브랜치를 지운 뒤(`git branch -D release/<이름>`) 멈춘다. 충돌 파일과 원인(대개 아직 main에 없는 다른 기능에 기대는 변경)을 보고한다.

## 5. main PR과 머지

```bash
git push -u origin release/<이름>
gh pr create --base main --head release/<이름> --title "release: <기능 요약>" --body "<포함 PR 목록(#번호 제목)>"
gh pr checks <pr> --watch --fail-fast   # CI가 없으면 바로 끝난다
gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed
gh pr view <pr> --json headRefOid,mergeStateStatus
```

머지 방식은 허용된 것이 하나면 그것, 여럿이면 squash(없으면 merge commit). 커밋 본문에 원본 기록을 남겨 다음 목록에서 제외되게 한다.

```bash
gh pr merge <pr> --<squash|merge|rebase> --match-head-commit <headRefOid> --delete-branch \
  --body "$(printf 'Includes #<번호> <제목>\n(cherry picked from commit <oid>)\n...')"
```

`--body`는 squash·merge에 쓰인다. rebase는 각 커밋에 `-x` 기록이 이미 있어 필요 없다.

머지 후 작업 트리가 깨끗하면 `git switch develop && git pull --ff-only`로 돌아간다.

## 멈춤 조건

다음이면 머지하지 않고, 지금까지 만든 브랜치·PR과 함께 상황을 보고한다. 강제 푸시·보호 규칙 우회는 하지 않는다.

- 커밋하지 않은 변경이 있음
- cherry-pick 충돌
- CI 실패
- `mergeStateStatus`가 `BLOCKED`(필수 리뷰 등) 또는 `DIRTY`

## 보고

포함한 PR, main PR URL, 머지 커밋 SHA(`gh pr view <pr> --json mergeCommit`), 지운 브랜치를 보고한다.
