---
name: homebridge-personalization
description: "Add devices to Homebridge, build/patch custom accessories for Casa Lima's specific hardware, and keep local plugin patches alive across updates — covers the Shelly Pro2 garage-door pattern as the reference example."
---

# Homebridge Personalization

Casa Lima's Homebridge container bridges non-HomeKit devices into Apple Home — Shelly Pro Din Rail units, a Tuya heater, a network printer, a custom kitchen-hood plugin. This skill covers the recurring work of **adding new devices** and **building or patching accessories for hardware upstream plugins don't fully support** — not general Homebridge operation, which is standard and needs no special guidance.

Full container facts: [Homebridge](../../../../home-docs/docs/server/containers/homebridge.md). Full plugin/patch inventory: [Homebridge Plugins](../../../../home-docs/docs/smart-home/homebridge-plugins/index.md). Device inventory: [Shelly Devices](../../../../home-docs/docs/smart-home/shelly.md).

## Architecture, in brief

| Field | Value |
|---|---|
| Container | `homebridge`, `10.1.6.30` on VLAN `Home1_W1` (macvlan `br0.6`) |
| Appdata | `/mnt/cache/appdata/homebridge` → `/homebridge` (also `/var/lib/homebridge` in-container, same volume) |
| Config file | `config.json` at the appdata root |
| Plugin code | `node_modules/<plugin>/` under appdata — persists across container restarts, **not** across a plugin reinstall/update |
| Admin UI | config-ui-x, port 8581/8124, Vaultwarden `Homebridge UI — Butler MCP` |
| Deploy method | UNRAID Docker template — **not** manifest/CI-managed like the rest of atelier-butler |

Several plugins run as independent **child bridges**, each its own HAP pairing. `docker restart homebridge` restarts all of them together — there's no per-plugin restart.

## Adding a new device

1. **Identify it** — for Shelly Gen2/3, `curl http://<ip>/rpc/Shelly.GetDeviceInfo` gives model, generation, MAC. A `"No handler for Shelly.GetDeviceInfo"` response on an otherwise-reachable device usually means HomeKit-native firmware (speaks HAP directly, self-integrates, never needs Homebridge) rather than a broken device — confirm before assuming it's faulty.
2. **Reserve its IP** — every device that gets a `hostname` hardcoded into a plugin's `config.json` entry needs a matching FortiGate DHCP reservation for its MAC first. Skipping this is the single most common way a working integration silently breaks later: a lease renewal hands the IP to something else, and the plugin either fails to connect (`code: 1006` in logs) or silently talks to the wrong device. `fortigate_create_dhcp_reservation` is a write operation — confirm the full list with the user before executing (see the FortiGate MCP process-staleness gotcha below).
3. **Ask before guessing device purpose or accessory shape.** A device's own local name is often unset; only the household knows what a given relay actually controls, and multi-channel devices (e.g. two relays on one Shelly Pro2) may need per-channel decisions (independent switches vs. combined into one accessory) that aren't inferrable from the API alone.
4. **Configure, restart, verify** — add the device to the right platform's `devices[]` array in `config.json`, `docker restart homebridge`, then verify via **both** the container logs (`Device added`, no errors) and the plugin's own cached-accessories file (`accessories/cachedAccessories.<bridge-id>`) — a log line alone doesn't confirm the accessory actually registered with the expected shape.

## Personalization conventions (Casa Lima's established preferences)

These aren't Homebridge defaults — they're choices made explicitly during the 2026-08-22 Shelly window-opener work and worth carrying forward:

- **Prefer the HomeKit accessory type that matches physical reality, not the path of least resistance.** Two relays driving one motorized function (open/close) belong on **one** Garage Door Opener accessory, not two raw switches — confirmed by the household as confusing UX ("two devices per window... would be better to have only one device"). If the target hardware/plugin combination doesn't support the natural accessory type (e.g. no Window Covering mode on non-PM Shelly Pro2), building a custom ability is preferred over settling for a worse-fitting default, provided the effort is proportionate.
- **DHCP reservations for every IoT/smart-home device**, not just ones causing active problems — this was raised proactively by the household after the stale-hostname bug surfaced, not requested reactively per-incident.
- **When a device's real state can't be read from hardware** (no position sensor, momentary relays only), persist the last-known state to disk and read it back on restart rather than defaulting blindly every time. Document clearly that this is inference, not ground truth, and that it can only resync via manual correction if the physical state changes through a path that never touches HomeKit.
- **Room/location naming** follows the household's own functional shorthand (e.g. `WC1 P1`, `Suite WC` — bathroom + floor abbreviations), not generic labels. Match existing naming when adding siblings to a device family.

