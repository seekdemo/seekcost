#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
repo="${RESTIC_REPOSITORY:-/backups}"
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
[[ "$repo" = /* && "$repo" != / ]] || { echo "A local absolute backup repository is required" >&2; exit 2; }
[[ "$interval" =~ ^[0-9]+$ && "$interval" -ge 60 ]] || { echo "Backup interval must be at least 60 seconds" >&2; exit 2; }
mkdir -p "$repo"
export RESTIC_REPOSITORY="$repo"

notify() {
  if [[ -n "${BACKUP_WEBHOOK_URL:-}" ]]; then
    [[ "$BACKUP_WEBHOOK_URL" = https://* ]] || { echo "Notification endpoint must use HTTPS" >&2; return 1; }
    curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
      -H 'Content-Type: application/json' --data "{\"service\":\"seekcost-backup\",\"status\":\"$1\"}" \
      "$BACKUP_WEBHOOK_URL" >/dev/null
  fi
}

failure() {
  local code=$?
  trap - ERR
  printf '%s\n' "$(date -u +%FT%TZ) backup failed; inspect logs" > "$repo/.seekcost-failed"
  echo "BACKUP FAILED: last successful recovery point has not been advanced." >&2
  notify failed || echo "BACKUP ALERT DELIVERY FAILED" >&2
  exit "$code"
}

if [[ "${1:-once}" = loop ]]; then
  while true; do
    bash "$0" once || echo "Backup failed; next scheduled attempt in ${interval}s" >&2
    sleep "$interval"
  done
fi
[[ "${1:-once}" = once ]] || { echo "Usage: backup.sh [once|loop]" >&2; exit 2; }

# Shared local lock prevents manual and scheduled jobs racing their health markers.
exec 9>"$repo/.seekcost.lock"
flock -n 9 || { echo "Another backup is running" >&2; exit 75; }
trap failure ERR
test -s "${RESTIC_PASSWORD_FILE:?A backup password file is required}"
if [[ ! -f "$repo/config" ]]; then restic init; fi
report=$(mktemp "$repo/.seekcost-report.XXXXXX")
trap 'rm -f -- "$report"' EXIT
# The dump exists as plaintext only in a pipe, not as a file on this host.
# A failed pg_dump can leave an incomplete Restic snapshot; never advance the
# successful snapshot marker unless BOTH commands and optional replication pass.
pg_dump --format=custom --no-owner --no-acl | restic backup --stdin --stdin-filename seekcost.dump --tag seekcost --json > "$report"
snapshot=$(jq -er 'select(.message_type == "summary") | .snapshot_id' "$report")
[[ "$snapshot" =~ ^[a-f0-9]{8,64}$ ]]
if [[ -n "${OFFSITE_REPOSITORY:-}" ]]; then
  restic -r "$OFFSITE_REPOSITORY" copy --from-repo "$repo" --from-password-file "$RESTIC_PASSWORD_FILE"
fi
printf '%s\n%s\n' "$(date +%s)" "$snapshot" > "$repo/.seekcost-success.tmp"
mv "$repo/.seekcost-success.tmp" "$repo/.seekcost-success"
rm -f -- "$repo/.seekcost-failed"
echo "Backup completed. Verified pipeline snapshot: $snapshot"
notify ok
