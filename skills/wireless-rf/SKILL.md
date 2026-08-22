---
name: wireless-rf
description: "Use when investigating WiFi RF problems on Casa Lima's FortiAPs — co-channel conflicts, channel or power changes, DARRP behaviour, why an AP will not move channel, or the daily RF audit and its alerts. Covers the two-layer profile/per-AP override trap, DARRP's actual scoring formula, and the FortiOS write quirks that make radio changes silently fail. Not for VLANs, firewall policy, DNS or the reverse proxy — use home-network for those."
---

# Wireless RF

Managing the radio side of Casa Lima's FortiAP estate: channels, power, DARRP,
and the daily audit that grades it.

Separate from `home-network` deliberately. That skill covers VLANs, firewall,
switching, DNS and proxy; RF has enough depth of its own, and the specific traps
below cost a misdiagnosed incident to learn.

## The estate

| AP | Model | Radios |
|---|---|---|
| `FortiAP231K_Office` | FAP-231K | 1: 2.4GHz · 2: 5GHz · 3: **6GHz** |
| `FortiAP231K_Quartos` | FAP-231K | 1: 2.4GHz · 2: 5GHz · 3: **6GHz** |
| `FortiAP231F_Garagem` | FAP-231F | 1: 2.4GHz · 2: 5GHz · 3: monitor |
| `FortiAPU231F_Suite` | FAP-U231F | 1: 2.4GHz · 2: 5GHz · 3: monitor |
| `FortiAPU231F_CMQ` | FAP-U231F | 1: 2.4GHz · 2: 5GHz · 3: monitor |

One WTP profile per AP (`FAP231K-Office`, `FAP231F-Garagem`, …), but **a single
shared ARRP profile** (`arrp-default`) that all of them reference. Change DARRP
tuning once and it applies everywhere.

Radio-3 on the U231F models is a **dedicated monitor radio** — it scans and
carries no clients. Never enable DARRP on it.

---

## The trap that matters most: two layers, and the lower one wins

FortiOS holds radio configuration in **two different objects**:

| Layer | Object | Holds |
|---|---|---|
| Profile | `wireless-controller wtp-profile` → `radio-N` | `darrp`, `arrp-profile`, allowed channel list, band |
| **Per-AP** | `wireless-controller wtp` → `radio-N` | **`override-channel`, `override-band`, the pinned channel** |

**The per-AP layer overrides the profile.** An AP can show `darrp enable` with
`arrp-profile "arrp-default"` and still be completely immovable, because a
per-AP override supersedes it.

This is not theoretical. On 2026-08-16 the Office 231K sat on channel 6 for 22
of 22 SNMP samples while looking fully DARRP-managed, because a per-AP override
pinned it — carried over when its predecessor's config was applied to the new
unit. It was reported as "all pins cleared" the day before, because only the
profile layer had been inspected.

**Always check the per-AP layer:**

```js
// per-AP overrides — the layer that actually decides
apiRequest("GET", "/api/v2/cmdb/wireless-controller/wtp")
// then read radio-N["override-channel"] on each
```

An audit that reports "no pins" without reading `wireless-controller wtp` is
not telling you anything.

---

## How DARRP actually decides

