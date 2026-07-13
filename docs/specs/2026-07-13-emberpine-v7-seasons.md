# Emberpine v7 — Seasons

Date: 2026-07-13
Status: Draft for review

## Goal

Give the valley a slow, visible rhythm — four seasons that repaint the world
and gently nudge economy and movement, without ever punishing the player for
being caught in the "wrong" one. Single self-contained `index.html`;
`emberpine-valley.html` stays byte-identical.

## Design pillars

- **Cozy.** Seasons are weather, not difficulty spikes — no season should
  make the game feel worse to play, only different.
- **No punishing loss.** Every penalty is a soft rate multiplier (slower,
  not zero) and every season has at least one upside. Nothing perishes,
  nothing dies, no timers get harder to hit. Same ethos as v4's "unfed =
  slower, never dies."
- **Cheap and derived.** Season state should be free — computed from time
  the way `dayPhase()` already is — not another thing to save, migrate, or
  desync.

## 1. Season clock

- `DAYLEN=240` (seconds/day) already backs a day counter at
  `Math.floor(now()/1000/DAYLEN)` (used today for `S.lastMeal` in
  `dawnMealTick`). Reuse that exact expression as `day`.
- A season is **3 in-game days** = 720s ≈ 12 real minutes. Four seasons =
  48 real minutes for a full year, endless loop.
- `seasonIdx()` = `Math.floor(day/3)%4`, order **0 spring → 1 summer →
  2 autumn → 3 winter**. Pure function of `now()` — like `dayPhase()`,
  it needs no field in `S` and nothing to migrate on old saves.
- A companion `seasonDayFrac()` (progress 0–1 through the current 3-day
  block) is handy for fade-in/out of tint and particle density at season
  boundaries so changes feel like weather rolling in, not a hard cut.

## 2. Visual identity — tint overlay

- Each season gets a single `rgba` wash, applied once per frame as a
  full-viewport `fillRect`, in the same slot the existing weather effect
  uses today (`if(weather.rain){cx.fillStyle='rgba(60,90,130,.08)';
  cx.fillRect(0,0,VW,VH)}`, drawn after the day/night `lightCv` composite).
  Season tint draws immediately before that rain wash so rain still layers
  visibly on top in any season:
  - Spring: `rgba(140,220,140,.05)` — faint fresh-green lift.
  - Summer: `rgba(255,225,120,.04)` — warm, barely-there gold.
  - Autumn: `rgba(200,120,50,.07)` — amber/rust, the most saturated tint.
  - Winter: `rgba(210,225,245,.09)` — cool pale-blue, plus `darknessNow()`
    gets a flat `+.08` added on winter days (mirroring the existing
    `+.1` rain adds to `darknessNow()`), so winter genuinely reads darker
    and colder without touching the day-length math.
- Deliberately **not** done by remapping `TCOL`/`TCOL2` or touching
  `drawTile()`'s per-tile fill — that would mean re-deriving every terrain
  colour and the water shoreline-foam special case (`t===0` branch,
  ~line 857) per season. A flat overlay is one draw call, matches the
  proven rain technique exactly, and is trivial to tune by eye.
- Winter gets one small `drawTile` touch: on the water tile branch, the
  breathing shoreline foam and wave glints (the `nb` foam loop and the
  `wv>0.75` glint) get a subtler, whiter, less frequent variant to read as
  "cold water" — cosmetic only, no walkability change. No ice-ring /
  frozen-shoreline mechanic — considered and cut for scope and cozy-pillar
  reasons (extra walkable-tile logic around every water edge is exactly
  the kind of fiddly system this game avoids).

## 3. Ambience particles

`ambienceTick(dt)` already spawns two seasonal-feeling effects unconditionally:
fireflies (`color:'fly'`, when `darknessNow()>.3`) and butterflies
(`color:'butter'`, daytime grass tiles). Extend the same `critterT` cadence
block with a season gate, all pushed onto the shared `parts` array exactly
like existing particles (position, `vx`/`vy`, `life`/`max`, `color`, `sz`):

