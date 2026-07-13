# Emberpine v10 — Achievements & Legacy

## Design pillars
Long-term addiction loop: give players a reason to keep a browser tab's save
alive across weeks and multiple `setSail` prestige runs, not just one
Monument. Celebrate everything (Animal Crossing / Forager house): unlocks are
frequent, loud, and low-stakes — first-wood-chopped gets the same fireworks
treatment as the 25th raider driven off. Nothing here gates content; every
achievement is a bonus lens on things players already do.

## The persistence problem this update has to solve
`S.stats` (`g`, `b`, `jobs`, `fedDay`) is **per-island**, not lifetime: both
`setSail` (line ~2199) and the "save leaked from another island" migration
in `loadGame` (line ~1519) rebuild it as `{g:{},b:{},jobs:0}` on every
prestige. That's correct for the Guild Charter's `QUESTS`, which are meant
to replay each island, but it means achievements keyed off `S.stats.g.wood`
would silently reset the moment a player sails — exactly wrong for a
"legacy" feature. Achievements and lifetime counters must live outside the
`save-v1` blob entirely.

Fix: a second, private, non-shared, non-island-suffixed storage key,
`'legacy-v1'`, written via `store.set('legacy-v1', S.legacy, false)`. The
`store` helper (line ~338) only appends an `:iN` island suffix when the
`sh` (shared) flag is true and `ISLAND>1` — a plain `sh=false` key, exactly
like `'save-v1'` itself, is one continuous blob for the whole browser no
matter how many times `ISLAND` increments. Load it once in `loadGame`
alongside `store.get('save-v1')`; write it via a `saveLegacySoon()` debounce
mirroring `saveSoon()`/`saveTimer`, from the same call sites (`gain`,
`placeBuilding`, `hurtGoblin`, `sendChat`, `playerTick`).

## Data model
`S.legacy = { ach:{}, g:{}, b:{}, kills:0, chats:0, tiles:0, pets:0,
maxCrew:0, arriveScore:0, islands:[] }`

- `ach`: map of achievement id → unlock timestamp (ms). Presence of a key
  is "earned"; absence is "locked". Never deleted, even if the underlying
  live stat later drops (e.g. crew count falls after a villager reassigns).
- `g`/`b`: lifetime mirrors of `S.stats.g`/`S.stats.b` — every `gain()` call
  and both building-placement sites (`placeBuilding` line ~801, upgrade
  path line ~1460) bump both the per-island stat and the lifetime one in
  the same line.
- `kills`: lifetime goblins driven off, bumped inside `hurtGoblin` (line
  ~2027) in the `g.hp<=0` branch, alongside the existing `+2 goldore`/`+15
  score` reward.
- `chats`: lifetime campfire messages, bumped in `sendChat` (line ~1756)
  before the message is pushed to `pendingChat`.
- `tiles`: cumulative movement distance, accumulated in `playerTick` (line
  ~762) as `S.legacy.tiles += sp` on every frame the player actually moves
  (the same `sp` used to advance `S.me.x/y`).
- `pets`: bumped by a new hit-test in the existing `cv.addEventListener
  ('click', ...)` handler (line ~1506): check tap distance against the
  `critters` array (already iterated every frame by `critterTick`/
  `drawCritters`) before falling through to the current tile-based checks;
  on a hit, `spawnBurst` a small heart-colored puff and increment `pets`.
- `maxCrew`: high-water mark of `S.villagers.length`, checked once per
  second alongside the existing 1s tallies (the `presence` heartbeat at the
  bottom of the file, line ~2240).
- `arriveScore`: `S.score` snapshotted whenever an island begins — set once
  on first boot and again inside `setSail` right before it writes the new
  `save-v1` (line ~2199) — so "score earned on this island" is
  `S.score - S.legacy.arriveScore` at flame-lighting time.
