#!/usr/bin/env bash

# Exit on error
set -ex

git add -A
msg="rebuilding site $(date '+%Y-%m-%dT%H:%M:%S %Z%z') on Unix-like system"
git commit -m "$msg"

printf "\033[38;5;46mDeploying updates to GitHub...\033[38;5;15m\n"
git push origin $(git rev-parse --abbrev-ref HEAD)

printf "\033[38;5;198mCOMPLETE! \033[38;5;15m\n"
