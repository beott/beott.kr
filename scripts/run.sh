#!/usr/bin/env bash
# Astro 개발 서버를 실행한다.

set -euo pipefail

cd "$(dirname "$0")/.."
if [[ ! -d node_modules ]]; then
  npm ci
fi

echo "Run the site..."
npx astro dev --host 0.0.0.0
