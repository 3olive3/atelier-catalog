#!/usr/bin/env bash
# test-install-agent-personas.sh — proof of the persona installer against a fake
# Bridge root: the dry run writes nothing; --apply backs up and writes; a second
# --apply changes nothing; Butler-generated blocks survive verbatim; TOOLS.md,
# AGENTS.md and MEMORY.md are never touched; the rollback restores the original.
set -euo pipefail
cd "$(dirname "$0")/.."
INSTALL="bash scripts/install-agent-personas.sh"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

R="$T/bridge"
mkdir -p "$R/workspace"
for a in agent-personas/*/; do
  a=$(basename "$a"); [ "$a" = filipe ] && continue
  mkdir -p "$R/config/agents/$a/workspace"
  for f in IDENTITY.md SOUL.md USER.md TOOLS.md AGENTS.md; do echo "# old $f of $a" > "$R/config/agents/$a/workspace/$f"; done
done
for f in IDENTITY.md SOUL.md USER.md TOOLS.md AGENTS.md MEMORY.md; do echo "# old $f of filipe" > "$R/workspace/$f"; done
# A person's USER.md with the two Butler-generated blocks, as live.
cat > "$R/config/agents/guida/workspace/USER.md" <<'EOF'
# USER.md — old text that says "actualizo esta secção"

<!-- BEGIN CASA LIMA PREFERÊNCIAS — gerado pelo Butler; não aqui -->

## Língua e decisões

- Responde em pt-PT.
<!-- END CASA LIMA PREFERÊNCIAS -->

<!-- BEGIN ATELIER MEMORY — gerado pelo Butler; não edites aqui -->
- Preferência: livros policiais. <!-- mem_abc -->
<!-- END ATELIER MEMORY -->
EOF
chmod 600 "$R/config/agents/guida/workspace/USER.md"
snap() { (cd "$R" && find . -type f -exec shasum {} + | sort); }

before=$(snap)
out=$($INSTALL --root "$R")
check "dry run reports changes"            'grep -q "DRY RUN: [1-9][0-9]* file(s) would change" <<<"$out"'
check "dry run writes nothing"             '[ "$(snap)" = "$before" ]'

out=$($INSTALL --root "$R" --apply)
U="$R/config/agents/guida/workspace/USER.md"
check "apply wrote files"                  'grep -q "^WROTE" <<<"$out"'
check "guida USER.md has new text"         'grep -q "Chama-lhe Guida" "$U"'
check "old text is gone"                   '! grep -q "actualizo" "$U"'
check "PREFERÊNCIAS block kept verbatim"   'grep -q "^<!-- BEGIN CASA LIMA PREFERÊNCIAS" "$U" && grep -q "^- Responde em pt-PT.$" "$U" && grep -q "^<!-- END CASA LIMA PREFERÊNCIAS -->$" "$U"'
check "MEMORY block kept verbatim"         'grep -qF -- "- Preferência: livros policiais. <!-- mem_abc -->" "$U"'
check "mode kept (600)"                    '[ "$( stat -c %a "$U" 2>/dev/null || stat -f %Lp "$U")" = 600 ]'
check "backup exists"                      'ls "$U".bak-personas-* >/dev/null 2>&1'
check "TOOLS.md untouched"                 'grep -q "^# old TOOLS.md of cinema$" "$R/config/agents/cinema/workspace/TOOLS.md"'
check "AGENTS.md untouched"                'grep -q "^# old AGENTS.md of filipe$" "$R/workspace/AGENTS.md"'
check "MEMORY.md untouched"                'grep -q "^# old MEMORY.md of filipe$" "$R/workspace/MEMORY.md"'
check "filipe USER.md untouched (no repo copy)" 'grep -q "^# old USER.md of filipe$" "$R/workspace/USER.md"'
check "filipe IDENTITY.md installed"       'grep -q "mcp__atelier__delegar" "$R/workspace/IDENTITY.md"'
check "rollback printed"                   'grep -q "^Rollback:" <<<"$out"'

after1=$(snap)
out=$($INSTALL --root "$R" --apply)
check "second apply changes nothing"       'grep -q "Applied: 0 replaced, 0 created" <<<"$out" && [ "$(snap)" = "$after1" ]'
out=$($INSTALL --root "$R")
check "dry run after apply: 0 to change"   'grep -q "DRY RUN: 0 file(s) would change" <<<"$out"'

# Rollback restores the original byte for byte.
bak=$(ls "$U".bak-personas-* | head -1)
cp -p "$bak" "$U"
check "rollback restores the original"     'grep -q "actualizo esta secção" "$U"'

# --only limits the run.
out=$($INSTALL --root "$R" --only guida)
check "--only touches only that agent"     '! grep -q "cinema/" <<<"$out" && grep -q "guida/USER.md" <<<"$out"'

# The reviewed personas carry none of the OpenClaw-era text.
check "no OpenClaw-era text in personas"   '! grep -rniE "sessions_spawn|agents_list|kimchi|scout|content factory|actualiz|atualizo|update (these|this) file|nunca respondas? .?não consigo|\\bvocê\\b|https?://" agent-personas --include="*.md" | grep -v README.md'

exit $fail
