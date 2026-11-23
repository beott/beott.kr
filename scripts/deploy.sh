#!/usr/bin/env bash
# build가 끝난 release 작업 트리를 site gate(preflight → consume → post-commit)로 확인한 뒤에만 commit·push한다.
# 필요 환경 변수: SITE_GATE_INPUT, SITE_GATE_RECEIPT(절대 경로), ORCA_AGENT_SESSION_ID. 없거나 거절되면 commit·push하지 않는다.

set -euo pipefail

cd "$(dirname "$0")/.."
msg="rebuilding site $(date '+%Y-%m-%dT%H:%M:%S %Z%z') on Unix-like system"
node scripts/site-gate-deploy.mjs "$msg"

printf "\033[38;5;198mCOMPLETE! \033[38;5;15m\n"
