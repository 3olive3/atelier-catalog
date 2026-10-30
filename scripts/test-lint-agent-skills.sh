#!/usr/bin/env bash
# test-lint-agent-skills.sh — proof that the agent-skills lint refuses what it must.
# Builds a good plugin and one bad variant per rule in a temp dir; the good one must
# pass, every bad one must fail. Also checks the digest is stable and content-sensitive.
set -euo pipefail
cd "$(dirname "$0")/.."
LINT="node scripts/lint-agent-skills.mjs"
DIGEST="node scripts/agent-skills-digest.mjs"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail=0

good() {
  local d="$1"
  mkdir -p "$d/.claude-plugin" "$d/skills/exemplo"
  printf '{"name":"casa","version":"1.0.0","description":"teste"}\n' > "$d/.claude-plugin/plugin.json"
  printf -- '---\nname: exemplo\ndescription: Usa num teste.\n---\n\n# Exemplo\n\nTexto.\n' > "$d/skills/exemplo/SKILL.md"
}

expect() { # expect pass|fail <name> <dir> [message the failure must carry]
  local want="$1" name="$2" dir="$3" msg="${4:-}" got out
  if out=$($LINT "$dir" 2>&1); then got=pass; else got=fail; fi
  if [ "$got" != "$want" ]; then echo "FAIL $name: expected $want, got $got"; echo "$out"; fail=1; return; fi
  if [ -n "$msg" ] && ! grep -qF -- "$msg" <<<"$out"; then echo "FAIL $name: failed, but not for \"$msg\""; echo "$out"; fail=1; return; fi
  echo "ok   $name ($got${msg:+: $msg})"
}

good "$T/good"; expect pass good "$T/good"
expect pass repo agent-skills

v() { local n="$1"; good "$T/$n"; echo "$T/$n"; }
d=$(v hooks);      mkdir -p "$d/hooks"; echo '{}' > "$d/hooks/hooks.json";          expect fail hooks-dir "$d" 'forbidden directory "hooks/"'
d=$(v mcpjson);    echo '{"mcpServers":{}}' > "$d/.mcp.json";                       expect fail mcp-json "$d" 'forbidden file ".mcp.json"'
d=$(v agents);     mkdir -p "$d/agents"; echo x > "$d/agents/a.md";                 expect fail agents-dir "$d" 'forbidden directory "agents/"'
d=$(v commands);   mkdir -p "$d/commands"; echo x > "$d/commands/c.md";             expect fail commands-dir "$d" 'forbidden directory "commands/"'
d=$(v url);        echo 'Vê https://example.org' >> "$d/skills/exemplo/SKILL.md";  expect fail url "$d" "contains a URL"
d=$(v secret);     echo 'api_key = abcdef1234567890XYZ' >> "$d/skills/exemplo/SKILL.md"; expect fail secret "$d" "credential assignment"
d=$(v pkey);       echo '-----BEGIN RSA PRIVATE KEY-----' >> "$d/skills/exemplo/SKILL.md"; expect fail private-key "$d" "private key"
d=$(v extra);      echo x > "$d/skills/exemplo/helper.md";                          expect fail extra-file "$d" "unexpected file"
d=$(v script);     echo 'echo hi' > "$d/run.sh";                                    expect fail extra-script "$d" "unexpected file"
d=$(v symlink);    ln -s SKILL.md "$d/skills/exemplo/LINK.md";                      expect fail symlink "$d" "symlink not allowed"
d=$(v name);       sed -i.bak 's/^name: exemplo/name: outro/' "$d/skills/exemplo/SKILL.md"; rm "$d/skills/exemplo/SKILL.md.bak"; expect fail name-mismatch "$d" "must equal the directory"
d=$(v nofm);       printf '# Sem frontmatter\n' > "$d/skills/exemplo/SKILL.md";     expect fail no-frontmatter "$d" "missing YAML frontmatter"
d=$(v size);       head -c 13000 /dev/zero | tr '\0' 'a' | fold -w 80 >> "$d/skills/exemplo/SKILL.md"; expect fail too-big "$d" "> 12000"
d=$(v pluginkey);  printf '{"name":"casa","hooks":"./h.json"}\n' > "$d/.claude-plugin/plugin.json"; expect fail plugin-hooks-key "$d" 'key "hooks" not allowed'
d=$(v pluginname); printf '{"name":"outro"}\n' > "$d/.claude-plugin/plugin.json";  expect fail plugin-name "$d" "plugin name must be"
d=$(v tools);      printf -- '---\nname: exemplo\nallowed-tools: Bash\ndescription: Usa num teste.\n---\n\nTexto.\n' > "$d/skills/exemplo/SKILL.md"; expect fail allowed-tools "$d" 'frontmatter "allowed-tools" not allowed'

# casa-automacoes: method-only rules (size > 8000, no capability names).
auto() { local n="$1"; good "$T/$n"; mkdir -p "$T/$n/skills/casa-automacoes"; rm -r "$T/$n/skills/exemplo"
  printf -- '---\nname: casa-automacoes\ndescription: Usa num teste.\n---\n\nUsa `automations.propose`, `home.structure_summary` e `notify`.\n' > "$T/$n/skills/casa-automacoes/SKILL.md"; echo "$T/$n"; }
d=$(auto autook);  expect pass automacoes-ok "$d"
d=$(auto autobig); head -c 9000 /dev/zero | tr '\0' 'a' | fold -w 80 >> "$d/skills/casa-automacoes/SKILL.md"; expect fail automacoes-too-big "$d" "> 8000"
d=$(auto autoheld); echo 'Usa `held` para "aberto há N min".' >> "$d/skills/casa-automacoes/SKILL.md"; expect fail automacoes-names-held "$d" 'code span `held`'
d=$(auto autokind); echo 'Escreve kind: gate.opened.' >> "$d/skills/casa-automacoes/SKILL.md"; expect fail automacoes-kind "$d" '"kind" snippet'
d=$(auto autoid);   echo 'Gatilho trigger.sun serve.' >> "$d/skills/casa-automacoes/SKILL.md"; expect fail automacoes-capability-id "$d" 'names capability id'

# Digest: same tree → same digest; one byte changed → different digest.
a=$($DIGEST "$T/good"); b=$($DIGEST "$T/good")
# Known vector: the Harness's TS implementation must produce the same hex for this tree.
VECTOR=8f15b164b1890f4d049ca2e67a8cd9b8f93c88d52c87c86c495a7a9eb2c95109
[ "$a" = "$VECTOR" ] && echo "ok   digest-vector" || { echo "FAIL digest vector: $a"; fail=1; }
[ "$a" = "$b" ] && echo "ok   digest-stable" || { echo "FAIL digest not stable"; fail=1; }
echo "x" >> "$T/good/skills/exemplo/SKILL.md"; c=$($DIGEST "$T/good")
[ "$a" != "$c" ] && echo "ok   digest-changes" || { echo "FAIL digest did not change"; fail=1; }

exit $fail
