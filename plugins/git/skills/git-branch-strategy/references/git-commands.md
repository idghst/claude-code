# 전략별 Git 명령 예시

아래는 각 전략의 전형적인 로컬 명령이다. 원격 저장소 이름과 보호 브랜치 규칙은 팀 문서에 맞춘다. 병합은 로컬에서 직접 하기보다 PR/MR로 하는 편이 안전하다.

## Git Flow

```bash
# 통합 브랜치에서 기능 시작
git checkout develop
git pull
git checkout -b feature/123-login

# 기능 개발 후 develop로 병합 (보통 PR/MR)
git checkout develop
git pull
git merge --no-ff feature/123-login
git push origin develop
git branch -d feature/123-login

# 배포 준비
git checkout develop
git checkout -b release/1.2.0
# QA 수정은 release/1.2.0에서만 커밋

# 릴리스를 main에 병합하고 태그, develop에 역병합
git checkout main
git pull
git merge --no-ff release/1.2.0
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin main --tags

git checkout develop
git pull
git merge --no-ff release/1.2.0
git push origin develop
git branch -d release/1.2.0

# 핫픽스: main에서 분기 → main 태깅 → develop, 열린 release에도 반영
git checkout main
git pull
git checkout -b hotfix/1.2.1
# ... 수정 커밋 ...

git checkout main
git merge --no-ff hotfix/1.2.1
git tag -a v1.2.1 -m "Hotfix 1.2.1"
git push origin main --tags

git checkout develop
git merge --no-ff hotfix/1.2.1
git push origin develop

# 열린 릴리스가 있으면 반드시 함께 반영
git checkout release/1.3.0
git merge --no-ff hotfix/1.2.1
git push origin release/1.3.0

git branch -d hotfix/1.2.1
```

## GitHub Flow

```bash
git checkout main
git pull
git checkout -b feature/123-login
# ... 커밋 ...
git push -u origin feature/123-login
# GitHub에서 Pull Request를 열고 리뷰·CI 통과 후 병합
# 병합 방식은 팀이 정한 merge / squash / rebase 하나를 쓴다

git checkout main
git pull
git branch -d feature/123-login
git push origin --delete feature/123-login
# CI/CD가 main 병합을 감지해 배포
```

## GitLab Flow

```bash
# 작업은 main에서 분기해 main으로 MR
git checkout main
git pull
git checkout -b feature/123-login
# ... 커밋 ...
git push -u origin feature/123-login
# Merge Request로 main에 병합

# 환경형: 앞방향으로만 승격
git checkout staging
git pull
git merge --no-ff main
git push origin staging
# staging Job이 테스트 환경에 배포

git checkout production
git pull
git merge --no-ff staging
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin production --tags
# production 또는 태그 Job이 운영 배포

# 운영 수정은 같은 날 main으로 cherry-pick
git checkout main
git cherry-pick <production-fix-sha>
git push origin main

# 버전형: release/x.y에는 cherry-pick만
git checkout release/1.2
git cherry-pick <fix-sha>
git push origin release/1.2
git checkout main
git cherry-pick <fix-sha>
git push origin main
```

## Trunk-Based Development

```bash
git checkout main
git pull
git checkout -b feat/short-login
# 몇 시간~1일 안에 끝낸다. 미완성 기능은 feature flag 뒤에 둔다.
# ... 커밋 ...
git push -u origin feat/short-login
# PR 또는 직접 병합. 하루 최소 1회, 활성 브랜치는 3개 이하.

git checkout main
git pull
git merge --no-ff feat/short-login   # 또는 squash
git push origin main
git branch -d feat/short-login
# CI가 빌드·테스트·배포

# 스냅샷용 릴리스 브랜치를 쓰는 경우. 여기서 고친 내용은 즉시 trunk로.
git checkout main
git checkout -b release/1.2.0
git push -u origin release/1.2.0
git checkout main
git cherry-pick <release-fix-sha>
git push origin main
```