| Season | Particle | Spawn rule | Notes |
|---|---|---|---|
| Spring | petals (`color:'petal'`) | daytime, near trees, ~same rate as butterflies | gentle `flap`-style sideways drift, reuse the `butter` flutter formula (`p.vy=Math.sin(now()/120+p.flap)*.5`) |
| Summer | fireflies + butterflies | unchanged from today | summer is the "baseline" season, no new particle type |
| Autumn | leaves (`color:'leaf'`) | daytime, near trees, denser than petals (~1.5×) | falls with real `g` gravity like the default particle branch, gentle `vx` sway |
| Winter | snow (`color:'snow'`) | all day, screen-wide (not tile-gated like the others — sampled across the camera viewport the way `critterT` already samples `rx,ry`) | slow constant `vy`, tiny `vx` drift, higher spawn rate than any other ambience particle so winter reads as "always snowing lightly" |

- `drawParts()` already has a generic fallback (`else{...fillRect with
  p.color}`) that renders any unrecognized color as a plain tinted square —
  petals/leaves/snow can ship on that fallback on day one (color as a real
  CSS color string, e.g. `'#ffd6e8'` for petals) and only earn a bespoke
  branch (like `butter`'s flutter or `fly`'s jitter) if the flat square
  reads too plain in playtesting.
- `spawnBurst()` stays untouched — it's for action feedback (gather,
  build, deliveries), not ambience; seasons don't change it.
- Smoke (`smokeT` block) and existing weather rain (`rainFx`) are unchanged
  and continue to layer over/under seasonal ambience normally — winter snow
  and rain are mutually exclusive the same way weather already toggles
  `weather.rain` on a timer, so no snow+rain overlap to design around.

## 4. Gameplay modifiers

New `sMod(k)` function, a direct analogue of the existing `iMod(k)`
(`function iMod(k){const v=(islandInfo().mods||{})[k];return v===undefined?1:v}`),
reading a `SEASON_MODS[seasonIdx()]` table instead of `islandInfo().mods`.

| Season | Farm rate | Fish rate | Berry respawn | Villager speed (off-path) |
|---|---|---|---|---|
| Spring | ×1.25 | ×1.0 | ×1.25 faster | ×1.0 |
| Summer | ×1.0 | ×1.2 | ×1.0 | ×1.0 |
| Autumn | ×1.15 (harvest) | ×1.0 | ×1.0 | ×1.0 |
| Winter | ×0.75 | **×0.5** | ×0.7 slower | ×0.85 |

Important accuracy note: farm and dock output is **not** produced by
`productionTick`/`BUILDS[t].rate` (that pipeline is for crafting buildings —
sawmill, bakery, smelter, etc., driven by `RECIPES`). Farm/fish output is
driven by `RES_INFO.wheatplot`/`RES_INFO.fishspot` `.time`, consumed by the
`v.work` accumulator inside `villagerTick`
(`v.work+=dt*(v.hasTool?1.6:1)*(1+.05*(vLvl(v)-1))*(v.hungry?0.75:1)`,
~line 577), gated by the existing `stationary` boolean that already
distinguishes farm/dock work from regular resource gathering (~line 574).
So: **Farm rate** and **Fish rate** multiply into that same expression,
selected by `v.job==='farmer'?'farm':'fish'`, applied only when `stationary`
is true — the crafting buildings covered by `productionTick` are
intentionally untouched by seasons.

