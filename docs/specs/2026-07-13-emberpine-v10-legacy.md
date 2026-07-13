# Emberpine v10 — Achievements & Legacy

## Design pillars
Long-term addiction loop: give players a reason to keep a browser tab's save
alive across weeks and multiple `setSail` prestige runs, not just one
Monument. Celebrate everything (Animal Crossing / Forager house): unlocks
are frequent, loud, and low-stakes — first-wood-chopped gets the same
fireworks treatment as the 25th raider driven off. Nothing gates content;
every achievement is a bonus lens on things players already do.

## The persistence problem
`S.stats` (`g`, `b`, `jobs`, `fedDay`) is **per-island**, not lifetime: both
`setSail` (line ~2199) and the "save leaked from another island" migration
in `loadGame` (line ~1519) rebuild it as `{g:{},b:{},jobs:0}` on every
prestige. Correct for the Guild Charter's `QUESTS`, which replay per island,
but achievements keyed off `S.stats.g.wood` would silently reset the moment
a player sails — exactly wrong for "legacy." Achievements and lifetime
counters must live outside the `save-v1` blob.

Fix: a second, private, non-shared, non-island-suffixed storage key,
`'legacy-v1'`, written via `store.set('legacy-v1', S.legacy, false)`. The
`store` helper (line ~338) only appends an `:iN` island suffix when the `sh`
flag is true and `ISLAND>1` — a plain `sh=false` key, like `'save-v1'`
itself, stays one continuous blob for the whole browser regardless of how
many times `ISLAND` increments. Load it once in `loadGame` alongside
`store.get('save-v1')`; write it via a `saveLegacySoon()` debounce mirroring
`saveSoon()`/`saveTimer`.

## Data model
`S.legacy = { ach:{}, g:{}, b:{}, kills:0, chats:0, tiles:0, pets:0,
maxCrew:0, arriveScore:0, islands:[] }`

- `ach`: map of achievement id → unlock timestamp. Presence = earned,
  never deleted even if the live stat that triggered it later drops.
- `g`/`b`: lifetime mirrors of `S.stats.g`/`S.stats.b`, bumped alongside
  them at every existing call site (`gain()`; `placeBuilding` line ~801;
  the upgrade path line ~1460).
- `kills`: bumped inside `hurtGoblin` (line ~2027) in the `g.hp<=0` branch,
  next to the existing `+2 goldore`/`+15 score` reward.
- `chats`: bumped in `sendChat` (line ~1756) before the push to `pendingChat`.
- `tiles`: `S.legacy.tiles += sp` added inside `playerTick` (line ~762),
  the same `sp` already used to advance `S.me.x/y`.
- `pets`: new hit-test added to the existing `cv.addEventListener('click',
  ...)` handler (line ~1506) against the `critters` array, ahead of the
  current tile-based checks; on a hit, `spawnBurst` a small heart puff.
- `maxCrew`: high-water mark of `S.villagers.length`, checked in the 5s
  poll that already refreshes `#ledger` (line ~2240).
- `arriveScore`: `S.score` snapshotted on first boot and again inside
  `setSail` right before it writes the new `save-v1` (line ~2199), so
  "score earned this island" is `S.score - S.legacy.arriveScore`.
- `islands`: finished-island records appended inside `lightFlame` (line
  ~1920), before the player can sail away: `{island:ISLAND,
  name:islandInfo().short, days:+(S.playSec/DAYLEN).toFixed(1),
  score:S.score-S.legacy.arriveScore, ts:now()}` — `days` reuses the same
  math `showVictory` (line ~1901) already uses for the victory card.

## Achievement checking
One `ACH` array, shaped like `QUESTS` (line ~1678): `{id, t, icon, cat,
secret, c:()=>bool, score}`. A new `achTick()`, called from the same
per-frame pass as `combatTick(dt)`/`critterTick(dt)` (line ~1648), skips any
id already in `S.legacy.ach` and on `c()===true` writes the timestamp,
`S.score+=score`, `toast('🏆 Achievement: '+t+' — +'+score)`, `sfx('quest')`,
`spawnFireworks(S.me.x, S.me.y)`, and `saveLegacySoon()`. Wrapped in the
same `guard++<10` re-entrancy cap `questTick` uses, since one `gain()` burst
can clear several achievements at once.

