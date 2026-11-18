---
name: git-feature
description: 기능 추가·수정을 시작할 때 최신 develop에서 feature/<기능명> 브랜치를 만들어 작업하고, 끝나면 사용자 확인을 받아 커밋·푸시하고 develop으로 PR을 연다. main이나 develop에 직접 커밋하지 않는다.
when_to_use: git 저장소에서 기능 추가·수정·버그 수정 등 코드를 바꾸는 작업을 시작할 때("기능 추가해줘", "이거 고쳐줘", "feature 브랜치 만들어줘"). 문서 한 줄 같은 사소한 수정도 저장소에 develop이 있으면 따른다. 머지는 git-pr-merge, main 반영은 git-main-merge가 맡는다.
argument-hint: "[기능 설명]"
---

# feature 브랜치로 기능 작업

규칙: 기능 수정은 **develop에서 만든 `feature/<기능명>` 브랜치**에서 하고, PR은 **develop으로** 연다. main 반영은 나중에 사용자가 요청할 때 `git-main-merge`로 한다.

## 1. 시작 전 확인

```bash
git status --porcelain
git fetch origin
git ls-remote --exit-code --heads origin develop
```

- 커밋하지 않은 변경이 있으면 브랜치를 바꾸지 말고, 그 변경을 어떻게 할지(새 feature 브랜치로 가져가기·stash·중단) 사용자에게 묻는다.
- 이미 이 기능의 `feature/*` 브랜치에 있으면 새로 만들지 않고 그대로 작업한다.
- `origin`에 develop이 없으면 "main에서 develop을 만들어 푸시할까요?"라고 묻는다. 예면:

  ```bash
  git switch -c develop origin/main && git push -u origin develop
  ```

  아니오면 규칙 대상이 아닌 저장소로 보고, 브랜치 규칙 없이 작업한다.

## 2. 브랜치 만들기

`<기능명>`은 기능을 나타내는 짧은 영문 kebab-case(예: `login-rate-limit`). 같은 이름이 이미 있으면 다른 이름을 고른다.

```bash
git switch -c feature/<기능명> origin/develop
```

## 3. 작업

이 브랜치에서 수정한다. main·develop으로 브랜치를 바꿔 커밋하지 않는다. 프로젝트에 테스트·린트·빌드가 있으면 끝나기 전에 돌린다.

## 4. 커밋·PR (확인 후)

수정이 끝나면 바뀐 내용을 요약하고 **"커밋하고 develop으로 PR 열까요?"라고 한 번 묻는다.** 예면:

```bash
git add <바꾼 파일>
git commit -m "<무엇을 왜 바꿨는지>"
git push -u origin feature/<기능명>
gh pr create --base develop --head feature/<기능명> --title "<기능 요약>" --body "<변경 내용·테스트 결과>"
```

- 커밋 메시지는 저장소의 기존 관례(언어·형식)를 따른다.
- PR URL을 보고하고 멈춘다. 머지는 사용자가 요청하면 `git-pr-merge`로 한다.
- 아니오면 브랜치에 변경을 둔 채 멈춘다.
