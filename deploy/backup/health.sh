#!/usr/bin/env bash
set -euo pipefail
repo="${RESTIC_REPOSITORY:-/backups}"
[[ ! -f "$repo/.seekcost-failed" && -s "$repo/.seekcost-success" ]] || exit 1
read -r last < "$repo/.seekcost-success"
[[ "$last" =~ ^[0-9]+$ ]] || exit 1
age=$(( $(date +%s) - last ))
[[ "$age" -ge 0 && "$age" -le $(( ${BACKUP_INTERVAL_SECONDS:-86400} + 3600 )) ]]
