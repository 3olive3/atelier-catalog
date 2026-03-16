---
name: vault-access
description: "Vaultwarden credential retrieval patterns — MCP tools for vault operations, bw CLI fallback for bootstrap scenarios, and secret lookup conventions."
---

# Vault Access

How to retrieve and manage credentials from Vaultwarden (vault.3olive3.com) across Casa Lima infrastructure. Covers MCP tools (primary), bw CLI fallback (bootstrap), and common lookup patterns.

## Architecture

| Component | Details |
|-----------|---------|
| Server | Vaultwarden (Bitwarden-compatible), Docker on UNRAID |
| URL | `https://vault.3olive3.com` |
| Admin | `administrator@3olive3.com` |
| MCP | `mcp/vaultwarden/` v1.1.0 — 18 tools (9 read, 7 write, 2 destructive) |
| Client crypto | PBKDF2 (600K iterations) + AES-256-CBC — all decryption is client-side |

## MCP Tools (Primary Method)

### Session lifecycle
1. `vault_login` — Authenticate and derive encryption keys (must call first)
2. `vault_status` — Check session state (locked/unlocked, expiry)
3. `vault_logout` — Clear keys from memory (call when done)

### Credential lookup
- `vault_search` — Search by keyword (name, username, URI, notes). Start here.
- `vault_list_items` — List all items, optionally filter by type/folder/trash
- `vault_get_item` — Full decrypted details by item ID
- `vault_get_password` — Just the password by item ID
- `vault_get_username` — Just the username by item ID
- `vault_get_totp` — TOTP seed/URI by item ID

### Credential management (write operations)
- `vault_create_login` — New login item (name required, all else optional)
- `vault_update_item` — Partial update (only specified fields change)
- `vault_delete_item` — Soft-delete (moves to trash)
- `vault_restore_item` — Restore from trash

### Organization
- `vault_list_folders` / `vault_create_folder` / `vault_update_folder` / `vault_delete_folder`
- `vault_generate_password` — Cryptographic random (no vault unlock needed)

### Typical lookup flow

```
1. vault_login
2. vault_search { query: "fortigate" }
   -> Returns item IDs + names + usernames
3. vault_get_password { itemId: "<id>" }
   -> Returns decrypted password
4. vault_logout
```

## bw CLI Fallback (Bootstrap)

When the MCP process isn't available (e.g., setting up env vars for a new MCP server that needs vault credentials to start):

```bash
# On UNRAID via SSH MCP
docker run --rm -e BW_CLIENTID="<client-id>" \
  -e BW_CLIENTSECRET="<client-secret>" \
  node:22-slim sh -c '
    npx -y @bitwarden/cli config server https://vault.3olive3.com &&
    BW_SESSION=$(npx @bitwarden/cli login administrator@3olive3.com "<master-password>" --raw) &&
    npx @bitwarden/cli list items --search "<query>" --session "$BW_SESSION" | jq ".[0].login"
  '
```

### When to use bw CLI
- **Bootstrap**: Setting up env vars for a new MCP server deployment
- **MCP unavailable**: Vaultwarden MCP process not running or broken
- **UNRAID scripts**: Automation scripts that need credentials at runtime

## Common Credential Lookups

| Service | Search query | Fields used |
|---------|-------------|-------------|
| Google OAuth | `google oauth` | username (client ID) + password (client secret) |
| Fortigate | `fortigate` or `firewall` | username + password |
| iLO | `ilo` or `proliant` | username + password + URI |
| NGINX Proxy Manager | `nginx` | username + password |
| Pihole | `pihole` | password (API key in notes) |
| Plex | `plex` | token in notes |
| UNRAID | `unraid` or `tower` | username + password |
| Cloudflare | `cloudflare` | API token in password field |
| NetBox | `netbox` or `ipam` | API token |
| Homebridge | `homebridge` | username + password |
| Uptime Kuma | `uptime` | username + password |
| Overseerr | `overseerr` | API key in notes |
| Sonarr/Radarr | `sonarr` / `radarr` | API key in password or notes |
| SABnzbd | `sabnzbd` or `nzb` | API key |
| Tautulli | `tautulli` | API key |
| Grafana | `grafana` | admin password |
| Duplicacy | `duplicacy` | B2 credentials |
| Unimus | `unimus` | API token |

## Env Var Conventions

MCP servers load credentials from `.env` files (never committed). Pattern:

```
# mcp/<name>/.env
SERVICE_URL=https://...
SERVICE_USERNAME=...
SERVICE_PASSWORD=...    # or SERVICE_API_KEY, SERVICE_TOKEN
SERVICE_INSECURE_TLS=true  # only for self-signed certs (e.g., iLO)
```

## Shared Secrets (casa-lima-infra)

Stack-level secrets are defined once in `stack.yml` and referenced by any manifest that needs them. This avoids duplicating Vaultwarden item names across manifests.

### Definition (stack.yml)

```yaml
shared_secrets:
  google_oauth:
    vault_item: "Google OAuth — Atelier Platform"
    description: "Google Cloud OAuth 2.0 credentials (project: Atelier)"
    fields:
      client_id: username       # maps to vault username field
      client_secret: password   # maps to vault password field
```

### Reference (manifest secrets section)

```yaml
secrets:
  - env: ATELIER_GOOGLE_CLIENT_ID
    shared: google_oauth.client_id      # resolves to vault item username
  - env: ATELIER_GOOGLE_CLIENT_SECRET
    shared: google_oauth.client_secret   # resolves to vault item password
```

### How it works at deploy time

1. Operator reads the `shared:` pointer (e.g., `google_oauth.client_id`)
2. Looks up `shared_secrets.google_oauth` in `stack.yml` → vault item name + field
3. Retrieves the value from Vaultwarden via MCP (`vault_search` → `vault_get_username`)
4. Injects as env var on the container (`-e ATELIER_GOOGLE_CLIENT_ID=<value>`)

No secret values ever appear in YAML — only pointers to Vaultwarden items and field names.

### When to use shared vs direct

| Pattern | When to use |
|---------|-------------|
| `shared: google_oauth.client_id` | Secret used by multiple containers (OAuth, shared API keys) |
| `vault_item: "Atelier DB Connection"` | Secret specific to one container (database URL, service-specific token) |
| `value: administrator@3olive3.com` | Non-secret config that belongs alongside secrets for context |

## Security Rules

1. **Never commit `.env` files** — all are in `.gitignore`
2. **Never log passwords** — MCP tools return masked summaries
3. **Vault login sessions expire** — always call `vault_logout` when done
4. **Write operations require user confirmation**
5. **Soft-delete only** — `vault_delete_item` moves to trash, not permanent delete
