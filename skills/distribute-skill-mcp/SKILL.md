---
name: distribute-skill-mcp
description: "The ONLY official way to distribute skill and MCP changes across Casa Lima's 3 required locations — atelier repos (atelier-catalog / atelier-mcps), OpenCode global skills, and Claude Code project configs."
---

# Distribute Skill & MCP

Every skill or MCP change MUST be reflected in 3 locations. This skill is the checklist and procedure to ensure nothing is missed.

## The 3-Places Rule

| # | Location | What goes here | Path |
|---|----------|---------------|------|
| 1 | **Canonical source** | The skill itself | `~/Developer/atelier-platform/atelier-catalog/skills/<id>/SKILL.md` + `<id>.json` |
| 2 | **Global Claude Code skills** | An **absolute** symlink. Makes the skill available in *every* session, with no repo prefix | `~/.claude/skills/<id>` |
| 3 | **Every repo's `.claude/skills/`** | A **relative** symlink. Scopes the skill to work under that repo | `<repo>/.claude/skills/<id>` |
| 4 | **CLAUDE.md / memory** | Only for rules that must apply *without* the skill being loaded | `~/.claude/CLAUDE.md`, `<repo>/CLAUDE.md`, `~/.claude/projects/<project>/memory/` |

!!! tip "Global vs per-repo — they are not alternatives"
    `~/.claude/skills/` is what makes a skill appear as plain `decommission`
    rather than `atelier-catalog:decommission`. Broadly useful Casa Lima ops
    skills belong there: `decommission`, `deploy-container`, `dns-sync`,
    `home-docs`, `minecraft-ops`, `observability`, `scheduled-jobs`,
    `vault-access`.

    Note the link style differs — **absolute** globally, **relative** per repo.
    Using the wrong one produces a link that dangles the moment anything moves.

!!! warning "Corrections, 2026-09-08"
    Three things this page said were wrong and cost time:

    - Paths said `~/Developer/atelier-platform/atelier-catalog`. The five Atelier repos moved
      under **`~/Developer/atelier-platform/`** in August 2026.
    - It said *"Claude Code doesn't have a `skills/` directory like OpenCode"*.
      It does, in **two** places — `~/.claude/skills/` globally, and
      `.claude/skills/` in each of ten repos. That is the primary distribution
      mechanism, not CLAUDE.md.

      A first correction on the same day listed only the per-repo half and was
      merged before the global one was noticed. Check both.
    - **OpenCode is retired** (2026-08-14). `~/.config/opencode/skills/` is not
      a live target. Do not copy there and do not fix its broken links.

    MCP paths still say `blok-butler`; the repo is **`atelier-butler`**.

**Violation of the 3-places rule = drift.** If one place is updated but the others aren't, agents in different environments get different instructions.

## Distributing a Skill Change

### Step 1: Update the source skill

Edit the SKILL.md in the atelier-catalog repo:

```
~/Developer/atelier-platform/atelier-catalog/skills/<skill-id>/SKILL.md
```

If creating a new skill:
1. Create directory: `~/Developer/atelier-platform/atelier-catalog/skills/<skill-id>/`
2. Write `SKILL.md` with YAML frontmatter (`name`, `description`) + markdown body
3. Add entry to `catalog.json` (required fields: catalogID, name, version, description, source, category, tags, author)
4. If it belongs to a bundle, add the skill ID to the bundle's `skillIds` array in `bundles.json`

### Step 2a: Symlink it globally, if it is broadly useful

```bash
ln -s ~/Developer/atelier-platform/atelier-catalog/skills/<id> ~/.claude/skills/<id>
```

**Absolute** path here. This is what makes the skill load in any session,
including in repos that have no `.claude/skills` of their own.

### Step 2b: Symlink it into every repo

This is the step that actually makes the skill loadable. **The relative depth
differs by location** — getting it wrong produces a dangling link that is
invisible until the skill tool fails on it:

```bash
# The five repos under atelier-platform/ — three levels up lands in atelier-platform/
for r in atelier-butler atelier-bridge atelier-companion atelier-mcps; do
  ln -s ../../../atelier-catalog/skills/<id> \
        ~/Developer/atelier-platform/$r/.claude/skills/<id>
done

# atelier-catalog links to itself — only two levels
ln -s ../../skills/<id> \
      ~/Developer/atelier-platform/atelier-catalog/.claude/skills/<id>

# Repos outside atelier-platform/ — three levels up lands in ~/Developer/
for r in home-docs torneva HomeColor minecraft-server homebridge-pando-hood; do
  ln -s ../../../atelier-platform/atelier-catalog/skills/<id> \
        ~/Developer/$r/.claude/skills/<id>
done
```

**Then prove none of them dangle** — this check has caught real ghosts twice:

```bash
find ~/Developer/*/.claude/skills \
     ~/Developer/atelier-platform/*/.claude/skills \
     -maxdepth 1 -type l ! -exec test -e {} \; -print
```

`.claude/skills` is **version-controlled in all ten repos**, so the symlinks must
be committed. A working copy that resolves while the committed path does not
means a fresh clone gets broken links — which was true of three repos from
August 2026 until 2026-09-08.

### Step 3: CLAUDE.md and memory — only when the rule must apply unloaded

- **Global rules**: `~/.claude/CLAUDE.md` — add references to new skills/MCPs if they affect all projects
- **Project rules**: `<repo>/CLAUDE.md` — add skill-specific instructions if they affect a specific repo
- **Memory files**: `~/.claude/projects/<project>/memory/` — store operational patterns, conventions, and skill references that persist across sessions

For skills that define **procedures** (like deploy-container, vault-access), ensure the key steps are summarized in the relevant CLAUDE.md so Claude Code agents follow the same procedures as OpenCode agents.

