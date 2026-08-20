#!/usr/bin/env bash
# Railway shim: repair volume ownership as root, then hand off to the upstream
# OpenSearch entrypoint as UID 1000. See Dockerfile for why this is needed.
set -euo pipefail

OPENSEARCH_HOME=/usr/share/opensearch
DATA_DIR="${OPENSEARCH_PATH_DATA:-${OPENSEARCH_HOME}/data}"
UPSTREAM="${OPENSEARCH_HOME}/opensearch-docker-entrypoint.sh"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"

  # Recursive chown is O(files) — on a large index that is slow and pointless
  # on every boot. The mount root's owner is the reliable signal: Railway
  # hands us a root-owned mount exactly once, on first attach.
  current_owner="$(stat -c '%u' "$DATA_DIR")"
  if [ "$current_owner" != "1000" ]; then
    echo "[railway-entrypoint] $DATA_DIR owned by uid $current_owner; chowning to 1000"
    chown -R 1000:1000 "$DATA_DIR"
  fi

  echo "[railway-entrypoint] dropping to uid 1000 and exec'ing upstream entrypoint"
  exec setpriv --reuid=1000 --regid=1000 --init-groups "$UPSTREAM" "$@"
fi

# Already unprivileged (e.g. RAILWAY_RUN_UID unset, or run locally): the volume
# fix is impossible and unnecessary — defer to upstream and let it speak.
exec "$UPSTREAM" "$@"
