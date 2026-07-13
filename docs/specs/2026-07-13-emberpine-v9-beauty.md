# Emberpine v9 — Town Beautification: Decor & Beauty Score

## Design pillars
Expression over optimization. Decor is cheap, plentiful, and visually varied
so players decorate for the *look* of their town, not for a min-maxed grind.
Buffs are soft (single-digit percentages) — a beautiful town feels nicer to
play in, but an ugly, purely-industrial Emberpine is never punished, only
less rewarded. Modeled on Animal Crossing / Stardew town-upgrade beats:
small trinkets add up, duplicates are worth less than variety, and a
generous placement rewards a rare cosmetic payoff (the wandering artist).

## New build category: Decor
Add a `decor` bucket to `BUILD_CATS` (alongside `homes`/`production`/
`civic`/`infra`/`monument`), label "Decor", icon 🌷, unlocked from Hamlet
(tier 0, no lock) so new players can prettify immediately. Seven entries
added to `BUILDS`, all 1x1 (no footprint changes needed anywhere — fountain
deliberately stays 1x1 rather than 2x2 so it drops into the existing
`walkable`/`placeBuilding` single-tile checks with zero new plumbing):

1. **Flower Bed** 🌷 — cost `{wood:2}`. Procedural draw: 3-4 small colored
   dot clusters (pink/yellow/purple) over a dark soil patch, palette varies
   by tile hash so beds don't look identical. Beauty weight 2.
2. **Hedge** 🌿 — cost `{wood:3}`. Draw: a scalloped green mound (2-3
   overlapping arcs), same silhouette family as the tree sprites already on
   screen so it reads as "trimmed nature." Beauty weight 2.
3. **Lamp Post** 💡 — cost `{wood:4,stone:2}`. Draw: reuses the torch's
   post-and-flame construction (a thin post + a warm circular glow, same
   `Math.sin(now()/90+sx)` flicker trick as `torch`) but taller and thinner,
   with a small lantern cage box instead of an open flame. Beauty weight 3.
4. **Bench** 🪑 — cost `{plank:3}`. Draw: two plank-brown rectangles (seat +
   backrest) with two short leg strokes. Beauty weight 3.
5. **Fountain** ⛲ — cost `{stone:8,plank:2}`. Draw: a stone ring (stroked
   circle) with a lighter animated inner disc that pulses radius via
   `Math.sin(now()/...)`, echoing the flame-flicker idiom used by torch and
   the monument's eternal-flame glow. Beauty weight 6 (highest single-item
   weight — it's the centerpiece decor).
6. **Banner** 🚩 — cost `{cloth:2,wood:2}`. Draw: a pole plus a triangular
   cloth flag whose tip x-offset oscillates a few px with `now()` for a
   flutter effect. Beauty weight 4.
7. **Garden Gnome** 🧙 — cost `{stone:1,ore:1}`. Draw: a small stone-grey
   body cone + a red conical hat triangle, cheapest decor item and
   deliberately the "meme" one. Beauty weight 5 (rewards the joke item so
   players actually use it).

All seven get entries in `BCOLS` (fallback fill color if their custom draw
branch is skipped) and in `ICON_SVG` so the build-bar chip (`iconHTML`) and
world tiles both render bespoke art instead of falling through to
`ICON_SVG._missing`. None are `home`, `civic`, or production buildings, so
they need no changes to `moveIn`, job assignment, or resource rates — they
are inert props exactly like `torch`/`path` are today, minus torch's
night-work radius effect.

## Beauty score
`beautyScore()` is computed on demand (cheap: town sizes here run in the
tens of buildings) and cached, invalidated on `placeBuilding` and
`demolishBuilding` the same way `checkTownTier()` is invoked from both today.

For each placed decor instance:
- It only counts if a **path tile** or a **home building** (`cottage`,
  `house`, `manor`, or the Hall) lies within radius 3 (`dx*dx+dy*dy<=9`,
  the same squared-distance idiom `torchNear` already uses at radius
  `<20`). Decor dropped in the industrial back lot away from where
  villagers actually walk contributes nothing — this is the "near paths/
  homes" placement pressure.
