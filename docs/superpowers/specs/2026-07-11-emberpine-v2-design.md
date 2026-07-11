# Emberpine Valley v2 — "The Five Eras" Design

Date: 2026-07-11
Status: Approved by user

## Goal

Replace the v1 ending — place the Monument (80 plank / 30 ingot / 15 bread) and
instantly win — with a five-stage Monument construction arc fed by a deeper,
wider economy: 4 new map resources, 5 new buildings, 7 new goods, recipes up to
5 chain-steps deep, an extended quest line, and a proper victory ceremony.
The game remains a single self-contained `index.html` deployed on GitHub Pages.

## Technical approach

Data-driven extension of the existing tables. No new subsystems:

- New map resources extend `baseRes` generation, `RES_INFO`, and the existing
  harvest / 150s-regrow / villager-claim machinery.
- New buildings extend `BUILDS` and `RECIPES`; production runs through the
  existing `productionTick`.
- The staged Monument is a new `MONUMENT_STAGES` table plus a small
  `S.monu = {stage, given:{...}}` state object, using the same
  walk-up-and-contribute interaction as the shared Wonder.
- Quest chain extends the `QUESTS` array.

## New map resources

Generated in `gen()` alongside trees/stone/iron, harvested by the player (E key)
or by villagers, regrow after 150s, participate in target claiming.