## The 18 achievements
| id | Name | Badge | Category | Condition | Score |
|---|---|---|---|---|---|
| gath_wood1 | First Bark | 🪵 | Gathering | 1st wood ever gathered | 5 |
| gath_wood250 | Lumberjack | 🪓 | Gathering | `legacy.g.wood>=250` | 40 |
| gath_stone250 | Stonebound | 🪨 | Gathering | `legacy.g.stone>=250` | 40 |
| gath_1000 | Full Larder | 🧺 | Gathering | sum of all `legacy.g` ≥1000 | 75 |
| build_first | First Roof | 🏠 | Building | first `home:true` building placed | 10 |
| build_10 | Skyline | 🏘️ | Building | sum of all `legacy.b` ≥10 | 50 |
| build_industry | Industrialist | 🏭 | Building | sawmill+smelter+farm+dock+bakery+workshop all standing at once | 75 |
| build_torch5 | Let There Be Light | 🕯️ | Building | `legacy.b.torch>=5` | 25 |
| chat_first | Broke the Ice | 🔥 | Social | 1st campfire message sent | 10 |
| chat_20 | Fireside Regular | 💬 | Social | `legacy.chats>=20` | 30 |
| crew_6 | Full House | 👥 | Social | `legacy.maxCrew>=6` | 40 |
| flame_1 | Flamekeeper | 🔥 | Islands | 1st `lightFlame()` ever, any island | 100 |
| sail_1 | Island Hopper | ⛵ | Islands | `setSail` used at least once | 60 |
| flame_all | Master of the Isles | 🗺️ | Islands | `legacy.islands` covers island ids 1, 2, 3 | 200 |
| raid_1 | Raider Repelled | 🛡️ | Combat | `legacy.kills>=1` | 20 |
| raid_25 | Valley Defender | 🏹 | Combat | `legacy.kills>=25` | 80 |
| walk_1000 | Wanderlust | 👣 | Secret | `legacy.tiles>=1000` | 30 |
| pet_1 | New Best Friend | 🐔 | Secret | `legacy.pets>=1` | 15 |

905 total bonus score across all 18 — roughly one full Guild Charter clear
plus the Monument bonus, so it reads as a meaningful second track without
outscoring the core loop. The two Secret rows render as a `❓` silhouette
with no hint text until earned; every other locked row shows its full
condition text, Forager-style, so players can chase a visible checklist.

## Combat category note
The brief calls this a "placeholder for v6." It isn't — `docs/specs/
2026-07-13-emberpine-v6-combat.md` already shipped, and `index.html` already
has a working goblin-raid system (`goblins[]`, `S.raid`, `hurtGoblin`,
`combatTick`) live from Village tier onward. `raid_1`/`raid_25` ship as
real achievements this update; only the `legacy.kills` counter is new.

## Achievements panel (Ledger tab)
Reuse the trophy button (`#ledgerTab`, 🏆) and `#ledger` panel instead of new
chrome. Add a two-tab header inside `#ledger`'s `<h3>` — "STANDINGS"
(today's `renderLedger()`, unchanged) and "TROPHIES" (new), toggled by a
small button pair, state kept in a `ledgerView` variable, re-rendered on the
same click handler and 5s poll (line ~2240). Trophies view lists all 18 in
category order: earned rows show badge/name/score/unlock time in color;
locked rows show the badge at 35% opacity plus condition text, same
`.ltally` bordered-block language `renderLedger` already uses for the
Wonder/tally blocks. Header line: "🏆 14/18 EARNED · 905 PTS AVAILABLE".

## Villager legacy: veterans
`vLvl(v)` (line ~2093) already caps at 5 (`xp>=100`) and already grants
passive speed/capacity scaling via `1+.07*(vLvl-1)` and
`carryCap=4+2*(vLvl-1)` — unchanged. New: the instant a villager first
reaches `vLvl`5, roll a permanent `v.perk` from `['Swift','Packmule']`
(deterministic on the villager's name/id so a reload never rerolls it),
toast `'⭐ '+name+' is now a veteran — '+perk+'!'`, and apply one extra flat
bonus stacked on the existing formulas: Swift adds +10% to the speed
multiplier in `villagerTick` (line ~538); Packmule adds a flat +1 to
`carryCap`. Persist `v.perk` alongside the other per-villager fields already
round-tripped in `saveGame` (line ~1513), `loadGame` (line ~1533), and the
3-crew slice `setSail` carries over (line ~2198), so a veteran a player
chooses to bring survives the prestige. Render a ⭐ + perk name appended to
the level badge in the villager row (line ~1365).

## Island legacy strip
A compact per-island record, sourced from `S.legacy.islands`, in two spots:
- **Splash screen** (`#splashCard`, line ~299): appended under the existing
  `.fine` print, above "ENTER THE VALLEY" — one line per completed island,
  e.g. "🔥 Emberpine Valley — 6.2 days · 340 pts", newest first, hidden
  entirely if empty. Needs `store.get('legacy-v1')` resolved before the
  splash paints, awaited alongside the existing pre-splash `loadGame()`.
- **Ledger Trophies tab**: the same rows, appended under the achievement
  list as a "🗺️ ISLAND LEGACY" block, visible mid-run too.

## Toast + fireworks on unlock
No new particle system: `toast()` (line ~1250) and `spawnFireworks()` (line
~2089, the 26-particle rainbow burst already used for the Monument and
Wonder) are reused verbatim for every achievement unlock and
villager-goes-veteran event, so "toast + burst of color" keeps meaning
"progress" regardless of which system triggered it. `#verBadge` (line
~262), which still reads "EMBERPINE v5" despite v6 combat already being
live, gets bumped to "EMBERPINE v10" in the same pass.

## QA checklist
- Sail island 1→2→3: confirm `S.legacy.{ach,g,b,kills,chats,tiles}` survive
  each `setSail` reload while `S.stats` correctly resets.
- `flame_all` only fires after three distinct `islands` entries (ids 1, 2,
  3), not three lights on the same island via reload tricks.
- Demolishing a building never revokes an already-earned `build_industry`,
  and a missing `legacy-v1` (first-ever run) falls back to the empty shape
  above without throwing.
