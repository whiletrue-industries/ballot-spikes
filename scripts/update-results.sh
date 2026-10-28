#!/bin/zsh
# Hourly: download the latest count with local Chrome, rebuild data/k26.json, push → GitHub Pages redeploys.
# Installed as a launchd agent (see scripts/launchd.plist); logs go to data/raw/update.log.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$(dirname "$(command -v node)"):$PATH"
echo "--- $(date '+%F %T')"
git pull --rebase --quiet
pnpm exec tsx scripts/download-results.ts data/raw/expb.csv
FETCHED_AT="$(date -u +%FT%TZ)" pnpm --silent results data/raw/expb.csv
pnpm --silent test >/dev/null
git add data/k26.json
if git diff --cached --quiet; then echo "no change"; exit 0; fi
git commit --quiet -m "Update Knesset 26 results ($(TZ=Asia/Jerusalem date '+%d/%m %H:%M'))"
git push --quiet
echo "pushed"
