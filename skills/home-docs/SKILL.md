---
name: home-docs
description: "MkDocs Material documentation site — page creation, navigation, sync workflow, container management, and content conventions for docs.3olive3.com."
---

# Home Docs

Conventions and workflows for the Casa Lima documentation site (`docs.3olive3.com`), powered by MkDocs Material in Docker on UNRAID.

## Architecture

```
~/Developer/home-docs/ (git repo)
        ↓ push to main
GitHub repo (remote)
        ↓ cron pull every 15min OR manual sync
UNRAID: /mnt/user/appdata/mkdocs/ (container volume)
        ↓
MkDocs Material container (port 8200)
        ↓
docs.3olive3.com (via NGINX Proxy Manager)
```

## Key Facts

| Item | Value |
|------|-------|
| Pages | 73+ |
| Container port | 8200 |
| Sync script | `/mnt/user/appdata/mkdocs-sync.sh` |
| Sync frequency | Cron every 15 minutes from `main` branch |
| Framework | MkDocs Material |

---

## Creating a New Page

### Step 1: Write the Page

Create the markdown file in the appropriate `docs/` subdirectory.

### Step 2: Add to Navigation

**Critical**: Pages NOT in `mkdocs.yml` nav will not appear in the site navigation.

```yaml
nav:
  - Section Name:
    - Page Title: path/to/page.md
```

### Step 3: Commit and Push

```bash
git add docs/path/to/page.md mkdocs.yml
git commit -m "docs: add page description"
git push origin main
```

### Step 4: Trigger Sync

After pushing to `main`, trigger the sync immediately:

```
unraid_run_command → /mnt/user/appdata/mkdocs-sync.sh
```

**Container restart**: needed only for structural changes (new plugins, theme changes). Simple page additions/edits are picked up by live-reload.

---

## Content Conventions

### Admonitions

```markdown
!!! note "Title"
    Content of the admonition.

!!! warning
    Important warning text.
```

Types: `note`, `abstract`, `info`, `tip`, `success`, `question`, `warning`, `failure`, `danger`, `bug`, `example`, `quote`

### Code Blocks

````markdown
```python title="example.py" linenums="1"
def hello():
    print("Hello")
```
````

### Internal Links

```markdown
[Link text](../path/to/page.md)
[Link to section](../path/to/page.md#section-anchor)
```

---

## Protected Config Keys

These `mkdocs.yml` keys must not be changed without understanding the impact:
- `site_name`, `site_url` — SEO and link generation
- `theme` — Material theme config
- `plugins` — build plugins
- `extra` — analytics, social links
- `markdown_extensions` — enabled markdown features

Safe to modify: `nav` (page navigation), page content in `docs/`.

---

## Gotchas

- **Nav required** — pages not in `mkdocs.yml` nav are invisible in site navigation (but accessible via direct URL/search)
- **Main branch only** — sync pulls from `main`; content on other branches won't appear
- **Container restart** — only needed for structural/config changes, not content updates
- **Sync script path** — must be: `/mnt/user/appdata/mkdocs-sync.sh`
- **Material theme** — some markdown features require specific `markdown_extensions` in mkdocs.yml
- **Image paths** — use relative paths; images go in `docs/assets/` or alongside the page
