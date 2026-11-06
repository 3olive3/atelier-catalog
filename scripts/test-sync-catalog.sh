#!/usr/bin/env bash
# test-sync-catalog.sh — proof that sync-catalog.py --check reads the built output.
# Builds a throwaway platform folder (catalog + butler source, one MCP), then breaks
# catalog.json and compat/mcps-catalog.json one at a time; --check must catch each.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
unset MCP_SOURCE_DIR MCP_NATIVE_MANIFEST MCP_CONSUMER_CATALOG

C="$T/atelier-catalog"
ID=demo
mkdir -p "$C/scripts" "$C/mcps" "$T/atelier-butler/mcp/$ID/src"
cp "$HERE/sync-catalog.py" "$HERE/build-catalog.py" "$C/scripts/"
printf '{"name":"%s","version":"1.0.0","description":"demo"}\n' "$ID" > "$T/atelier-butler/mcp/$ID/package.json"
printf 'server.tool("a", {}, async () => ({}));\nserver.tool("b", {}, async () => ({}));\n' > "$T/atelier-butler/mcp/$ID/src/index.ts"
cat > "$C/mcps/$ID.json" <<EOF
{"catalogID":"$ID","name":"Demo","description":"demo","version":"1.0.0","source":"builtIn","toolCount":2}
EOF

SYNC="python3 $C/scripts/sync-catalog.py"
out=""

# run <want-exit> <name> [text the output must carry]...
run() {
  local want="$1" name="$2" got; shift 2
  if out=$($SYNC --check 2>&1); then got=0; else got=$?; fi
  if [ "$got" != "$want" ]; then echo "FAIL $name: expected exit $want, got $got"; echo "$out"; exit 1; fi
  local msg
  for msg in "$@"; do
    if ! grep -qF -- "$msg" <<<"$out"; then echo "FAIL $name: output lacks \"$msg\""; echo "$out"; exit 1; fi
  done
  echo "ok   $name (exit $got)"
}

# edit <file> <python statement on d>
edit() {
  python3 - "$1" "$2" <<'PY'
import json, sys
p, stmt = sys.argv[1], sys.argv[2]
d = json.load(open(p))
exec(stmt)
json.dump(d, open(p, "w"), indent=2)
PY
}

clean() { $SYNC --write >/dev/null 2>&1 || { echo "FAIL clean: --write failed"; exit 1; }; }

clean
run 0 "write-then-check"

edit "$C/catalog.json" 'd["types"]["mcps"][0]["toolCount"] = 99'
run 1 "catalog-wrong-toolCount" "catalog.json" "$ID" "toolCount 99 -> 2"
clean

edit "$C/catalog.json" 'd["types"]["mcps"] = []'
run 1 "catalog-row-removed" "catalog.json" "$ID"
clean

edit "$C/compat/mcps-catalog.json" 'd["mcps"][0]["toolCount"] = 99'
run 1 "compat-wrong-toolCount" "compat/mcps-catalog.json" "$ID"
clean

run 0 "rewrite-then-check"
echo "all sync-catalog checks passed"