- `islands`: array of finished-island records, appended inside `lightFlame`
  (line ~1920), *before* the player has a chance to sail away: `{island:
  ISLAND, name: islandInfo().short, days: +(S.playSec/DAYLEN).toFixed(1),
  score: S.score - S.legacy.arriveScore, ts: now()}` — `days` reuses the
  exact calculation `showVictory` (line ~1901) already does for the victory
  card.

## Achievement checking
One `ACH` array, structured exactly like `QUESTS` (line ~1678): `{id, t,
icon, cat, secret, c:()=>bool, score}`. A new `achTick()`, called from the
same per-frame update pass that already calls `combatTick(dt)`/
`critterTick(dt)` (line ~1648), loops `ACH`, skips any `id` already in
`S.legacy.ach`, and on `c()===true`: writes the timestamp, `S.score +=
score`, `toast('🏆 Achievement: '+t+' — +'+score)`, `sfx('quest')`,
`spawnFireworks(S.me.x, S.me.y)` (already used for the Monument and Wonder
completions), and `saveLegacySoon()`. Guarded with the same `guard++<10`
re-entrancy cap `questTick` uses, since multiple achievements can complete
in one `gain()` burst (e.g. a single haul finishing "First Bark" and
"Lumberjack" together).

## The 18 achievements
| id | Name | Badge | Category | Condition | Score |
|---|---|---|---|---|---|
| gath_wood1 | First Bark | 🪵 | Gathering | 1st wood ever gathered | 5 |
| gath_wood250 | Lumberjack | 🪓 | Gathering | `legacy.g.wood>=250` | 40 |
| gath_stone250 | Stonebound | 🪨 | Gathering | `legacy.g.stone>=250` | 40 |
| gath_1000 | Full Larder | 🧺 | Gathering | sum of all `legacy.g` ≥1000 | 75 |
| build_first | First Roof | 🏠 | Building | first `home:true` building placed | 10 |
| build_10 | Skyline | 🏘️ | Building | sum of all `legacy.b` ≥10 | 50 |
| build_industry | Industrialist | 🏭 | Building | sawmill+smelter+farm+dock+bakery+workshop all standing at once (live `S.stats.b`) | 75 |
| build_torch5 | Let There Be Light | 🕯️ | Building | `legacy.b.torch>=5` | 25 |
| chat_first | Broke the Ice | 🔥 | Social | 1st campfire message sent | 10 |
| chat_20 | Fireside Regular | 💬 | Social | `legacy.chats>=20` | 30 |
| crew_6 | Full House | 👥 | Social | `legacy.maxCrew>=6` | 40 |
| flame_1 | Flamekeeper | 🔥 | Islands | 1st `lightFlame()` ever, any island | 100 |
| sail_1 | Island Hopper | ⛵ | Islands | `setSail` used at least once | 60 |
| flame_all | Master of the Isles | 🗺️ | Islands | `legacy.islands` covers island ids 1, 2 and 3 | 200 |
| raid_1 | Raider Repelled | 🛡️ | Combat | `legacy.kills>=1` | 20 |
| raid_25 | Valley Defender | 🏹 | Combat | `legacy.kills>=25` | 80 |
| walk_1000 | Wanderlust | 👣 | Secret | `legacy.tiles>=1000` | 30 |
| pet_1 | New Best Friend | 🐔 | Secret | `legacy.pets>=1` | 15 |

905 total bonus score across all 18 — comparable to one full Guild Charter
clear plus the Monument bonus, so achievements read as a meaningful second
progression track without outscoring the core loop. `secret` achievements
(the last two) render as a `❓` silhouette with no hint text until earned,
matching the "oddball secret" brief; everything else shows its full
condition text even while locked, Forager-style, so players can chase a
visible checklist.