| Resource | Tile emoji/type | Spawns on | Yield | Gathered by | Rarity |
|---|---|---|---|---|---|
| Clay pit | `clay` | sand tiles near water | 2 clay | miner | uncommon |
| Sand dune | `sand` | sand/beach tiles | 2 sand | miner | common on beaches |
| Gold vein | `gold` | rock ground (terrain 4) | 1 goldore | miner | rare (~⅓ of iron's rate) |
| Flax field | `flax` | grass meadows | 2 flax | forager | uncommon |

`RES_INFO` additions (harvest times tuned slower than tier-1):

```
clay:{yield:'clay',n:2,time:2.2,emoji:'🧱'}
sand:{yield:'sand',n:2,time:1.8,emoji:'⏳'}
gold:{yield:'goldore',n:1,time:3.0,emoji:'✨'}
flax:{yield:'flax',n:2,time:1.4,emoji:'🌿'}
```

Miner `finds` becomes `['stone','iron','clay','sand','gold']`; forager
`['berry','flax']`. (Claiming already spreads villagers across targets.)

## New goods

`inv` gains: `clay, sand, goldore, flax, brick, glass, beam, cloth, goldbar,
ornament`. All get HUD icons and NICE names; HUD chips only render once the
player owns ≥1 of a good (to avoid a 21-chip HUD from minute one).

## New buildings & recipes

| Building | Cost to build | Recipe (via productionTick) | Rate |
|---|---|---|---|
| 🔥 Kiln | 20 stone + 10 wood | 2 clay + 1 wood → 1 brick | 5s |
| 🪩 Glassworks | 16 stone + 8 plank | 2 sand + 1 wood → 1 glass | 6s |
| ⚒️ Forge | 20 stone + 6 ingot | 2 ingot + 1 plank → 1 beam | 7s |
| 🧵 Loom | 12 plank + 8 wood | 2 flax → 1 cloth | 5s |
| 👑 Gilder | 10 brick + 4 glass | 1 goldbar + 1 glass → 1 ornament | 8s |

Existing Smelter gains a second recipe: 1 goldore + 1 wood → 1 goldbar
(runs whichever recipe has inputs available, gold first).

Deepest chain: gold vein → goldore → goldbar → (+glass) ornament → Spire.

## Building availability gating

Build bar shows a building only when its era is reached (locked entries render
greyed with a 🔒 and the unlocking stage name):

- From start: everything from v1 (monument entry renamed "Monument Foundation").
- Foundation complete → Kiln, Glassworks, Forge.
- Frame complete → Loom, Gilder.

## The staged Monument

`BUILDS.monument` placement cost becomes 40 stone + 20 plank (= Foundation).
Placing it sets `S.monu={stage:1,given:{}}`. Stages 2–4 are filled by walking
to the Monument, opening its popup, and clicking "Contribute" buttons (moves
goods from inventory into `S.monu.given`, up to each requirement). A stage
completes when all its requirements are met; the map sprite grows through five
visual states drawn in `drawBuilding`.

| Stage | Requirements | On completion |
|---|---|---|
| 1 Foundation | placement (40 stone + 20 plank) | unlock Kiln + Glassworks + Forge; toast era banner |
| 2 Frame | 24 brick + 16 beam | unlock Loom + Gilder |
| 3 Walls | 20 glass + 20 brick | reveal gold veins on minimap |
| 4 Spire | 12 cloth + 8 ornament | unlock "Hold the Feast" button |
| 5 Eternal Flame | feast: 15 bread (single click when affordable) | victory ceremony |

Score bonuses: +50 per completed stage, +200 for the Flame.

## Victory ceremony

On lighting the Flame:

- All villagers pathfind to the Monument and emote 🎉.
- Fireworks: coloured particle bursts above the Monument for ~10s (reuses
  `parts`/`spawnBurst` with new colours and upward gravity).
- Victory card (existing #victory overlay, extended text) shows:
  days survived (`playSec/DAYLEN`), total goods produced (sum of
  `S.stats.g`), final score, and a rank title by score:
  <300 Settler · <600 Builder · <1000 Architect · ≥1000 Master Builder of
  Emberpine.
- "Keep playing" button; the valley continues running. `S.won` is set here
  (not at placement).

`S.playSec` accumulates in the loop (only while running and not paused) and is
saved, so "days survived" survives reloads.

## Quest line (Guild Charter 8 → 14)

Replaces the final v1 quest ("Raise the Monument") with:

8. Lay the Monument Foundation (r: 10 clay)
9. Fire 5 bricks (r: 6 sand)
10. Forge 3 steel beams (r: 8 clay)
11. Complete the Frame (r: 10 sand)
12. Craft an ornament (r: 5 bread)
13. Raise the Spire (r: 10 bread)
14. Light the Eternal Flame (r: none — ceremony is the reward)

## Trader & ledger

`TRADES` gains: 10 brick→6 glass, 8 cloth→1 ornament, 15 wood→4 clay,
6 glass→2 goldbar. Ledger/score already counts all goods via `gain()`.

## Save compatibility

- Save keeps key `save-v1` with added fields: `monu`, `playSec`. Loader
  defaults them (`monu:null`, `playSec:0`) for old saves.
- Migration: if an old save has a placed monument building but no `monu`
  field, set `S.monu={stage:2,given:{}}` (Foundation complete) and keep
  `S.won` as-is for score, but the ceremony/rank requires the Flame.
- New goods default to 0 via `Object.assign(S.inv, saved.inv)` pattern
  (S.inv literal must list every new good).

## Edge cases

- Villagers must not target gold/clay/sand/flax the player can't yet use —
  acceptable: goods are inert until buildings unlock; no gating on gathering.
- Kiln/Forge etc. placed before inputs exist simply idle (productionTick
  already no-ops when inputs are missing).
- Feast button disabled (greyed) until 15 bread held.
- Contributing is one-way; no refunds. Popup shows given/needed per good.
- Multiplayer Wonder is unchanged and separate from the Monument.

## Testing plan (Playwright against local server)

1. Fresh boot → new resources appear on map; miner gathers clay/sand/gold,
   forager gathers flax (force daylight via `darknessNow=()=>0`).
2. Kiln/Glassworks locked at start, unlocked after Foundation.
3. Full chain smoke test with injected inventory: place all buildings,
   verify brick/glass/beam/cloth/goldbar/ornament production ticks.
4. Contribute flow: stage advances exactly when requirements met; sprite
   state changes; score bonuses land.
5. Feast → ceremony: fireworks particles spawn, victory card shows stats,
   Keep playing resumes.
6. Save/reload mid-stage-3 → `monu.given` and stage persist.
7. v1-save migration: craft a save with monument building + won=true, no
   monu field → loads as stage 2.
8. Pause menu and localStorage persistence still work (regression).