- Qualifying instances contribute their base weight (2-6, listed above).
- **Diminishing per duplicate type**: the Nth placed instance of a given
  decor type (counting only qualifying instances, town-wide, ordered by
  build time) contributes `weight * 0.7^(N-1)`, floored at a 0.2 multiplier
  floor (so a 30th flower bed still contributes `2*0.2=0.4`, never zero).
  This is what pushes players toward *variety* rather than carpeting the
  map in one cheap item.
- **Synergy bonus**: a Fountain within 2 tiles of a `plaza` building gets
  its contribution multiplied by 1.5 (6 → 9) — a concrete, discoverable
  "put the fountain by the plaza" reward. A Lamp Post within 2 tiles of a
  Well gets the same 1.5x (a "well-lit water source" flavor pairing).
  Synergy bonuses stack with, and apply after, the diminishing-duplicate
  multiplier.

`Beauty = sum of all qualifying decor contributions`, an integer score
shown in the ledger (see below). This is a separate number from `S.score`
(the Guild Ledger leaderboard score) — decor still grants the normal `+15`
build score via the untouched `placeBuilding` scoring line, but Beauty
itself is not added to `S.score` so it can't be farmed for leaderboard rank
by itself; it only unlocks the passive buffs below.

## Beauty tiers & buffs
A `BEAUTY_TIERS` array, structured the same way as the existing
`TOWN_TIERS` (ordered, cumulative, each with a name/threshold), re-evaluated
in the same tick pass that calls `checkTownTier()`:

| Tier | Name | Threshold | Villager speed | Villager XP gain | Artist visits |
|---|---|---|---|---|---|
| 0 | Plain | 0 | +0% | +0% | no |
| 1 | Tidy | 15 | +4% | +5% | no |
| 2 | Charming | 35 | +8% | +10% | no |
| 3 | Picturesque | 65 | +12% | +15% | yes |
| 4 | Postcard-Perfect | 100 | +16% | +20% | yes, more often |

Crossing a tier fires a `toast` exactly like `checkTownTier()` does today
("🌷 Emberpine looks Charming now!"), and re-renders the build bar/HUD.
Dropping below a threshold (via `demolishBuilding`) silently drops the
tier back down — no penalty toast, just quiet loss of the buff, to avoid
punishing players for reshuffling their town.

**Speed buff wiring**: `villagerTick`'s speed formula
(`v.speed*(v.hasTool?1.6:1)*(1+.07*(vLvl(v)-1))*(onPath(v.x,v.y)?1.35:1)*(v.hungry?0.75:1)`)
gets one more multiplicative factor, `(1+beautySpeedBonus())`, where
`beautySpeedBonus()` returns 0/.04/.08/.12/.16 per the table. It stacks
with the Path speed bonus and the Workshop tool bonus exactly like every
other factor in that chain already does — a Tidy town with paths and tools
is just one more multiplier in the same expression, no branching needed.

**XP buff wiring**: the three villager-XP-gain sites (`v.xp=(v.xp||0)+
v.carry.n`, the `carry.multi` loop variant, and the hauler
crate-deposit `v.xp=(v.xp||0)+1`) each multiply the XP delta by
`(1+beautyXPBonus())` before adding, rounded to the nearest integer so XP
stays an integer feeding `vLvl()`'s `Math.floor((v.xp||0)/25)` tiers
unchanged.

## Wandering artist visitor event
Modeled directly on the existing wandering-trader mechanism
(`trader={active,offer,until,next}`, driven by `traderTick()` inside the
same ambience loop that already calls it once per tick, rendered via a
dedicated HUD element the way `renderTrader()` populates `#trader`).