- **Berry respawn**: `resAt()`'s regrowth window (`if(rm&&now()-rm<150000)
  return null` — 150s) multiplies its `150000` constant by `sMod('berry')`
  for `baseRes[k].type==='berry'` specifically; other resource types
  (trees, stone, iron, etc.) keep the flat 150s regrowth year-round.
- **Villager speed**: the existing `spd` formula in `villagerTick`
  (`v.speed*(v.hasTool?1.6:1)*(1+.07*(vLvl(v)-1))*(onPath(v.x,v.y)?1.35:
  1)*(v.hungry?0.75:1)`, ~line 538) already branches on `onPath()`. Winter's
  ×0.85 replaces that trailing `1` — i.e. it only drags villagers walking
  off-path; anyone on a stone path keeps the full ×1.35 path bonus
  unchanged. This makes path investment read as "keeps the guild moving
  through winter," a positive lever rather than a penalty.
- All four multipliers default to `1` (or the listed non-winter value) so
  a missing `SEASON_MODS` entry degrades to today's behavior — same
  fail-open pattern `iMod` already uses.

## 5. Winter twist

Kept deliberately small, per the cozy/no-punishing-loss pillars:

1. **Fishing halves** — the ×0.5 fish-rate modifier above; docks still
   work, just slower, exactly like an unfed villager already works at
   ×0.75 rather than stopping.
2. **Torches matter more** — winter's `+.08` to `darknessNow()` (see §2)
   means the existing "dark and not `torchNear()`" sleep-early branch in
   `villagerTick` triggers sooner and more often in winter, so torch
   coverage around farms/docks/workshops meaningfully extends the winter
   work day. No new torch mechanic — the payoff comes entirely from
   `darknessNow()` shifting, which every existing torch/`punch()` lighting
   system already respects.
3. No walkability changes, no frozen water, no new tiles.

## 6. HUD season chip

`renderHUD()` already appends a `tierChip` and `clockChip` as sibling
`.res` divs (`updateTierChip()`/`updateClock()` fill their `innerHTML` on
a `setInterval`). Add a third: `seasonChip`, same pattern —
`<div class="res" id="seasonChip" title="Season"></div>`, filled by
`updateSeasonChip()` on the same 4s `setInterval` as `updateClock`:

- Spring 🌸, Summer ☀️, Autumn 🍂, Winter ❄️ + season name, e.g.
  `🍂 Autumn`.
- Placed after `clockChip` in the HUD row order (time-of-day, then season,
  reading left-to-right as "now → this cycle").

## 7. Season-change toast + first-time tip

- On the tick where `seasonIdx()` changes value (checked once per
  `ambienceTick`, same cadence as the `weather.next` check that already
  flips `weather.rain` and calls `toast(...)`), fire a `toast()`:
  e.g. `'🍂 Autumn settles over the valley…'` — one line per season,
  matching the existing rain/clear toast copy style
  (`'☔️ Rain drifts over the valley…'` / `'⛅️ The rain clears'`).
- `firstTime('season', …)` (the existing one-shot-per-save helper,
  `if(S.msgShown[k])return;S.msgShown[k]=1;toast(...)`) fires once, the
  first time any season boundary is crossed in a save: something like
  *"💡 The valley has seasons — farming, fishing and travel shift a little
  every few days. Nothing is ever lost, just paced differently."* This is
  the one new `S.msgShown` key; no other save-shape change (season itself
  is derived, never stored).

## 8. Out of scope

Seasonal building unlocks or costs, seasonal quests/Guild Charter entries,
per-season villager outfits/sprites, crop types that only grow in one
season, ice/frozen-water walkability, snow accumulation/visual persistence
on terrain, seasonal trader offers. All good candidates for a later pass,
none needed to make the valley feel alive right now.

## 9. Testing plan (Playwright on local http.server)

1. Fast-forward `now()` (or shrink `DAYLEN` in a test build) across a
   season boundary; confirm tint overlay, HUD chip, toast, and
   `SEASON_MODS` all flip together at the same `seasonIdx()` change.
2. Winter: fish gather time measurably ×2 versus summer; off-path villager
   speed measurably ×0.85; on-path speed unaffected; `darknessNow()`
   reads `+.08` higher at matched `dayPhase()`.
3. Spring: berry tile regrowth measurably faster (150000ms ×0.8 window).
4. Ambience: petal/leaf/snow particles appear only in their season and
   stop within one `seasonDayFrac()` fade window of the season ending.
5. `firstTime('season', …)` fires exactly once per save across multiple
   boundary crossings; old saves load with no `S.msgShown.season` and see
   it on their first crossing.
6. Regression: rain toggling, day/night lighting, farm/dock claiming,
   torch `punch()` radius, and save/load all unchanged outside the listed
   multipliers.
7. `emberpine-valley.html` byte-identical at the end.
