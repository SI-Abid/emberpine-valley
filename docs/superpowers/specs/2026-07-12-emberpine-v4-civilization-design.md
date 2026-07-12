# Emberpine Valley v4 — "Civilization" Design

Date: 2026-07-12
Status: Approved by user (design); spec pending user review

## Goal

Make the settlement itself a progression system. Houses replace the Recruit
button as the only way to grow population; villagers live in, and sleep at,
their own homes; everyone eats daily; and the town levels through four tiers
(Hamlet → Village → Town → City) gated by population and civic buildings.
Players must build a real town — homes, wells, taverns, plazas — not just
factories and farms. Single self-contained `index.html` on GitHub Pages;
`emberpine-valley.html` stays byte-identical.

## Constraints

- Data-driven extension of existing tables (`BUILDS`, `QUESTS`, icon set) plus
  new `HOMES` and `TOWN_TIERS` tables. Reuse existing systems: pathfinding,
  `drawBuilding`, popups, toasts, save/load, SVG icon system (every new
  building gets an `ICON_SVG` entry in the v3 style — 24×24, xmlns, 2px
  #2b2620 outline, flat palette fills).
- No regression to: v2 Monument arc, v3 icons, target claiming, pause/save.
- Old saves must load and keep all villagers (see Migration).
- Recruit button and `recruitCost()` are removed (roster keeps its header
  and job selectors).

## 1. Homes & population

New `HOMES` table (subset of `BUILDS`, marked `home:true`):

| key | Name | Cost | cap | Unlock |
|---|---|---|---|---|
| `cottage` | Cottage 🐱 | 6 plank, 2 stone | 1 | start |
| `house` | House 🏠 | 12 plank, 6 stone, 4 bread | 2 | Village tier |
| `manor` | Manor 🏛 | 20 brick, 8 glass, 6 bread | 3 | Town tier |

- **Population capacity** = 2 (Town Hall, permanent) + Σ cap of owned homes.
- **Move-in rule** on placement or upgrade: fill empty slots with existing
  homeless villagers first (nearest first); each remaining empty slot spawns
  one new villager over the next few seconds (staggered ~2s apart, each with
  the `👋 <name> joins the guild!` toast + recruit sfx). This one rule covers
  new games, growth, and old-save migration.
- **Upgrade in place:** clicking an owned home opens its popup: occupant list
  + an `Upgrade → House/Manor` button (visible when the next tier is unlocked)
  charging the full next-tier cost (no credit for the old building), replacing
  the building's type in place. Occupants stay; new slots follow the move-in
  rule. No downgrade, no demolish (out of scope, matches existing buildings).
- **Assignment:** `v.home = key(x,y)` of their building (`'hall'` for the two
  hall residents). If a home's building ever disappears from state
  (defensive), occupants become homeless.
- Homes are not walkable (standard building), draw with `drawBuilding` +
  new icons. Villager count no longer limited to 16 names: after `VNAMES`
  is exhausted, reuse names with Roman suffixes ("Wren II").

## 2. Home life — night rest at home

Current behavior: at night (dark, not near torch) villagers path to the HALL
and sleep. v4 change in `villagerTick`:

- Night + not torch-covered → path to `v.home`'s tile (adjacent tile, homes
  aren't walkable) and sleep there; zzz particles above the house.
- Homeless villagers keep today's behavior (sleep at the hall) — the crowd of
  homeless sleepers at the hall is deliberate feedback.
- Torch-lit work still overrides sleep exactly as today (no change to that
  branch). Dawn wake-up unchanged.

## 3. Food upkeep

- At dawn (day-phase crossing from night to morning, once per game day —
  detect via `dayPhase()` wrap), every villager eats 1 food from `S.inv`,
  cheapest first: berry → fish → egg → bread.
- Fed: normal. Unfed: `v.hungry=true` — work speed ×0.75 and haulers won't
  pick up crates; roster shows 🥺 on the row. Cleared at the next dawn meal
  if food is available.
- The player character never eats (they're the founder, not a subject).
- HUD: when total edible stock < population, the population chip shows ⚠️
  (title: "Not enough food for the next meal").
- New-save inventory unchanged; first dawn is ≥1 real day away, so early game
  is not starved.

## 4. Town tiers

New `TOWN_TIERS` table; `S.town = {tier:0}` (index into the table).

| # | Tier | Requires | Grants |
|---|---|---|---|
| 0 | ⛺ Hamlet | start | cottage |
| 1 | 🗺 Village | pop ≥ 6 AND ≥1 well | house, tavern · +50 score |
| 2 | 🏘 Town | pop ≥ 10 AND ≥1 tavern AND ≥1 plaza | manor, chapel, statue · +100 score |
| 3 | 🏰 City | pop ≥ 16 AND ≥1 chapel AND ≥1 statue | +250 score · fireworks over the hall · permanent "City" title |

- Checked in `questTick`-style hook (on pop change / building placed). Tier-up
  is permanent (no demotion if villagers later starve — pop only grows anyway).
- HUD chip (top bar, next to clock): tier emoji + "Emberpine Hamlet/Village/
  Town/City". Tier-up shows a banner toast + `quest` sfx (City additionally
  fires the fireworks burst used by the Monument ceremony, over the hall).

New civic buildings (normal `BUILDS` entries, no production, `civic:true`):

| key | Name | Cost | Unlock |
|---|---|---|---|
| `well` | Well ⛲ | 10 stone | start |
| `tavern` | Tavern 🍺 | 16 plank, 8 bread | Village |
| `plaza` | Plaza 🎪 | 12 stone, 6 plank | Village |
| `chapel` | Chapel ⛪ | 20 brick, 10 glass | Town |
| `statue` | Statue 🗿 | 10 stone, 2 goldbar | Town |

Civic buildings and homes use the same era-lock UI as v2's Monument gating
(greyed tile + "🔒 Village" label), driven by town tier instead of Monument
stage. Both gating systems coexist: `ERA` (monument) gates kiln/glassworks/
forge/loom/gilder; `TIER` gates house/manor/tavern/plaza/chapel/statue.

## 5. UI

- **Roster header:** `👥 7/9` (population / capacity) + 🏠 icon; villagers
  without a home get 🛌❓ (homeless) and hungry ones 🥺 on their row. Recruit
  button removed; in its place a hint line: "Build homes to attract settlers."
- **Home popup:** building popup extended for `home:true` buildings — occupant
  names + Upgrade button (when unlocked & affordable, with cost line).
- **HUD:** town tier chip; ⚠️ on the villagers chip when food short.
- **Build bar:** new Homes + Civic entries with tier locks; keeps v3 SVG
  icon pattern (8 new icons: cottage, house, manor, well, tavern, plaza,
  chapel, statue — the statue must read distinct from the Monument icon).
- **Quests:** Guild Charter 14 → 20:
  15. Build a cottage (r: 4 plank) · 16. House 4 settlers (r: 6 berry) ·
  17. Dig a well → reach Village (r: 8 stone) · 18. Keep everyone fed for a
  full day (complete when a dawn meal leaves zero hungry villagers with
  pop ≥ 4; r: 5 bread) · 19. Reach Town (r: 10 brick) · 20. Reach City
  (r: none — the fireworks are the reward).
  (Existing quest 4 "Grow the guild to 3 settlers" now satisfied by cottages.)

## 6. Save & migration

- Save gains: per-villager `home`, `hungry`; `S.town`; `S.lastMeal` (day
  index of last dawn meal). Loader defaults: `home:null`, `hungry:false`,
  `town:{tier:0}`, `lastMeal:0`.
- Old saves: all villagers load homeless (hall crowd), pop may exceed
  capacity — that's allowed (capacity gates *new* arrivals only). First
  homes built absorb them via the move-in rule. Recruit button is simply
  gone; no data conversion needed.
- Tier is recomputed-if-higher on load (pop/buildings may already satisfy
  Village for old saves — they get the banner once on first load).

## 7. Out of scope (explicitly)

Happiness/beauty auras, families/children, villager death/starvation (unfed
= slower, never dies), demolition/refunds, homelessness penalties beyond the
visual, multiplayer sharing of any civic state.

## 8. Testing plan (Playwright on local http.server)

1. Cottage placed → homeless-first move-in, else staggered spawn + toast;
   pop/capacity math right; occupants listed in popup.
2. Upgrade cottage→house in place: occupants retained, new settler arrives,
   type/icon swap, cost charged.
3. Night: housed villager paths to own house and sleeps there (position near
   home tile, not hall); homeless sleeps at hall; torch-work override intact.
4. Dawn meal: food deducted cheapest-first; shortage sets hungry (×0.75 speed
   measurable via v.work accumulation) + roster 🥺 + HUD ⚠️; next fed dawn
   clears it.
5. Tier-ups fire exactly at spec thresholds; build-bar locks flip; City
   fireworks + title. Tier recompute on old-save load.
6. Old-save migration: v3 save with 6 villagers loads homeless, no errors,
   homes absorb them.
7. Regression: Monument arc, icons, pause/save, target claiming, build-
   selection persistence all unchanged.
8. `emberpine-valley.html` byte-identical at the end.