A parallel `artist={active:false,until:0,next:now()+240000}` object is
polled by a new `artistTick()`, gated by `beautyTier()>=3` (Picturesque or
better) — if the town's beauty drops below tier 3 the artist simply stops
being rolled, exactly like the trader's own independent timer, no special
cancellation needed. When eligible and `now()>artist.next`:
- Roll a visit: `artist.active=true`, `artist.until=now()+45000`.
- Toast: "🎨 A wandering artist strolls through and sketches your town!"
  and `sfx('quest')` (reusing an existing cue, no new audio asset).
- Immediately gift 1 ornament at tier 3, 2 ornaments at tier 4, via the
  existing `gain('ornament', n)` call — no trade UI, no player action
  required, distinguishing it from the trader's give/get exchange.
- Next roll: `now()+300000+Math.random()*300000` (5-10 min) while eligible,
  mirroring the trader's own `150000+Math.random()*150000` cooldown shape
  but rarer, since this is a bonus, not a resource loop.
Optional visual: spawn the artist at the Plaza (or Hall if no plaza) using
the same `spawnBurst`/particle idiom used for build completion, for a
one-frame "someone is here" flourish; no new sprite/pathing required since
the artist doesn't need to walk.

## Ledger UI: Beauty meter
`renderLedger()` already composes the `#ledgerList` panel out of stacked
blocks (`wh` = Valley Wonder progress bar, `rh` = leaderboard rows, a
closing `.ltally` "YOUR TALLY" block). Insert a new block, `bh`, right
after the Wonder block, in the same `.ltally` visual language (bordered
div, `<b>` label, an 8px bordered progress-bar div filled with
`var(--amber)` at `width:NN%`): label "🌷 TOWN BEAUTY", bar fill =
`min(100, beautyScore()/nextTierThreshold*100)`%, caption line showing the
current tier name and, if not maxed, "12 more to Postcard-Perfect" style
countdown text (same pattern as the Wonder block's "63% · click the site to
contribute" caption). This makes Beauty visible in the same panel players
already check for score/leaderboard standing, at zero new UI surface (no
new button, no new panel).

## Placement synergy hints
Reuse `firstTime(key,msg)` (the one-shot toast helper already used for the
Monument and Farm onboarding tips) to teach the two synergy pairings the
first time each relevant decor type is selected in the build bar:
- First time `fountain` is selected: `firstTime('decorFountain','Fountains
  glow brighter near the Plaza — place one within 2 tiles for a beauty
  bonus.')`
- First time `lamppost` is selected: `firstTime('decorLamp','Lamp Posts
  pair well with a Well nearby — place one within 2 tiles for a beauty
  bonus.')`
Additionally, append a short suffix to the build-bar description string
for these two items only (e.g. Fountain's `desc` gains " · bonus near
Plaza"), shown via the existing `costStr`/`.bc` rendering in
`buildTileEl` — no new DOM, just longer `desc` text on two `BUILDS`
entries.

## Balance notes
- Total cost to reach tier 1 (Tidy, 15 beauty) is roughly 3-4 flower beds
  or hedges placed along an existing path — a few minutes of gathering,
  intentionally cheaper than any production building.
- Reaching tier 4 (100 beauty) requires real variety (all 7 types,
  multiple of the cheaper ones) because of the duplicate-diminishing curve
  — a single-item spam town caps out around 35-45 beauty even with dozens
  of copies, keeping tiers 3-4 aspirational rather than a five-minute
  checkbox.
- Beauty buffs are deliberately smaller than the tool (+60%) and path
  (+35%) speed bonuses so decor reads as a pleasant multiplier on top of
  real infrastructure, not a replacement for it.

## Persistence
Decor buildings persist exactly like any other `S.buildings` entry (no new
save-format fields). `beautyScore()`/`beautyTier()` are derived, not
stored, and recomputed on load the same way `checkTownTier()` re-evaluates
after `loadState`. The artist's `active/until/next` timers are ephemeral
(not persisted) exactly like the trader's — worst case a reload skips one
scheduled visit, matching the existing trader behavior on reload.
