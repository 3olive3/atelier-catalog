---
name: distribute-skill-mcp
description: "The ONLY official way to distribute skill and MCP changes across Casa Lima's 3 required locations — atelier repos (atelier-skills / atelier-mcps), OpenCode global skills, and Claude Code project configs."
---

# Distribute Skill & MCP

Every skill or MCP change MUST be reflected in 3 locations. This skill is the checklist and procedure to ensure nothing is missed.

## The 3-Places Rule

| # | Location | What goes here | Path |
|---|----------|---------------|------|
| 1 | **Atelier repos** | Canonical source for distribution | `~/Developer/atelier-skills/` (skills) or `~/Developer/atelier-mcps/` (MCPs) |
| 2 | **OpenCode** | Global/project skill files consumed by OpenCode sessions | `~/.config/opencode/skills/<id>/SKILL.md` |
| 3 | **Claude Code** | Project CLAUDE.md or global instructions consumed by Claude Code | `~/.claude/CLAUDE.md` (global) or `<repo>/CLAUDE.md` (project) or `~/.claude/projects/<project>/memory/` (memory files) |

**Violation of the 3-places rule = drift.** If one place is updated but the others aren't, agents in different environments get different instructions.

## Distributing a Skill Change

### Step 1: Update the source skill

Edit the SKILL.md in the atelier-skills repo:

```
~/Developer/atelier-skills/skills/<skill-id>/SKILL.md
```

If creating a new skill:
1. Create directory: `skills/<skill-id>/`
2. Write `SKILL.md` with YAML frontmatter (`name`, `description`) + markdown body
3. Add entry to `catalog.json` (10 fields: id, name, version, description, author, license, sourceURL, tags, category, downloadURL)
4. If it belongs to a bundle, add the skill ID to the bundle's `skillIds` array

### Step 2: Copy to OpenCode global skills

```bash
# Create directory if new
mkdir -p ~/.config/opencode/skills/<skill-id>/

# Copy the skill file
cp ~/Developer/atelier-skills/skills/<skill-id>/SKILL.md \
   ~/.config/opencode/skills/<skill-id>/SKILL.md
```

OpenCode skills are only `SKILL.md` files — no catalog, no manifest.

### Step 3: Update Claude Code references

Claude Code doesn't have a `skills/` directory like OpenCode. Instead:

- **Global rules**: `~/.claude/CLAUDE.md` — add references to new skills/MCPs if they affect all projects
- **Project rules**: `<repo>/CLAUDE.md` — add skill-specific instructions if they affect a specific repo
- **Memory files**: `~/.claude/projects/<project>/memory/` — store operational patterns, conventions, and skill references that persist across sessions

For skills that define **procedures** (like deploy-container, vault-access), ensure the key steps are summarized in the relevant CLAUDE.md so Claude Code agents follow the same procedures as OpenCode agents.

### Step 4: Commit all changes

```bash
# Atelier repo
cd ~/Developer/atelier-skills
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
   ~/Developer/atelier-mcps/mcps/<mcp-name>/dist/

# Update manifest.json version + description if changed
# Update catalog.json version + description if changed
```

Commit on develop branch:
```bash
cd ~/Developer/atelier-mcps
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

### atelier-skills/catalog.json entry

```json
{
  "id": "skill-id",
  "name": "Human Name",
  "version": "1.0.0",
  "description": "One-line description.",
  "author": "casa-lima",
  "license": "MIT",
  "sourceURL": "https://github.com/3olive3/atelier-skills",
  "tags": ["tag1", "tag2"],
  "category": "devops",
  "downloadURL": "https://raw.githubusercontent.com/3olive3/atelier-skills/main/skills/skill-id/SKILL.md"
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
- [ ] `atelier-skills/skills/<id>/SKILL.md` updated
- [ ] `atelier-skills/catalog.json` version + description updated
- [ ] `~/.config/opencode/skills/<id>/SKILL.md` copied
- [ ] Claude Code CLAUDE.md or memory updated (if applicable)
- [ ] Committed to atelier-skills repo

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
| New skill | atelier-skills (SKILL.md + catalog.json) → OpenCode skill dir → Claude Code CLAUDE.md |
| Skill update | Same 3 places, update content + version in catalog |
| New MCP | blok-butler (source) → atelier-mcps (dist + manifest + catalog) → OpenCode/Claude MCP configs |
| MCP bug fix | blok-butler (source + build) → atelier-mcps (dist + version bump) → restart sessions |
| MCP + skill | All of the above — MCP code + atelier-mcps + atelier-skills + OpenCode + Claude Code |

## Git Conventions

- **atelier-skills**: `feat: add <id> skill` / `fix: update <id> skill to vX.Y.Z`
- **atelier-mcps**: `feat: add <name> MCP vX.Y.Z` / `fix: bump <name> MCP to vX.Y.Z`
- **blok-butler**: `feat:` / `fix:` on `develop` branch, PR to `main`
- All repos use conventional commits and develop→main PR flow
