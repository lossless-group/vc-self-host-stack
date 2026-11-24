#!/usr/bin/env bash
# Enrich people by social URL via context.dev, no SDK needed.
# Usage: ./enrich-people.sh https://linkedin.com/in/t3gg [more urls...]
# The key is read from ~/.secrets (CONTEXT_DEV_API_KEY); it never lives in this repo.
set -euo pipefail
[ -z "${CONTEXT_DEV_API_KEY:-}" ] && { set -a; source "$HOME/.secrets"; set +a; }
: "${CONTEXT_DEV_API_KEY:?CONTEXT_DEV_API_KEY not set}"
[ $# -gt 0 ] || set -- "https://linkedin.com/in/t3gg"
body=$(printf '%s\n' "$@" | jq -R . | jq -sc '{social_urls: .}')
curl -sS -X POST "https://api.context.dev/v1/people/enrich" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CONTEXT_DEV_API_KEY}" \
  -d "$body"
