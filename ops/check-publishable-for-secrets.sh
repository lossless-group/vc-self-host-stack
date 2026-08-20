#!/usr/bin/env bash
# Leak check: does any value that secretspec declares for a client appear in the
# publishable tree (context-v/, changelog/, docs/, README.md)?
#
# Mechanism, not judgment. secretspec.toml declares WHAT is client-specific; the
# matching .env holds the values. This greps the tree for those literal values.
# Reports; never edits.
#
#   ops/check-publishable-for-secrets.sh            # all clients
#   ops/check-publishable-for-secrets.sh humain-vc  # one client
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
CLIENTS=${1:-}
PUBLISHABLE=(context-v changelog docs README.md)
found=0; checked=0

for spec in client-stacks/*/secretspec.toml; do
  client=$(basename "$(dirname "$spec")")
  [ -n "$CLIENTS" ] && [ "$client" != "$CLIENTS" ] && continue
  echo "── $client"

  # every declared key name, minus the ones explicitly marked publishable
  allow="client-stacks/$client/.publishable-values"
  keys=$(grep -oE '^[A-Z][A-Z0-9_]*' "$spec" | sort -u)
  if [ -f "$allow" ]; then
    skip=$(grep -oE '^[A-Z][A-Z0-9_]*' "$allow" | sort -u)
    keys=$(comm -23 <(echo "$keys") <(echo "$skip"))
    echo "   ($(echo "$skip" | grep -c .) key(s) allow-listed as publishable)"
  fi
  [ -z "$keys" ] && { echo "   (no declarations)"; continue; }

  # resolve each key's value from any .env under this client
  while IFS= read -r key; do
    val=$(find client-stacks/"$client" -name '.env' -type f -exec \
            sed -n "s/^${key}=//p" {} \; 2>/dev/null | head -1 | tr -d '"'"'"' \r')
    # skip empties, placeholders, and anything too short/generic to grep safely
    [ -z "$val" ] && continue
    [ ${#val} -lt 12 ] && continue
    case "$val" in *'<'*|*'{{'*|'changeme'*) continue;; esac
    checked=$((checked+1))
    hits=$(grep -rIl --fixed-strings "$val" "${PUBLISHABLE[@]}" 2>/dev/null)
    if [ -n "$hits" ]; then
      found=$((found+1))
      echo "   ❌ LEAK  $key"
      echo "$hits" | sed 's/^/        /'
    fi
  done <<< "$keys"
done

echo
if [ "$found" -eq 0 ]; then
  echo "✅ clean — $checked declared values checked, none present in the publishable tree"
else
  echo "❌ $found declared value(s) leaked. Remove them before publishing."
  exit 1
fi
