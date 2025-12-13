#!/usr/bin/env bash
set -u

echo "[INFO] Starting frontend: npm run dev"
cd "$(dirname "$0")"

npm run dev

echo
echo "[INFO] npm run dev exited"
exec bash