From the [FortiAP 7.6.5 docs](https://docs.fortinet.com/document/fortiap/7.6.5/fortiwifi-and-fortiap-configuration-guide/148466/understanding-distributed-radio-resource-provisioning):

```
channel_score = weight-managed-ap    * rssi_score_managed_ap
              + weight-rogue-ap      * rssi_score_rogue_ap
              + weight-noise-floor   * noise_floor
              + weight-channel-load  * channel_load
              + weight-spectral-rssi * spectral_RSSI
```

Lowest score wins. Three properties change how you reason about it:

1. **Each AP decides autonomously.** There is no global coordination and no
   graph-colouring across the estate. Two APs independently choosing the same
   channel is normal behaviour, not a fault.
2. **The managed-AP term is RSSI-weighted.** An AP avoids a channel for one of
   ours only in proportion to how strongly it *hears* it. Two APs that cannot
   hear each other will cheerfully share a channel — and raising the weight
   changes nothing, because you are multiplying zero.
3. **Ties break at random.**

DARRP runs on the `darrp-optimize` schedule — default 86400s in a **01:00–01:30**
window. Any audit meant to grade its work must run after that; ours runs 02:15.

### Our ARRP profile

`arrp-default`, shared by every WTP profile:

| Parameter | Value | Note |
|---|---|---|
| `weight-managed-ap` | **100** | raised from stock 50 on 2026-08-16 |
| `weight-rogue-ap` | 10 | |
| `weight-noise-floor` | 40 | |
| `weight-channel-load` | 20 | |
| `weight-spectral-rssi` | 40 | |
| `selection-period` / `monitor-period` | 3600 / 300 | |
| `threshold-ap` / `threshold-noise-floor` | 250 / -85 | |
| `threshold-channel-load` / `threshold-spectral-rssi` | 60 / -65 | |

At the stock 50, "another of our APs is here" scored **50** against
environmental terms summing to **110** — outvoted more than 2:1. That is why
Garagem settled beside Office on ch6 despite ch11 having fewer neighbours.

**Fortinet's documented fix for APs repeatedly choosing the same channel is to
raise `weight-managed-ap` toward 100–150 — not to pin channels.** 150 was
rejected here: it makes a radio move off our channel almost regardless of what
it moves onto, and no 2.4GHz channel in this house is clear (ch1≈8 neighbours,
ch6≈10, ch11≈6).

### Co-channel is not automatically a problem

Fortinet's guidance: co-channel only degrades service at **high utilisation** —
below roughly 70%, sharing a channel can be the correct assignment. With three
non-overlapping 2.4GHz channels and 5 APs, some overlap is unavoidable by
arithmetic.

Casa Lima runs at 9–11%. The `WifiCoChannelConflict` alert is therefore gated on
utilisation and will stay quiet at normal load even with overlaps present. Check
`casa_wifi_cochannel_conflicts` on the dashboard rather than waiting to be told.

---

## FortiOS write quirks

### Clearing a channel override needs BOTH overrides in one PUT

Measured on FortiOS 7.6.7:

| PUT body | `revision_changed` |
|---|---|
| `{override-channel: disable}` | **false** — silently discarded |
| `{override-channel: disable, channel: []}` | **false** — discarded |
| `{override-channel: disable, override-band: disable}` | **true** — applied |

Note the asymmetry: **setting** a pin works with `override-channel` alone; only
**clearing** needs the pair. `clear_ap_radio_channel` sent the one-sided form for
its whole life, so every clear it performed was a no-op reported as success.

### `status: success` is not evidence

FortiOS answers a discarded write with `status: "success"` and `http_status: 200`.
The only tell is **`revision_changed: false`**. Every write in the FortiGate MCP
now calls `assertWriteApplied()`, which throws on that — but if you are writing
by hand, check it yourself.

### Response shapes

- Single-object CMDB GET → `{results: [ONE ITEM]}` — an array of one
- **List** GET on `wtp-profile` / `wtp` → a **bare array**, no `results` wrapper
- `apiRequest` takes the **full** path: `/api/v2/cmdb/...`, not `/cmdb/...`

Normalise defensively: `Array.isArray(x) ? x : x.results`.

### There is no force-DARRP command

No documented command triggers a run on demand. These are read-only:

```
diagnose wireless-controller wlac -c darrp       # what DARRP currently thinks
diagnose wireless-controller wlac -c ap-rogue    # what it can actually see
```

`-c ap-rogue` is the one that answers "can these two APs hear each other?",
which decides whether `weight-managed-ap` will do anything at all. SSH to the
FortiGate is closed, so use the GUI's CLI console.

---

## The daily audit

`infra/scripts/audit-wifi-rf.sh`, cron **02:15** (after DARRP's 01:00–01:30).

Emits metrics only — it never posts to Butler directly. Everything that means
"something is wrong" goes through Alertmanager, because that is what provides
dedup, resolve tracking and, above all, **silencing**.

| Metric | Meaning |
|---|---|
| `casa_wifi_cochannel_conflicts` | total overlaps (dashboard) |
| `casa_wifi_cochannel_conflict{ap,radio}` | per-radio, joinable against utilisation |
| `casa_wifi_radio_noise_floor_dbm{ap,radio}` | not in the Fortinet SNMP MIB |
| `casa_wifi_radio_utilization_percent{ap,radio}` | not in the MIB |
| `casa_wifi_rf_audit_success` / `_timestamp` | a silently absent audit looks like a clean one |

**Do not re-publish channel, client count or TX power** — SNMP already collects
`fgWcApRadioChannel`, `fgWcApRadioStaCount` and `fgWcApRadioTxPower` continuously,
which beats a daily snapshot and avoids two sources of truth.

**Known limitation:** the audit runs once a day, so between runs the metric
under-reports. On 2026-08-16 it read 2 while the live state was 4.
`get_wifi_rf_health` gives the current picture on demand.

---

## Procedures

### An AP will not change channel

1. Read the **per-AP** `wtp` entry, not just the profile. `override-channel: enable` is your answer.
2. If clearing it, send `override-channel` **and** `override-band` disable together, and verify `revision_changed: true`.
3. Re-read the object to confirm. Never confirm by re-running the audit that missed it.

### Two APs share a channel

1. Check utilisation first. Below ~70% it may not be worth acting on.
2. Confirm no per-AP pin is holding one in place.
3. Prefer raising `weight-managed-ap`, or **reducing TX power** — smaller cells mean less overlap and better roaming. Counter-intuitive but standard for dense 2.4GHz.
4. Pin a channel only as a last resort: it removes that radio from DARRP, and a half-pinned estate is exactly how the 2026-08-16 incident arose.

### Channel widths

2.4GHz 20MHz (only 1/6/11 are non-overlapping — **do not** use the 4-channel
1/5/9/13 plan: it overlaps, adjacent-channel interference is worse than
co-channel, and ch12/13 break US-chipset IoT devices). 5GHz 40MHz. 6GHz 160MHz.

---

## Tools

`get_wifi_rf_health`, `list_neighbour_aps`, `set_ap_radio_channel`,
`clear_ap_radio_channel`, `set_ap_radio_power`, `list_managed_aps`,
`list_wtp_profiles`, `list_wifi_clients`.

**Missing:** no tool reads or clears **per-AP** overrides — the layer that
actually decides. That gap is why the 2026-08-16 incident was misdiagnosed.

`list_neighbour_aps` reports "0 are ours" because it excludes managed APs by
design. That is **not** evidence our APs cannot hear each other, and must not be
read as such.

## See also

- [Alert catalogue](https://docs.3olive3.com/observability/alert-catalogue/)
- [DARRP co-channel incident](https://docs.3olive3.com/incidents/2026-08-darrp-cochannel-hidden-pin/) — where all of this was learned
- `home-network` — VLANs, firewall, DNS, proxy
