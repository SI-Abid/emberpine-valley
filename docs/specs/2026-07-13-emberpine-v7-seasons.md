# Emberpine v7 — Seasons

Date: 2026-07-13
Status: Draft for review

## Goal

Give the valley a slow, visible rhythm — four seasons that repaint the world
and gently nudge economy and movement, without ever punishing the player for
being caught in the "wrong" one. Single self-contained `index.html`;
`emberpine-valley.html` stays byte-identical.

## Design pillars

- **Cozy.** Seasons are weather, not difficulty — no season should make the
  game feel worse, only different.
- **No punishing loss.** Every penalty is a soft rate multiplier (slower,
  never zero), every season has an upside, nothing perishes or dies. Same
  ethos as v4's "unfed = slower, never dies."
- **Cheap and derived.** Season state is computed from time the way
  `dayPhase()` already is — nothing new to save or migrate.

## 1. Season clock

- `DAYLEN=240`s already backs a day counter, `Math.floor(now()/1000/DAYLEN)`
  (used today by `dawnMealTick` for `S.lastMeal`). Reuse it as `day`.
- A season = 3 in-game days (720s ≈ 12 real min); 4 seasons = 48 real min/year.
- `seasonIdx()` = `Math.floor(day/3)%4`, order 0 spring → 1 summer →
  2 autumn → 3 winter. Pure function of `now()`, like `dayPhase()` — no
  `S` field, no migration.
- `seasonDayFrac()` (0–1 progress through the 3-day block) drives a soft
  fade of tint/particle density at boundaries so it reads as weather
  rolling in, not a hard cut.

## 2. Visual identity — tint overlay

- One `rgba` wash per season, drawn as a single full-viewport `fillRect`
  in the exact slot the rain effect already uses (`if(weather.rain){
  cx.fillStyle='rgba(60,90,130,.08)';cx.fillRect(0,0,VW,VH)}`, after the
  `lightCv` day/night composite). Season tint draws just before that rain
  wash so rain still layers on top: Spring `rgba(140,220,140,.05)`,
  Summer `rgba(255,225,120,.04)`, Autumn `rgba(200,120,50,.07)`, Winter
  `rgba(210,225,245,.09)`.
- Winter also adds a flat `+.08` to `darknessNow()` (mirrors rain's
  existing `+.1`), so it reads colder/darker without touching day length.
- Deliberately **not** implemented inside `drawTile()` or by remapping
  `TCOL`/`TCOL2` — that would mean re-deriving every terrain colour plus
  the water shoreline-foam special case (`t===0` branch, ~line 857) per
  season. A flat overlay is one draw call and matches the proven rain
  technique exactly. Winter's only `drawTile` touch: the shoreline foam/
  wave-glint alpha goes subtler and whiter on water tiles — cosmetic, no
  walkability change. No ice-ring / frozen-shoreline mechanic — considered
  and cut for scope and the cozy pillar.

## 3. Ambience particles

`ambienceTick(dt)` already spawns fireflies (`color:'fly'`, when
`darknessNow()>.3`) and butterflies (`color:'butter'`, daytime grass) on
the `critterT` cadence, pushed onto the shared `parts` array. Extend that
block with a season gate:

| Season | Particle | Spawn rule |
|---|---|---|
| Spring | petals | daytime, near trees, butterfly-like rate; reuse `butter`'s flutter (`p.vy=Math.sin(now()/120+p.flap)*.5`) |
| Summer | fireflies + butterflies | unchanged (baseline season) |
| Autumn | leaves | daytime, near trees, ~1.5× denser than petals, real `g` gravity fall with light `vx` sway |
| Winter | snow | all day, screen-wide (sampled across camera view like `critterT` already does), slow `vy`, tiny `vx`, highest spawn rate of any ambience particle |

`drawParts()`'s generic fallback (`else{...fillRect with p.color}`) renders
any unrecognized color as a flat square, so petals/leaves/snow can ship on
that fallback (real CSS color strings) and only earn a bespoke branch —
like `butter`'s flutter — if needed. `spawnBurst()` (action feedback) and
`smokeT`/`rainFx` are untouched; snow and rain stay mutually exclusive the
same way `weather.rain` already toggles on its own timer.

## 4. Gameplay modifiers

New `sMod(k)`, a direct analogue of `iMod(k)` (`function iMod(k){const
v=(islandInfo().mods||{})[k];return v===undefined?1:v}`), reading
`SEASON_MODS[seasonIdx()]` instead of `islandInfo().mods`.

| Season | Farm rate | Fish rate | Berry respawn | Villager speed (off-path) |
|---|---|---|---|---|
| Spring | ×1.25 | ×1.0 | ×1.25 faster | ×1.0 |
| Summer | ×1.0 | ×1.2 | ×1.0 | ×1.0 |
| Autumn | ×1.15 | ×1.0 | ×1.0 | ×1.0 |
| Winter | ×0.75 | **×0.5** | ×0.7 slower | ×0.85 |

