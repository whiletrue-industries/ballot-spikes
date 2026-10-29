#!/bin/zsh
# Hourly: download the latest count with local Chrome, rebuild data/k26.json, push → GitHub Pages redeploys.
# Installed as a launchd agent (see scripts/launchd.plist); logs go to data/raw/update.log.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$(dirname "$(command -v node)"):$PATH"
echo "--- $(date '+%F %T')"
# GitHub connections sometimes drop or stall: abort a stalled transfer after 30s, and retry with backoff
export GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=30
retry() { local n=0; until "$@"; do n=$((n+1)); [ $n -ge 5 ] && return 1; echo "retry $n: $*"; sleep $((2**n)); done; }
retry git pull --rebase --quiet
pnpm exec tsx scripts/download-results.ts data/raw/expb.csv
FETCHED_AT="$(date -u +%FT%TZ)" pnpm --silent results data/raw/expb.csv
pnpm --silent test >/dev/null
git add data/k26.json
if git diff --cached --quiet; then echo "no change"; exit 0; fi
git commit --quiet -m "Update Knesset 26 results ($(TZ=Asia/Jerusalem date '+%d/%m %H:%M'))"
retry git push --quiet
echo "pushed"
