#!/usr/bin/env bash
# Build a Claude-Desktop-installable zip from an agent-skill folder.
#
#   ops/build-skill-bundle.sh decilehub-interface [outdir]
#
# Produces <outdir>/<skill>.zip with one top-level directory containing SKILL.md
# — the layout Claude Desktop's Skills uploader expects. Refuses to build if the
# frontmatter description exceeds Desktop's 1024-character limit.
set -euo pipefail
cd "$(dirname "$0")/.."
SKILL=${1:?usage: build-skill-bundle.sh <skill-name> [outdir]}
OUT=${2:-$HOME/Downloads}
SRC="context-v/agent-skills/$SKILL"
[ -d "$SRC" ] || { echo "✗ no such skill: $SRC"; exit 1; }
[ -f "$SRC/SKILL.md" ] || { echo "✗ $SRC has no SKILL.md"; exit 1; }

python3 - "$SRC/SKILL.md" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
m = re.search(r'^description: (.*?)\n(?=[a-z_]+:|---)', s, re.S | re.M)
if not m:
    sys.exit("✗ no description in frontmatter")
n = len(m.group(1))
if n > 1024:
    sys.exit(f"✗ description is {n} chars — Claude Desktop rejects anything over 1024. "
             f"Trim {n-1024} before shipping.")
print(f"  description {n}/1024 chars — ok")
PY

STAGE=$(mktemp -d)
cp -R "$SRC" "$STAGE/$SKILL"
find "$STAGE" \( -name '.DS_Store' -o -name '*.swp' \) -delete
rm -f "$OUT/$SKILL.zip"
(cd "$STAGE" && zip -qr "$OUT/$SKILL.zip" "$SKILL")
rm -rf "$STAGE"
echo "  → $OUT/$SKILL.zip  ($(unzip -l "$OUT/$SKILL.zip" | tail -1 | awk '{print $2}') files)"
echo
echo "Attach it to a GitHub Release so non-git people can download it:"
echo "  gh release create skill-$SKILL-\$(date +%Y%m%d) \"$OUT/$SKILL.zip\" \\"
echo "     --title \"$SKILL \$(date +%Y-%m-%d)\" --notes 'What changed…'"
