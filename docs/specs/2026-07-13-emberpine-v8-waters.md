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
- Rain doubles Trout/Bass odds, reusing `weather.rain` (ambience block
  near `traderTick`).
- Mythic needs 2+ Docks owned (`countB('dock')>=2`), mirroring the
  `TIER`/`ERA` unlock-gating already used for buildings.
- Legendary needs Town tier 2+ (`S.town.tier`, set by `checkTownTier()`)
  and rolls at most once per in-game day — track a `lastLeviathan` day
  number the same way `S.lastMeal` gates `dawnMealTick` to one firing per
  day boundary.
- Seasons are new and lightweight: `season = ['Spring','Summer','Autumn',
  'Winter'][Math.floor(dayNum/4)%4]`, where `dayNum` is the same
  `Math.floor(now()/1000/DAYLEN)` value `dawnMealTick` already computes
  (`DAYLEN=240`s) — a 16-day, ~64-real-minute year.
- Time-of-day bands derive from `dayPhase()` (0–1 fraction of `DAYLEN`):
  Dawn ≈0.90–1.00 & 0.00–0.08, Day 0.08–0.45, Dusk 0.45–0.55, Night
  0.55–0.90 — lined up with the brightness curve `darknessNow()` already
  uses, so "Night" fish bite when the screen is actually dark.

## 2. Beachcombing
Shells, driftwood, and message-bottles wash up on sand (`terrain===1`)
tiles at dawn, reusing the exact spawn/pickup shape the game already uses
for chicken eggs (`eggs` array, `critterTick`): world-space items that
auto-collect within 0.85 tiles of the player, or when an idle Forager
wanders within 0.9 tiles and paths to the nearest one (the same "idle
farmers stroll to nearby eggs" tail-of-`critterTick` behavior, extended
to Foragers since they already gather beach-adjacent berry/flax).

- Trigger: the same day-rollover check `dawnMealTick` uses
  (`Math.floor(now()/1000/DAYLEN) > S.lastMeal`), so both fire once per
  in-game dawn.
- Spawn: 3–6 items per dawn on sand tiles near the Hall (reuse the
  `terrAt`/sand lookup world-gen already uses for clay/sand placement),
  capped at 10 on the ground at once (eggs cap at 8 via `eggs.length<8`;
  sand coverage is sparser, so the cap is a bit higher).
- Roll per item: Shell 🐚 60% (value 1), Driftwood 🪵 30% (value 2, also a
  1:1 Trader-barter substitute for `wood`), Message Bottle 🍾 10% (value
  5, collection log + Trader premium only — see §5).
- No new job: pickup is player-proximity or opportunistic Forager, just
  like eggs need no dedicated "chicken keeper."

## 3. Pearls from rare clams
Rather than a new tile type, pearls piggyback on the existing `clay`
resource node (`RES_INFO.clay`, spawns on sand near water at 16%/tile in
world-gen, harvested by Miners or the player's own E-key harvest via
`tryHarvest`/`resAt`) — flavor-reskinned as "clam beds" near water. On
every completed clay harvest — the player's `S.me.harvest` completion
(`gain(info.yield,info.n)`) and a Miner's work-tick completion (the
`v.carry` path in the villager tick) alike — roll a flat 5% chance to
additionally `gain('pearl',1)`. Pearls: value 12, feed the collection
log, and are the priciest single ingredient the Trader can ask for (§5).

## 4. Fishmonger stall
A new production building, same shape as Sawmill/Bakery/Smelter
(`BUILDS` entry + `RECIPES` entry + `prodTimers` slot), filed under the
existing `production` category in `BUILD_CATS`.

- `BUILDS.fishmonger`: cost `plank:14, stone:6` (between Bakery's
  `plank:12,stone:10` and Workshop's `plank:16,ingot:4`), icon 🐟🪙,
  live-rate description the way Bakery's desc reads "2 wheat → 1 bread /
  5s".
- Output is always `goldbar` — the one existing scarce resource (from
  `smelter`'s `goldore→goldbar` recipe, spent on `gilder`/`statue`) — so
  fish get a real sink without a brand-new currency.
- "Rotating rates": every 90s the stall re-rolls its ratio from a small
  pool — `{fish:8}`, `{fish:6}`, `{fish:4}` → `1 goldbar` — echoing the
  Trader's re-roll cadence (`trader.next`) but on its own independent
  timer so the two don't sync up. Named species bypass the rotating
  ratio: 1 unit converts at `floor(value/4)` goldbar (min 1) off their
  table `value` (§1), so a Leviathan alone is worth 10 goldbar.
- Runs on the existing `prodTimers` production loop, auto-pulling from
  `S.inv` like Sawmill pulls `wood`; no assigned villager needed, same as
  Sawmill/Bakery (only Farm/Dock need a Farmer/Fisher).

## 5. Collection log UI
Extend the Valley Ledger panel (`#ledger`/`#ledgerList`, populated by
`renderLedger()`) with a "COLLECTION" block below "YOUR TALLY". Reuses
`S.stats.g`, the lifetime-gained tally `gain()` already increments per
resource key — no new tracking structure, just a new read of it.

- 10 rows: 6 fish species + 3 beachcombing items + pearl.
- Icon + name in full color with a checkmark if `(S.stats.g[key]||0)>0`,
  else greyed-out (`filter:grayscale(1) opacity(.35)`, no new asset) plus
  a "?" — the Animal Crossing critterpedia silhouette read, built
  entirely from data already in `S.stats.g`.
- Header shows a fraction, e.g. "COLLECTION 6/10", advancing on the same
  `bumpRes()`-triggered HUD refresh every `gain()` already fires.
- Persists for free — `S.stats` already round-trips through
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
