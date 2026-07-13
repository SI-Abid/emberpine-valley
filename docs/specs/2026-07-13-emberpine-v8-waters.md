# Emberpine v8 — Waters & Fishing Update

## Design pillars
- **Cozy depth**: fishing stays a background job, not a minigame. All new
  rolls piggyback on the existing fisher/dock work cycle and the existing
  dawn/day-rollover tick — no new input verbs, no QTEs.
- **Collection joy**: Animal Crossing energy — a checklist that fills in
  over weeks of play, silhouettes for the ones you haven't caught yet,
  the thrill of a Legendary tug on a quiet dawn. Value comes from variety
  and completion, not from a single grindy number going up.

## 1. Fish species table
Six species layered on top of the plain `fish` resource. Every completed
dock work-tick (villager Fisher, `RES_INFO.fishspot`, 2 fish / 2.6s cycle)
still yields the ordinary 2 `fish` used by food/bakery/trades today. In
addition, each completed tick rolls one species from the table below; a
hit adds 1 unit of that species' own inventory key (`fish_perch`,
`fish_bream`, etc.) on top of the normal catch, and counts toward
`S.stats.g` for the collection log. Only species whose season + time-of-day
window is currently active are eligible for that roll; weights below are
relative odds among currently-eligible species (roll re-normalizes each
tick, so a locked-out Legendary doesn't just donate its weight to Common).

| Tier | Species | Roll weight | Value | Season | Time of day |
|---|---|---|---|---|---|
| Common | Silverfin Perch 🐟 | 50 | 1 | any | any |
| Uncommon | Copper Bream 🐠 | 25 | 3 | Spring, Autumn | Day, Dusk |
| Rare | Moonshadow Trout 🐡 | 13 (26 in rain) | 6 | any | Night |
| Epic | Stormscale Bass 🐋 | 7 (14 in rain) | 10 | Summer, Winter | Dawn, Dusk |
| Mythic | Kraken's Kiss Eel 🐙 | 4 | 18 | Winter only | Night |
| Legendary | Emberfin Leviathan 🐳 | 1 | 40 | any | Dawn only |

Gating:
- Rain doubles Trout/Bass odds — reuses the existing `weather.rain` flag
  (`weather` object, `traderTick`-adjacent ambience block) so a rainy
  night at the dock genuinely feels different.
- Mythic requires 2+ Docks currently owned (`countB('dock')>=2`), mirroring
  the `TIER`/`ERA` unlock-gating pattern already used for buildings.
- Legendary requires Town tier 2+ (`S.town.tier`, same field
  `checkTownTier()` maintains) and can only be rolled once per in-game
  day — track `lastLeviathan` day number the same way `S.lastMeal` gates
  `dawnMealTick` to one firing per day boundary.
- Seasons are new and lightweight: `season = ['Spring','Summer','Autumn',
  'Winter'][Math.floor(dayNum/4)%4]`, where `dayNum` is the same
  `Math.floor(now()/1000/DAYLEN)` value `dawnMealTick` already computes
  (`DAYLEN=240`s), giving a 16-day (~64 real-minute) year.
- Time-of-day bands derive from the existing `dayPhase()` (0–1 fraction of
  `DAYLEN`): Dawn ≈ 0.90–1.00 & 0.00–0.08, Day 0.08–0.45, Dusk 0.45–0.55,
  Night 0.55–0.90 — chosen to line up with the brightness curve
  `darknessNow()` already uses, so "Night" fish bite when the screen is
  actually dark.

## 2. Beachcombing
Shells, driftwood, and message-bottles wash up on sand (`terrain===1`)
tiles at dawn, using the exact spawn/pickup shape the game already uses
for chicken eggs (`eggs` array, `critterTick`): world-space items that
auto-collect when the player walks within 0.85 tiles, or when an idle
Forager wanders within 0.9 tiles and paths toward the nearest one (same
"idle farmers stroll to nearby eggs" behavior at the tail of
`critterTick`, generalized to the Forager job since foragers already
gather beach-adjacent goods — berry/flax).

- Trigger: the same day-rollover check `dawnMealTick` uses
  (`Math.floor(now()/1000/DAYLEN) > S.lastMeal`) — beachcombing spawn runs
  alongside it so both fire once per in-game dawn.
- Spawn count: 3–6 items per dawn, scattered on sand tiles within the
  explored radius around the Hall (reuse `terrAt`/sand lookup already
  used by world-gen's clay/sand placement), capped at 10 items on the
  ground at once (eggs cap at 8 via `eggs.length<8`; beachcombing gets a
  slightly higher cap since sand coverage is sparser than farmland).
- Roll per spawned item: Shell 🐚 60% (value 1), Driftwood 🪵-style 🪵 30%
  (value 2, also usable as 1:1 substitute for `wood` in the Trader's
  existing barter, not in crafting recipes), Message Bottle 🍾 10%
  (value 5, and its only use is the collection log + a Trader premium
  offer — see §5).
- No new job: pickup is player-proximity or opportunistic Forager, exactly
  like eggs need no dedicated "chicken keeper" job.

## 3. Pearls from rare clams
Rather than inventing a new tile type, pearls piggyback on the existing
`clay` resource node (`RES_INFO.clay`, spawns on sand tiles near water at
16% per tile in world-gen, harvested by Miners or by the player's own E-key
harvest via `tryHarvest`/`resAt`). Flavor-reskin clay nodes near water as
"clam beds." On every completed clay harvest — both the player's
`S.me.harvest` completion (`gain(info.yield,info.n)` call) and a Miner's
stationary/non-stationary work-tick completion (`v.carry` path in the
villager tick) — roll a flat 5% chance to additionally `gain('pearl',1)`.
Pearls have value 12, feed the collection log, and are the highest-value
single ingredient the Trader can ask for (§5).

## 4. Fishmonger stall
A new production building, same shape as Sawmill/Bakery/Smelter
(`BUILDS` entry + `RECIPES` entry + `prodTimers` slot), filed under the
existing `production` category in `BUILD_CATS`.

- `BUILDS.fishmonger`: cost `plank:14, stone:6` (between Bakery's
  `plank:12,stone:10` and Workshop's `plank:16,ingot:4`), icon 🐟🪙,
  description states the current rate live (see below) the way Bakery's
  desc reads "2 wheat → 1 bread / 5s".
- Conversion output is always `goldbar` — the game's one existing
  scarce/precious resource (from `smelter`'s `goldore→goldbar` recipe,
  spent on `gilder` and the `statue` civic building) — so fish gain a real
  sink without introducing a brand-new currency.
- "Rotating rates": every 90 seconds the stall re-rolls its exchange ratio
  from a small pool — `{fish:8}`, `{fish:6}`, `{fish:4}` — each mapping to
  `1 goldbar`, using the same re-roll cadence philosophy as the Trader
  (`trader.next` window) but on its own independent timer so the two
  don't sync up. Named species convert at a flat bonus instead of the
  rotating ratio, keyed off their table `value` (§1): 1 unit of any
  species converts to `floor(value/4)` goldbar (minimum 1), so a
  Leviathan alone is worth 10 goldbar — deliberately better than dumping
  it into the rotating plain-fish rate.
- Runs on the existing production-timer loop (`prodTimers`), auto-pulling
  from `S.inv` the same way Sawmill pulls `wood`; no assigned villager
  job needed, consistent with Sawmill/Bakery/etc. not requiring one either
  (only Farm/Dock need a Farmer/Fisher).

## 5. Collection log UI
Extend the existing Valley Ledger panel (`#ledger` / `#ledgerList`,
populated by `renderLedger()`) with a new "COLLECTION" block below the
current "YOUR TALLY" line. Reuses `S.stats.g`, the lifetime-gained tally
`gain()` already increments for every resource key — no new tracking
structure needed, just a new read of it.

- One row per catalogued item: 6 fish species + 3 beachcombing items +
  pearl = 10 entries.
- Rendering: icon + name in full color with a checkmark if
  `(S.stats.g[key]||0)>0`, otherwise a greyed-out/silhouette icon (CSS
  `filter:grayscale(1) opacity(.35)`, no new asset needed) plus a "?" —
  same "haven't found it yet" read as an Animal Crossing critterpedia
  entry, done entirely with the data already in `S.stats.g`.
- Header shows a fraction, e.g. "COLLECTION 6/10", ticking up as
  `bumpRes()`-triggered HUD refreshes already happen on every `gain()`.
- Log persists automatically since `S.stats` already round-trips through
  `store.set('save-v1', …)`.

## 6. Trader premium offers
No change to Trader logic (`traderTick`, `renderTrader`) — it already
samples one entry uniformly at random from `TRADES` every 60-second
appearance window. Add rare-fish entries to the `TRADES` pool so they
surface at the same ~1-in-N odds as any other offer:
- `{give:{fish_leviathan:1},get:{goldbar:15}}` (walk-away premium over
  the Fishmonger's own 10-goldbar conversion — the Trader is the better
  sink for your one-a-day catch).
- `{give:{fish_eel:2},get:{ornament:1}}` (skips the goldbar→ornament
  chain entirely).
- `{give:{pearl:3},get:{cloth:6}}` and `{give:{bottle:1},get:{tool:1}}`
  for the beachcombing/pearl side of the loop.
These simply extend the existing `TRADES` array literal; the accept-trade
button, affordability check (`canAfford`), and `gain()` payout on accept
all already work unmodified.

## Non-goals
- No fishing rod item, no cast/reel input, no bite-timing minigame.
- No new currency: goldbar remains the one "money," reusing the
  smelter → gilder/statue economy that already exists.
- No changes to base `fish` yield/food value — species are a bonus layer,
  not a rebalance of existing dock output or `dawnMealTick` feeding.
