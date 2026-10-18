#!/usr/bin/env bash
# install-agent-personas.sh — install the reviewed persona files (agent-personas/)
# into the live Bridge workspaces, which are not in git.
#
# Run BY HAND on UNRAID, from a checkout of atelier-catalog:
#   bash scripts/install-agent-personas.sh                 # DRY RUN: shows the diffs, changes nothing
#   bash scripts/install-agent-personas.sh --apply         # backs up, then writes
#   bash scripts/install-agent-personas.sh --only eletricista,cinema [--apply]
#
# What it touches: only IDENTITY.md, SOUL.md and USER.md, and only those present in
# agent-personas/<agent>/. Never TOOLS.md, AGENTS.md, MEMORY.md (or anything else).
# Butler-generated blocks in the live file (<!-- BEGIN … --> … <!-- END … -->, e.g.
# CASA LIMA PREFERÊNCIAS and ATELIER MEMORY in a person's USER.md) are kept verbatim,
# appended after the reviewed text. Every replaced file is first copied to
# <file>.bak-personas-YYYYMMDD-HHMMSS with its owner and mode; the new file gets the
# old one's owner and mode. Running it twice changes nothing the second time.
#
# Where: filipe → $ROOT/workspace; everyone else → $ROOT/config/agents/<id>/workspace.
# ROOT defaults to /mnt/cache/appdata/atelier-bridge (override with --root, for tests).
#
# Note (F3): the person agents' IDENTITY.md (filipe, vice, chico) name the Harness's
# `mcp__atelier__delegar`. Install those when those people move to the Harness; the
# specialists' and the guest's files are runtime-neutral.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HERE/agent-personas"
ROOT="/mnt/cache/appdata/atelier-bridge"
APPLY=0
ONLY=""
FILES=(IDENTITY.md SOUL.md USER.md)

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --only) ONLY="${2:?--only needs a list}"; shift ;;
    --root) ROOT="${2:?--root needs a path}"; shift ;;
    --src) SRC="${2:?--src needs a path}"; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -d "$SRC" ] || { echo "no persona source at $SRC" >&2; exit 2; }
[ -d "$ROOT" ] || { echo "no Bridge root at $ROOT" >&2; exit 2; }
TS="$(date +%Y%m%d-%H%M%S)"

workspace_of() { if [ "$1" = filipe ]; then echo "$ROOT/workspace"; else echo "$ROOT/config/agents/$1/workspace"; fi; }

# Owner and mode of a file, portable (GNU stat on UNRAID, BSD stat on a Mac for tests).
owner_of() { stat -c '%u:%g' "$1" 2>/dev/null || stat -f '%u:%g' "$1"; }
mode_of()  { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

# The Butler-generated blocks of a file, verbatim, in order (empty if none).
generated_blocks() {
  [ -f "$1" ] || return 0
  awk '
    /^<!-- BEGIN [^>]*-->[[:space:]]*$/ && !on { on=1; if (n++) print "" }
    on { print }
    on && /^<!-- END [^>]*-->[[:space:]]*$/ { on=0 }
  ' "$1"
}

# The content the live file should have: the reviewed text + the live generated blocks.
desired() {
  local src="$1" live="$2" blocks
  blocks="$(generated_blocks "$live")"
  # Reviewed text, trailing blank lines trimmed, one final newline.
  awk '{ lines[NR]=$0 } END { n=NR; while (n>0 && lines[n] ~ /^[[:space:]]*$/) n--; for (i=1;i<=n;i++) print lines[i] }' "$src"
  if [ -n "$blocks" ]; then printf '\n%s\n' "$blocks"; fi
}

changed=0; unchanged=0; created=0
rollback=()
agents=()
for d in "$SRC"/*/; do agents+=("$(basename "$d")"); done
if [ -n "$ONLY" ]; then IFS=, read -r -a agents <<<"$ONLY"; fi

for a in "${agents[@]}"; do
  case "$a" in *[!a-z0-9-]*|"") echo "bad agent id: $a" >&2; exit 2 ;; esac
  [ -d "$SRC/$a" ] || { echo "no personas for $a in $SRC" >&2; exit 2; }
  ws="$(workspace_of "$a")"
  if [ ! -d "$ws" ]; then echo "SKIP $a: no workspace at $ws"; continue; fi
  for f in "${FILES[@]}"; do
    src="$SRC/$a/$f"
    [ -f "$src" ] || continue
    live="$ws/$f"
    # Dry run: the candidate lives outside the workspace (nothing is written there).
    if [ "$APPLY" -eq 1 ]; then tmp="$(mktemp "$ws/.persona.XXXXXX")"; else tmp="$(mktemp)"; fi
    desired "$src" "$live" >"$tmp"
    if [ -f "$live" ] && cmp -s "$tmp" "$live"; then
      rm -f "$tmp"; unchanged=$((unchanged+1)); echo "same     $a/$f"; continue
    fi
    if [ "$APPLY" -eq 0 ]; then
      echo "WOULD    $a/$f"
      old="$live"; [ -f "$live" ] || old=/dev/null
      diff -u --label "live $a/$f" --label "new  $a/$f" "$old" "$tmp" || true
      [ -f "$live" ] || echo "         (new file)"
      rm -f "$tmp"; changed=$((changed+1)); continue
    fi
    if [ -f "$live" ]; then
      bak="$live.bak-personas-$TS"
      cp -p "$live" "$bak"
      chown "$(owner_of "$live")" "$tmp" 2>/dev/null || true
      chmod "$(mode_of "$live")" "$tmp"
      mv "$tmp" "$live"
      rollback+=("cp -p '$bak' '$live'")
      changed=$((changed+1)); echo "WROTE    $a/$f (backup: $(basename "$bak"))"
    else
      chmod 644 "$tmp"
      chown "$(owner_of "$ws")" "$tmp" 2>/dev/null || true
      mv "$tmp" "$live"
      rollback+=("rm '$live'")
      created=$((created+1)); echo "CREATED  $a/$f"
    fi
  done
done

if [ "$APPLY" -eq 0 ]; then
  echo "DRY RUN: $changed file(s) would change, $unchanged unchanged. Nothing written. Re-run with --apply."
else
  echo "Applied: $changed replaced, $created created, $unchanged unchanged."
  if [ ${#rollback[@]} -gt 0 ]; then
    echo "Rollback:"
    for r in "${rollback[@]}"; do echo "  $r"; done
  fi
fi