## Combat category note
The brief calls this a "placeholder for v6." It isn't — `docs/specs/
2026-07-13-emberpine-v6-combat.md` already shipped, and `index.html` has a
working goblin-raid system (`goblins[]`, `S.raid`, `hurtGoblin`,
`combatTick`) reachable from Village tier onward. `raid_1`/`raid_25` ship
as real, working achievements this update; only the counter (`legacy.
kills`) is new.

## Achievements panel (Ledger tab)
Reuse the trophy button (`#ledgerTab`, 🏆) and `#ledger` panel rather than
adding new chrome. Add a two-tab header inside `#ledger`'s `<h3>` —
"STANDINGS" (today's `renderLedger()` content, unchanged) and "TROPHIES"
(new) — toggled by a small in-panel button pair, state kept in a
`ledgerView` variable, re-rendered on the same `ledgerTab` click and the 5s
poll that already refreshes `#ledger` when open (line ~2240). The Trophies
view lists all 18 in category order: earned rows show badge, name, score,
and relative unlock time in full color; locked rows show the badge at 35%
opacity plus condition text (or `❓` for secrets), same `.ltally` bordered-
block visual language `renderLedger` already uses for the Wonder/tally
blocks. A header line reads "🏆 14/18 EARNED · 905 PTS AVAILABLE".

## Villager legacy: veterans
`vLvl(v)` (line ~2093) already caps at 5 (`xp>=100`) and already grants
passive speed/capacity scaling through the existing `1+.07*(vLvl-1)` and
`carryCap=4+2*(vLvl-1)` formulas — that part needs no change. What's new:
the instant a villager's `vLvl` first reaches 5, roll a permanent `v.perk`
from `['Swift','Packmule']` (deterministic on `v.name+v.id`-style hash so a
reload doesn't reroll it), toast `'⭐ '+name+' is now a veteran — '+perk+'!'`,
and apply one extra flat bonus on top of the existing formulas: Swift adds
a further +10% to the speed multiplier in `villagerTick` (line ~538);
Packmule adds a flat +1 to `carryCap`. Persist `v.perk` alongside the other
per-villager fields already round-tripped in `saveGame` (line ~1513),
`loadGame` (line ~1533), and the 3-crew slice `setSail` carries over (line
~2198) — veterans a player chooses to bring survive the prestige. Render a
⭐ + the perk name appended to the level badge in the villager list row
(`'<span class="vlv">Lv'+vLvl(v)+'</span>'`, line ~1365).

## Island legacy strip
A compact per-island record row, sourced straight from `S.legacy.islands`,
rendered in two places with the same markup:
- **Splash screen** (`#splashCard`, line ~299): appended below the existing
  `.fine` print, before "ENTER THE VALLEY" — one line per completed island,
  e.g. "🔥 Emberpine Valley — 6.2 days · 340 pts", newest first, hidden
  entirely (not an empty box) if `S.legacy.islands` is empty. Requires
  `store.get('legacy-v1')` to resolve before the splash paints, so the load
  is awaited alongside the existing pre-splash `loadGame()` call.
- **Ledger Trophies tab**: same rows appended under the achievement list as
  a "🗺️ ISLAND LEGACY" block, so the record is visible mid-run too, not
  just at the splash.

## Toast + fireworks on unlock
No new particle system: `toast()` (line ~1250) and `spawnFireworks()` (line
~2089, the 26-particle rainbow-hue burst already used for the Monument and
Wonder) are reused verbatim for every achievement unlock, quest complete,
and villager-goes-veteran event. This keeps the celebration vocabulary
consistent — players learn once that "toast + burst of color" means
"progress," regardless of which system triggered it.

## Version badge
`#verBadge` (line ~262) still reads "EMBERPINE v5" despite v6 combat
already being live in this build; bump it to "EMBERPINE v10" as part of
this update so it tracks the spec numbering going forward.

## QA checklist
- Sail from island 1→2→3, confirm `S.legacy.ach`/`g`/`b`/`kills`/`chats`/
  `tiles` survive each `setSail` reload while `S.stats` correctly resets.
- Verify `flame_all` only fires after three separate `islands` entries with
  ids 1, 2, 3 (not three lights on the same island via reload tricks).
- Confirm demolishing buildings never *revokes* `build_industry` if it was
  already earned (achievements are one-way).
- Confirm `legacy-v1` absence (first-ever run) doesn't throw — default to
  the empty `S.legacy` shape above.
