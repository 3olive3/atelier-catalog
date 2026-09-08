---
name: home-electrical
description: "Casa Lima's physical layer — how to answer questions about what feeds what, which breaker or phase something is on, where a room is, and how power and network intersect. Teaches how to query the model rather than restating it."
---

# Home Electrical & Physical Layout

**This skill does not hold the data. It tells you how to get it, and what will
mislead you when you do.**

That split is the catalog's own rule: an MCP gives *capability*, a skill gives
*judgement*. Facts about 33 locations and ~188 breakers belong in a queryable
index, not in a document that a reader has to trust and that silently drifts.

Pairs with `home-network`, which covers VLANs, DNS, firewall and Wi-Fi. Use that
when the question stops at the network layer; use this one when it touches
power, panels, rooms or racks.

---

## Where the truth lives

| Layer | Where | Query it with |
|-------|-------|---------------|
| **Locations, racks, devices, cables, power** | **NetBox** — the intended index | `ipam` MCP · `search_netbox` |
| **Breakers, phases, differentials, 24 V feeds** | `home-docs/docs/electrical/breaker-map/*.csv` | read the CSVs |
| Live network state | FortiGate | `fortigate` MCP |

!!! danger "The index is not populated yet, and the tools do not reach it"
    Two gaps, both real as of 2026-09-08:

    - **NetBox holds no locations, racks, cables or power objects.** Zero of
      each. Loading them is Phase B–D of the
      [NetBox Inventory Plan](https://docs.3olive3.com/network/netbox-inventory-plan/).
    - **The `ipam` MCP has 23 tools and none of them touch the physical layer.**
      They cover prefixes, IPs, VLANs, sites, devices, interfaces and services.
      Nothing for locations, racks, cables or power panels.

    So *"which breaker feeds the oven?"* is not answerable by an agent today.
    Until both close, read the CSVs directly and say that is what you did.

---

## What will mislead you

These are the things the data cannot tell you, which is why they are here.

### `LP` / `RP` are panels, not floors

The obvious reading — L/R as wings, 0/1 as ground and first floor — is **wrong**.
They identify **electrical panels**, and a room's panel does not follow its
floor: `Escadas to LP1` is fed from **LP0**, and `Office` sits on **RP1** while
`Sala` sits on **RP0**.

It leaks into device names too: the Shelly `i4-EscadasLP1-08` names *the stairs
to LP1*, not a device on LP1. Never infer location from a panel code.

### The bottom DIN rail row is always the UPS-assisted one

In **every** panel. The house is three-phase with one phase UPS-assisted; the
general and its differential sit on the bottom row of LP0 and feed an assisted
line onward to LP1, RP0, RP1 and CMQ.

Standing at a panel, that row is the fastest answer to *"does this survive a
power cut?"* — and it is a convention, so nothing in the data states it.

### Four panels are split 220 V / 24 V

LP0, LP1, RP0 and RP1 each have a 220 V and a 24 V half. DC circuits carry a
`FONTE 24V` column naming which supply output feeds them. A breaker row without
it is 220 V.

### A row with only a second column is a section header

In the CSVs, `ID1 - 220V - INTERIOR` marks a differential's group. It is not a
breaker. Counting rows as breakers overcounts.

### Some answers are "undecided", not unknown

Three lower patios have no panel assigned because their lighting is not
installed — the decision follows the installation. CHO does not exist because
the building is under construction. Report these as pending decisions, not as
missing data.

---

## Where the two layers meet

- **Shelly i4 controllers** — a sheet in the breaker map links scene controllers
  to circuits. 35 are reserved on the network side.
- **PoE draw is known per switch port**, so the powered edge is partly mapped
  without touching the electrical model.
- **DIN-rail panel switches** live *inside* the panels — `LP1/LP0/RP0/RP1 Switch
  DinRail` on SW1 port17-20, unmanaged, serving whatever in that panel needs
  ethernet or PoE. Only LP1 is connected.

---

## The house is growing

**+7 access points** and **+10 cameras** are planned, taking it from 5 APs to 12
and 7 cameras to 17. When answering, do not assume the current inventory is the
intended one — check whether something is installed or merely planned.

---

## Related

- `home-network` — the network layer
- [NetBox Inventory Plan](https://docs.3olive3.com/network/netbox-inventory-plan/) — how the index gets populated
- [Locations](https://docs.3olive3.com/electrical/locations/) · [Fuse Boxes](https://docs.3olive3.com/electrical/fuse-boxes/) · [Breaker Map](https://docs.3olive3.com/electrical/breaker-map/)
