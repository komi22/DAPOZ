#!/usr/bin/env bash
set -u

echo "[INFO] Starting backend: node server/index.cjs"
cd "$(dirname "$0")"

node server/index.cjs

echo
echo "[INFO] node server exited"
exec bash
