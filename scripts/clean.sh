#!/usr/bin/env bash
# repo 루트의 생성물(scripts/generated-paths.txt)만 지운다. 소스 디렉터리는 목록에 있어도 지우지 않는다.

set -euo pipefail

cd "$(dirname "$0")/.."
if [[ ! -f astro.config.mjs ]]; then
  echo "repo 루트를 찾지 못했습니다." >&2
  exit 1
fi

PROTECTED=(.git .github .vscode assets content node_modules public scripts src tests dist .astro CNAME README.md AGENTS.md Makefile package.json package-lock.json astro.config.mjs tsconfig.json)

printf "\033[38;5;45mRemove all generated files and directories...\033[38;5;15m\n"

shopt -s nullglob
while IFS= read -r pattern; do
  [[ -z "$pattern" || "$pattern" == \#* ]] && continue
  for path in $pattern; do
    name="${path%/}"
    for protected in "${PROTECTED[@]}"; do
      if [[ "$name" == "$protected" ]]; then
        echo "보호 대상 경로라서 지우지 않습니다: $name" >&2
        exit 1
      fi
    done
    rm -rf -- "$name"
  done
done < scripts/generated-paths.txt
