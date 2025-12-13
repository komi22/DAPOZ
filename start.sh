#!/usr/bin/env bash
set -u

###############################################################################
# 기본 경로 설정 (이 스크립트가 있는 위치 기준)
###############################################################################
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# mintty 경로 확인
MINTTY="$(command -v mintty)"
if [ -z "$MINTTY" ]; then
  echo "[FATAL] mintty not found. Run this in Git Bash."
  exit 1
fi

echo "==============================================="
echo "Admin Node launcher"
echo "Base dir: $BASE_DIR"
echo "mintty  : $MINTTY"
echo "==============================================="

###############################################################################
# 공통 launch 함수 (독립 쉘)
###############################################################################
launch () {
  local title="$1"
  local script="$2"

  echo "[LAUNCH] $title -> $script"

  "$MINTTY" -w normal --title "$title" \
    bash -lc "cd \"$BASE_DIR\" && ./$script; exec bash" &
}

###############################################################################
# Node / Frontend processes
###############################################################################
launch "NODE-Frontend (npm run dev)" npm_dev.sh
launch "NODE-Backend (node index.cjs)" node_backend.sh

echo "==============================================="
echo "Admin Node shells launched"
echo "==============================================="