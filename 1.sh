#!/bin/bash
# 사용법: 프로젝트 루트에서 ./fix-api-urls.sh

set -e

echo "[fix-api-urls] 시작"

FILES=(
  "src/pages/Dashboard.tsx"
  "src/pages/DiagnosisEvaluation.tsx"
  "src/pages/IdentityControl.tsx"
  "src/pages/NetworkControl.tsx"
  "src/pages/ProcessControl.tsx"
  "src/pages/sbom.tsx"
)

for file in "${FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "[skip] $file (없음)"
    continue
  fi

  echo "[patch] $file"

  # 1) fetch('http://localhost:3001/api...  →  fetch(API_BASE_URL + '/...
  sed -i "s|fetch('http://localhost:3001/api|fetch(API_BASE_URL + '|g" "$file"

  # 2) fetch(`http://localhost:3001/api...  →  fetch(`${API_BASE_URL}/...
  sed -i "s|fetch(\`http://localhost:3001/api|fetch(\`${API_BASE_URL}|g" "$file"

  # 3) sbom.tsx: const BASE = 'http://localhost:3001/api' → const BASE = API_BASE_URL
  sed -i "s|const BASE = 'http://localhost:3001/api'|const BASE = API_BASE_URL|g" "$file"

  # 4) API_BASE_URL을 쓰는데 import가 없으면 맨 위에 추가
  if grep -q "API_BASE_URL" "$file"; then
    if ! grep -q "import { API_BASE_URL } from '../utils/api';" "$file"; then
      sed -i "1i import { API_BASE_URL } from '../utils/api';" "$file"
      echo "[import 추가] $file"
    fi
  fi
done

echo "[fix-api-urls] 완료"

