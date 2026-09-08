---
name: home-electrical
description: "Casa Lima's physical layer — the electrical panels, breakers, phases and 24 V supplies, the room-by-room location model, and the racks. Use for any question about what feeds what, which breaker or phase something is on, where a room is, or how power and network intersect."
---

# Home Electrical & Physical Layout

The house as a **physical system**: where things are, and what powers them.
Pairs with `home-network`, which covers VLANs, DNS, firewall and Wi-Fi. Use that
one for anything that stops at the network layer; use this one when the question
touches power, panels, rooms or racks.

**The data lives in home-docs, and the CSVs are the source of truth** —
`docs/electrical/breaker-map/*.csv`, exported from Filipe's spreadsheet. Read
them rather than relying on any prose summary, this one included.

---

## The trap: `LP` / `RP` are panels, not floors

The obvious reading — L/R as wings, 0/1 as ground and first floor — is **wrong**.
They identify **electrical panels**, and a room's panel does not follow its
floor:

- `Escadas to LP1` is fed from **LP0**
- `Office` and `Arrumos Office` are on **RP1**, while `Sala` and `Cozinha` are on **RP0**

Treat the panel as an electrical fact, never a geographic one. This also appears
in device names — the Shelly `i4-EscadasLP1-08` names the *stairs to LP1*, not a
device on LP1.

---

## Supply

**Three-phase**, with **one phase UPS-assisted**.

The UPS general and its differential are on the **bottom DIN rail row of LP0**.
From there an assisted line reaches LP1, RP0, RP1 and CMQ, for critical loads.

!!! tip "The bottom row is always the assisted one"
    In **every** panel, UPS-assisted circuits sit on the **lowest DIN rail row**.
    That is the fastest way, standing at a panel, to know whether a circuit
    survives a power cut.

---

## The panels

| Panel | Where it lives | Composition |
|-------|----------------|-------------|
| **QDG** | Datacenter | Main panel — incoming supply, governs the others |
| **LP0** | Datacenter, Rack 1 | Two panels: 220 V and 24 V |
| **LP1** | Hall Quartos | Two panels: 220 V and 24 V |
| **RP0** | Arrumos Cozinha | Two panels: 220 V and 24 V |
| **RP1** | Arrumos Office | Two panels: 220 V and 24 V |
| **CMQ** | Casa das Máquinas | One 220 V panel |
| **CHO** | Casa de Hóspedes | **Does not exist** — building under construction |

Four of the panels are split into a **220 V and a 24 V half**. DC circuits carry
a `FONTE 24V` column naming which supply output feeds them (`F1`–`F4`), which is
what makes the LED and Shelly layer traceable.

---

## Locations

**33 areas**, interior and exterior, each with the panel that serves it — the
full table is `docs/electrical/locations.md`.

Interior: Garagem, Datacenter, WC Serviço, Suite (+ WC, + Closet), Hall, Escadas
to LP1, Sala, Cozinha, Lavandaria, Arrumos Cozinha, Escadas to RP1, Office,
Arrumos Office, Hall Quartos, WC1 P1, WC2 P1, Quarto Kids, Quarto Guest 1,
Quarto Guest 2, Reading Corner, Casa das Máquinas, Casa de Hóspedes.

Exterior: Pátio Intermédio 1 (Garagem) and 2 (Limoeiro), Pátio Inglês 1, Pátio
Inferior 1–3 (Pomar, Horta, Relvado), Pátio Superior 1–2 (Pomar, Passadiços),
Guest House Patio.

**Three lower patios have no panel assigned yet** — CMQ or LP0 is undecided,
because their lighting and sockets are not installed. The decision follows the
installation.

---

## Racks — Datacenter

Three 24U racks:

| Rack | Contents |
|------|----------|
| RACK 1 | Networking — the whole stack, internet, fibre, and the house's structured-cabling patch panels |
| RACK 2 | Compute, mostly UNRAID |
| RACK 3 | Audio/Video — **passive**, intended for house-wide AirPlay 2 and distributed HDMI, not operational |

Each rack: **three-phase power**, one breaker per phase in LP0, plus a
**6-outlet UPS strip** from LP0's dedicated UPS area.

---

## The breaker map

`docs/electrical/breaker-map/` — one CSV per panel, ~188 breakers across
LP0 (70), LP1 (37), RP0 (38), RP1 (21) and CMQ (22), plus a Shelly i4 sheet.

| Column | Meaning |
|--------|---------|
| `PROTEÇÃO` | Breaker ID — `DG*` general, `ID*` differential, `D*` circuit |
| `Equipamento` | What it feeds |
| `Quadro` | Panel |
| `Diferencial` | Protecting differential |
| `Fase` | `F1` / `F2` / `F3`, or several |
| `Consumo MAX` | Expected load |
| `Sub-Ligação` | Sub-circuit |
| `FONTE 24V` | 24 V supply output, for DC circuits |

A row with a value **only** in the second column is a section header, not a
breaker — it marks a differential's group, e.g. `ID1 - 220V - INTERIOR`.

!!! warning "Re-export after editing the spreadsheet"
    The xlsx in iCloud remains the editing surface. If it changes and the CSVs
    are not re-exported, the committed copy becomes the stale one — which has
    already happened this week to `.claude/skills` symlinks and `.mcp.json`
    paths.

---

## Where power and network meet

- **The Shelly i4 sheet** links scene controllers to circuits, which is the
  bridge between the two layers. 35 i4 units are reserved on the network side.
- **PoE draw is known per switch port**, so the powered edge is already half
  mapped without touching the electrical model.
- **The DIN-rail panel switches** — `LP1/LP0/RP0/RP1 Switch DinRail` on SW1
  port17-20 — are unmanaged PoE switches living *in* the panels, serving whatever
  in that panel needs ethernet or PoE. Only LP1 is connected.

---

## Planned, not built

| Thing | Status |
|-------|--------|
| Casa de Hóspedes + its CHO panel | under construction |
| Pool panel | will hang off CMQ, with its disconnect *in* CMQ — the pool panel sits in a hatch, so the upstream disconnect keeps it reachable |
| Lower-patio lighting and sockets | not installed; panel undecided |
| Access points | **+7**: Casa das Máquinas, pool machine room, Casa de Hóspedes, and four outdoor (Pátio Garagem, Limoeiro + Inglês, Inferior, Superior) |
| Cameras | **+10**: 3 outdoor PoE, 7 indoor |

The house is heading from 5 APs to 12 and from 7 cameras to 17. Model the
physical layer **now**, while it is 57 devices rather than 74.

---

## Related

- `home-network` — VLANs, DNS/DHCP, firewall, Wi-Fi
- home-docs `electrical/locations.md`, `electrical/fuse-boxes.md`,
  `electrical/breaker-map/`
- home-docs `network/netbox-inventory-plan.md` — where this becomes a model