### Step 4: Commit all changes

```bash
# Atelier catalog repo
cd ~/Developer/atelier-platform/atelier-catalog
git add skills/<skill-id>/SKILL.md catalog.json
git commit -m "feat: add <skill-id> skill to catalog"

# Note: OpenCode and Claude Code configs are local — no git commit needed
```

## Distributing an MCP Change

### Step 1: Make the code change in blok-butler

```bash
cd ~/Developer/blok-butler/mcp/<mcp-name>
# Edit source in src/
npm run build
# Bump version in package.json if needed
```

### Step 2: Update atelier-mcps (distribution repo)

```bash
# Copy built output
cp ~/Developer/blok-butler/mcp/<mcp-name>/dist/index.js \
   ~/Developer/atelier-platform/atelier-mcps/mcps/<mcp-name>/dist/

# Update manifest.json version + description if changed
# Update catalog.json version + description if changed
```

Commit on develop branch:
```bash
cd ~/Developer/atelier-platform/atelier-mcps
git checkout develop
git add mcps/<mcp-name>/ catalog.json
git commit -m "fix: bump <mcp-name> MCP to vX.Y.Z"
```

### Step 3: Update OpenCode skill for the MCP

If there's a corresponding OpenCode skill (e.g., `vault-access` for the vaultwarden MCP), update it:

```bash
# Edit the skill to reflect version/capability changes
vim ~/.config/opencode/skills/<skill-id>/SKILL.md
```

### Step 4: Update Claude Code references

If the MCP has a corresponding skill file or CLAUDE.md reference, update those to reflect version/capability changes.

### Step 5: Restart sessions

MCP processes cache code at startup. After changing `dist/index.js`:
- **OpenCode**: Start a new session (old processes use cached code)
- **Claude Code**: Restart the Claude Code CLI
- **Butler Gateway**: Restart the gateway container on UNRAID

## Catalog Formats

### atelier-catalog skills entry (in catalog.json types.skills)

```json
{
  "catalogID": "skill-id",
  "name": "Human Name",
  "version": "1.0.0",
  "description": "One-line description.",
  "source": "builtIn",
  "category": "devops",
  "tags": ["tag1", "tag2"],
  "author": "Atelier"
}
```

Categories: `swift`, `ai-agent`, `code-quality`, `security`, `foundations`, `frontend`, `backend`, `data-ai`, `devops`, `design`

### atelier-mcps/catalog.json entry

```json
{
  "id": "mcp-name",
  "name": "Human Name",
  "version": "1.0.0",
  "description": "One-line description.",
  "toolCount": 15,
  "runtime": "node",
  "transport": "stdio",
  "tags": ["tag1", "tag2"],
  "downloadURL": "https://github.com/3olive3/atelier-mcps/releases/download/vX.Y.Z/mcp-name-X.Y.Z.tar.gz",
  "size": "30KB",
  "checksum": "sha256:placeholder"
}
```

### atelier-mcps/mcps/<name>/manifest.json

```json
{
  "id": "mcp-name",
  "name": "Human Name",
  "version": "1.0.0",
  "description": "Detailed description.",
  "transport": "stdio",
  "runtime": "node",
  "minRuntimeVersion": "18.0.0",
  "entrypoint": "dist/index.js",
  "toolCount": 15,
  "tools": ["tool_name_1", "tool_name_2"],
  "author": "Casa Lima",
  "source": "blok-butler",
  "license": "MIT",
  "minAtelierVersion": "1.0.0",
  "tags": ["tag1", "tag2"]
}
```

## Checklist Template

Use this checklist when distributing any change:

```
## Distribution Checklist — <name> v<version>

### Skill changes
- [ ] `atelier-catalog/skills/<id>/SKILL.md` updated
- [ ] `atelier-catalog/catalog.json` version + description updated
- [ ] symlinked into `~/.claude/skills/` (absolute) if broadly useful
- [ ] symlinked into **all ten** repos' `.claude/skills/` (relative), and none dangle
- [ ] Claude Code CLAUDE.md or memory updated (if applicable)
- [ ] Committed to atelier-catalog repo

### MCP changes
- [ ] `blok-butler/mcp/<name>/` code changed + built
- [ ] `blok-butler/mcp/<name>/package.json` version bumped
- [ ] `atelier-mcps/mcps/<name>/manifest.json` version + description updated
- [ ] `atelier-mcps/mcps/<name>/dist/index.js` copied from build
- [ ] `atelier-mcps/catalog.json` version + description updated
- [ ] OpenCode skill updated (if corresponding skill exists)
- [ ] Claude Code references updated (if applicable)
- [ ] Committed to blok-butler + atelier-mcps repos
- [ ] Sessions restarted to pick up new code
```

## Common Patterns

| Change type | Places affected |
|------------|----------------|
| New skill | catalog (`skills/<id>/` + `<id>.json`, then `build-catalog.py`) → symlink into all ten repos → commit in each |
| Skill update | Same 3 places, update content + version in catalog |
| New MCP | blok-butler (source) → atelier-mcps (dist + manifest + catalog) → OpenCode/Claude MCP configs |
| MCP bug fix | blok-butler (source + build) → atelier-mcps (dist + version bump) → restart sessions |
| MCP + skill | All of the above — MCP code + atelier-mcps + atelier-catalog + OpenCode + Claude Code |

## Git Conventions

- **atelier-catalog**: `feat: add <id> skill` / `fix: update <id> skill to vX.Y.Z`
- **atelier-mcps**: `feat: add <name> MCP vX.Y.Z` / `fix: bump <name> MCP to vX.Y.Z`
- **blok-butler**: `feat:` / `fix:` on `develop` branch, PR to `main`
- All repos use conventional commits and develop→main PR flow
