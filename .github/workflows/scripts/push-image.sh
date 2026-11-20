#!/usr/bin/env bash
#
# 把本地已构建、已冒烟检查过的镜像推送到 Docker Hub。
#
# 用法：push-image.sh <本地镜像> <远端仓库> <版本 tag>
#   push-image.sh hgnuoj-backend:abc123 ztl123z/hgnu-backend 20261119-063000
#
# 远端会打两个 tag：
#   <远端>:<版本>    不可变，YYYYMMDD-HHMMSS (UTC)，由 prepare 作业统一计算
#   <远端>:latest    跟随最近一次发布
# 两者指向同一个本地镜像，保证推上去的就是被测试过的那个 digest。
#
# 依赖：调用前已 docker login；GITHUB_STEP_SUMMARY 可选（有就写一份发布摘要）。

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <local-image> <remote-repo> <version>" >&2
  exit 2
fi

LOCAL_IMAGE="$1"
REMOTE="$2"
VERSION="$3"

if [ -z "$VERSION" ]; then
  echo "error: empty version tag" >&2
  exit 2
fi

VERSION_TAG="$REMOTE:$VERSION"

docker tag "$LOCAL_IMAGE" "$VERSION_TAG"
docker tag "$LOCAL_IMAGE" "$REMOTE:latest"

echo "Publishing $VERSION_TAG and $REMOTE:latest"
# 先推不可变 tag，再推 latest：中途失败时 latest 不会指向只推了一半的版本
docker push "$VERSION_TAG"
docker push "$REMOTE:latest"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "- \`$VERSION_TAG\`（同一版本另有 \`$REMOTE:latest\`）"
    echo "  - 源码 commit: \`${GITHUB_SHA:-unknown}\`"
  } >> "$GITHUB_STEP_SUMMARY"
fi