## Patching a plugin for unsupported hardware

When a plugin's upstream doesn't support a specific device variant or accessory shape (confirmed both packages are already at their latest published npm versions before treating this as a gap, not staleness), the pattern used for the Shelly Pro2 UL-model + Garage Door Opener work is the template:

1. **Read the plugin's actual source** before assuming behavior — abilities/device-delegates architecture varies by plugin. Understand the existing "Switch"-style ability as a template for the read/write/event pattern before writing a new one.
2. **Patch `node_modules` directly**, never the git-tracked plugin repo (there isn't one locally) — back up every file before editing (`.bak` alongside), and `node --check <file>` after every edit before restarting the container.
3. **Write the new/patched files as real, git-tracked source** in `atelier-butler/infra/homebridge-patches/`, not just deployed artifacts — this is what makes the pattern below possible, and what a future session reads instead of re-reverse-engineering the plugin.
4. **Build a self-healing check, don't just patch once.** A plugin reinstall/update via the Homebridge UI silently wipes local `node_modules` edits — freezing all updates to prevent this blocks legitimate fixes to every *other* plugin too. Instead, write an idempotent script (checks-before-writes, one line of output per check) and wire it into `infra/configs/cron/casa-lima` on a schedule (every 15 min matches the existing pattern), restarting Homebridge only when it actually had something to reapply. `infra/scripts/ensure-homebridge-shelly-patches.sh` is the reference implementation — copy its shape for the next plugin patch rather than designing fresh.
5. **Test the self-heal script against a real simulated wipe** before considering it done — restore every `.bak` file and delete every new file, run the script, confirm it detects all of them, reapplies, and the container comes back clean. A script that's only ever been run against the already-patched state hasn't proven anything about the failure mode it exists for.
6. **Document in home-docs, not just in the patch files' comments** — the per-container page (what/why/detection command) and the plugin-inventory page (full file-by-file rationale) are what a future session actually reads first. A comment banner in the patched file is a second layer, not a substitute.
7. **File upstream eventually.** A local patch is a stopgap; if the gap is generic (not Casa-Lima-specific), it's worth a PR to the plugin's real repo so it stops being a local patch at all.

## Removing an orphaned cached accessory

Don't hand-edit a plugin's own accessory cache file directly — Homebridge core keeps its own separate, authoritative record for a live bridge and will overwrite a manual file edit within seconds of the next restart (confirmed live). The Home app also won't reliably offer "Remove Accessory" for bridge sub-accessories (a known iOS/HomeKit UI gap).

The safe path is the config-ui-x REST API (`DELETE /api/server/cached-accessories`), which stops Homebridge first, edits the file, then restarts — full example in the [Homebridge container doc](../../../../home-docs/docs/server/containers/homebridge.md#admin-api).

## Gotchas

- **A locally-spawned MCP server (FortiGate, or any other) doesn't pick up a code fix without a reconnect.** If a FortiGate write tool behaves like a known-fixed bug (e.g. `create_dhcp_reservation` overwriting the whole reservation list instead of appending — always verify count via `list_dhcp_servers` after any write), suspect a stale local process before assuming the fix regressed. Restart via Claude Code's `/mcp` command, not a code re-check.
- **Room assignment for a new accessory inherits from its child bridge**, not a sensible default — pure Apple Home app behavior, not controllable from Homebridge or any plugin. Tell the household to expect this and reassign manually.
- **Direct curl writes to the FortiGate REST API may be blocked by the coding agent's own sandbox**, even with explicit chat approval — this is a deliberate guardrail (the FortiGate MCP tool's write-confirmation requirement exists for a reason, and a raw curl bypasses it). If this happens, hand the exact command to the user to run via `!` in their own session rather than trying to work around the block.
