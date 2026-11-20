#!/usr/bin/env bash
# Astro로 dist/에 빌드한 뒤 GitHub Pages가 서빙하는 repo 루트로 복사한다.

set -euo pipefail

cd "$(dirname "$0")/.."
if [[ ! -d node_modules ]]; then
  npm ci
fi

printf "\033[38;5;45mBuild the site...\033[38;5;15m\n"
npx astro build
cp -R dist/. .