Accuracy note: farm/dock output is **not** produced by `productionTick`/
`BUILDS[t].rate` (that's the `RECIPES`-driven crafting pipeline — sawmill,
bakery, smelter, etc.). Farm/fish output comes from `RES_INFO.wheatplot`/
`RES_INFO.fishspot` `.time` consumed by `villagerTick`'s `v.work`
accumulator (`v.work+=dt*(v.hasTool?1.6:1)*(1+.05*(vLvl(v)-1))*
(v.hungry?0.75:1)`, ~line 577), gated by the existing `stationary` check
(~line 574). Farm/Fish rate multiply into that expression, selected by
`v.job==='farmer'?'farm':'fish'`; crafting buildings under `productionTick`
are intentionally untouched by seasons.

- **Berry respawn**: `resAt()`'s regrowth window (`now()-rm<150000`)
  multiplies its `150000` constant by `sMod('berry')`, for
  `baseRes[k].type==='berry'` only — other resources keep flat 150s.
- **Villager speed**: `villagerTick`'s `spd` formula (`v.speed*
  (v.hasTool?1.6:1)*(1+.07*(vLvl(v)-1))*(onPath(v.x,v.y)?1.35:1)*
  (v.hungry?0.75:1)`, ~line 538) already branches on `onPath()`. Winter's
  ×0.85 replaces the trailing `1` for off-path tiles only — on-path
  villagers keep the full ×1.35 unchanged, so path investment reads as a
  positive lever through winter, not a workaround for a penalty.
- All multipliers default to `1` off-winter, matching `iMod`'s fail-open
  pattern.

## 5. Winter twist

Kept small, per the pillars:

1. **Fishing halves** — the ×0.5 fish-rate above; docks keep working, just
   slower, the same way a hungry villager works at ×0.75 rather than
   stopping.
2. **Torches matter more** — winter's `+.08` to `darknessNow()` (§2) makes
   the existing "dark and not `torchNear()`" sleep-early branch in
   `villagerTick` trigger sooner, so torch coverage around farms/docks/
   workshops meaningfully extends the winter work day. No new torch
   mechanic — the payoff flows entirely from `darknessNow()` shifting,
   which every existing torch/`punch()` lighting call already respects.
3. No walkability changes, no frozen water, no new tiles.

## 6. HUD season chip

`renderHUD()` already appends `tierChip`/`clockChip` as sibling `.res`
divs, filled by `updateTierChip()`/`updateClock()` on a 4s `setInterval`.
Add `seasonChip` the same way — `updateSeasonChip()` on the same interval,
placed after `clockChip`: 🌸 Spring / ☀️ Summer / 🍂 Autumn / ❄️ Winter.

## 7. Season-change toast + first-time tip

- When `seasonIdx()` changes (checked once per `ambienceTick`, same
  cadence as the `weather.next` check that already flips `weather.rain`
  and calls `toast(...)`), fire one line per season, matching the existing
  rain copy style (`'☔️ Rain drifts over the valley…'`): e.g. `'🍂 Autumn
  settles over the valley…'`.
- `firstTime('season', …)` (existing one-shot helper: `if(S.msgShown[k])
  return;S.msgShown[k]=1;toast(...)`) fires once per save on the first
  boundary crossed: *"💡 The valley has seasons — farming, fishing and
  travel shift a little every few days. Nothing is ever lost, just paced
  differently."* Only new save field: the `S.msgShown.season` key —
  season itself is derived, never stored.

## 8. Out of scope

Seasonal building unlocks/costs, seasonal quests, per-season villager
sprites, season-locked crops, ice/frozen-water walkability, snow
accumulation on terrain, seasonal trader offers.

## 9. Testing plan (Playwright on local http.server)

1. Shrink `DAYLEN` in a test build to cross a season boundary; confirm
   tint, HUD chip, toast, and `SEASON_MODS` flip together at `seasonIdx()`.
2. Winter: fish gather time ×2 vs. summer; off-path speed ×0.85, on-path
   unaffected; `darknessNow()` reads `+.08` higher at matched `dayPhase()`.
3. Spring: berry regrowth window measurably shorter (×0.8 of 150000ms).
4. Ambience: petal/leaf/snow appear only in-season, fade at boundaries.
5. `firstTime('season', …)` fires once per save; old saves see it on their
   first crossing with no prior `S.msgShown.season`.
6. Regression: rain toggling, day/night lighting, farm/dock claiming,
   torch `punch()` radius, save/load unchanged outside listed multipliers.
7. `emberpine-valley.html` byte-identical at the end.
