# Emberpine v9 — Town Beautification: Decor & Beauty Score

## Design pillars
Expression over optimization. Decor is cheap, plentiful, and visually varied
so players decorate for the *look* of their town, not for a min-maxed grind.
Buffs are soft (single-digit percentages) — a beautiful town feels nicer to
play in, but an ugly, purely-industrial Emberpine is never punished, only
less rewarded. Modeled on Animal Crossing / Stardew town upgrades: small
trinkets add up, duplicates are worth less than variety, and generous
placement is rewarded with a rare cosmetic payoff (the wandering artist).

## New build category: Decor
Add a `decor` bucket to `BUILD_CATS` (alongside `homes`/`production`/
`civic`/`infra`/`monument`), label "Decor", icon 🌷, unlocked from Hamlet
with no era/tier lock so new players can decorate immediately. Seven new
`BUILDS` entries, all 1x1 — fountain deliberately stays 1x1 rather than 2x2
so it needs zero changes to `walkable`/`placeBuilding`'s single-tile checks:

1. **Flower Bed** 🌷 — `{wood:2}`. 3-4 small colored dot clusters over a
   soil patch, palette varies by tile hash so beds aren't identical.
   Beauty weight 2.
2. **Hedge** 🌿 — `{wood:3}`. A scalloped green mound (2-3 overlapping
   arcs), same silhouette family as existing tree sprites. Weight 2.
3. **Lamp Post** 💡 — `{wood:4,stone:2}`. Reuses torch's post-and-glow
   construction (same `Math.sin(now()/90+sx)` flicker) but taller/thinner
   with a lantern cage instead of an open flame. Weight 3.
4. **Bench** 🪑 — `{plank:3}`. Two plank-brown rectangles (seat + back)
   with two short leg strokes. Weight 3.
5. **Fountain** ⛲ — `{stone:8,plank:2}`. A stroked stone ring with an
   animated inner disc pulsing radius via `Math.sin`, echoing the
   flame-flicker idiom used by torch and the monument's eternal flame.
   Weight 6 — the centerpiece decor item.
6. **Banner** 🚩 — `{cloth:2,wood:2}`. A pole plus a triangular flag whose
   tip oscillates a few px with `now()` for flutter. Weight 4.
7. **Garden Gnome** 🧙 — `{stone:1,ore:1}`. A grey cone body + red conical
   hat, cheapest item and deliberately the "meme" one. Weight 5, to reward
   players for actually placing it.

All seven get entries in `BCOLS` (fallback fill color) and `ICON_SVG` so
the build-bar chip (`iconHTML`) and world tiles render bespoke art instead
of falling through to `ICON_SVG._missing`. None are `home`, `civic`, or
production buildings, so `moveIn`, job assignment, and resource rates need
no changes — decor is an inert prop exactly like `torch`/`path` today,
minus torch's night-work radius effect.

## Beauty score
`beautyScore()` is computed on demand and cached, invalidated from both
`placeBuilding` and `demolishBuilding` the same way `checkTownTier()` is
already invoked from `placeBuilding` today. For each placed decor instance:

- **Proximity gate**: only counts if a path tile or a home building
  (`cottage`/`house`/`manor`/Hall) is within radius 3
  (`dx*dx+dy*dy<=9`, the same squared-distance idiom `torchNear` uses at
  radius `<20`). Decor stashed away from where villagers walk contributes
  nothing.
- **Base contribution**: the item's weight (2-6, above).
- **Diminishing per duplicate**: the Nth qualifying instance of a given
  type, town-wide by build order, contributes `weight * 0.7^(N-1)`, floored
  at a 0.2 multiplier (a 30th flower bed still gives `2*0.2=0.4`, never
  zero) — this is what pushes players toward variety over spam.
- **Synergy bonus**: a Fountain within 2 tiles of a `plaza` gets its
  contribution multiplied 1.5x (6→9); a Lamp Post within 2 tiles of a
  `well` gets the same 1.5x. Synergy applies after the duplicate multiplier.

`Beauty = sum of all qualifying contributions`, an integer shown in the
ledger. It's separate from `S.score` — decor still grants the normal +15
build score via the untouched `placeBuilding` scoring line, but Beauty
itself doesn't feed `S.score`, so it can't be farmed for leaderboard rank;
it only unlocks the tier buffs below.

## Beauty tiers & buffs
`BEAUTY_TIERS`, structured like the existing `TOWN_TIERS` (ordered,
cumulative, name + threshold), re-evaluated in the same tick pass that
calls `checkTownTier()`:

| Tier | Name | Threshold | Villager speed | Villager XP gain | Artist |
|---|---|---|---|---|---|
| 0 | Plain | 0 | +0% | +0% | no |
| 1 | Tidy | 15 | +4% | +5% | no |
| 2 | Charming | 35 | +8% | +10% | no |
| 3 | Picturesque | 65 | +12% | +15% | yes |
| 4 | Postcard-Perfect | 100 | +16% | +20% | yes, more often |

Crossing a tier fires a toast exactly like `checkTownTier()` does today
("🌷 Emberpine looks Charming now!") and re-renders the build bar/HUD.
Dropping below a threshold after a `demolishBuilding` silently drops the
tier back down — no penalty toast, just quiet loss of the buff.

**Speed wiring**: `villagerTick`'s speed formula (`v.speed*(v.hasTool?1.6:1)
*(1+.07*(vLvl(v)-1))*(onPath(v.x,v.y)?1.35:1)*(v.hungry?0.75:1)`) gets one
more factor, `(1+beautySpeedBonus())`, returning 0/.04/.08/.12/.16 per the
table — it stacks with the path and tool bonuses as just another term in
the same product, no branching needed.

**XP wiring**: the three villager-XP-gain sites (the `v.xp=(v.xp||0)+
v.carry.n` delivery line, its `carry.multi` variant, and the hauler
crate-deposit `+1`) each multiply their XP delta by `(1+beautyXPBonus())`
before adding, rounded to an integer so `vLvl()`'s `Math.floor((v.xp||0)/25)`
tiering is unaffected.

## Wandering artist visitor event
Modeled directly on the existing trader (`trader={active,offer,until,next}`,
driven by `traderTick()` from the same ambience loop, rendered into `#trader`
via `renderTrader()`). A parallel `artist={active:false,until:0,
next:now()+240000}` is polled by a new `artistTick()`, gated on
`beautyTier()>=3` — below that the artist simply never rolls, no special
cancellation logic needed. When eligible and `now()>artist.next`:

- Visit starts: `artist.active=true`, `artist.until=now()+45000`.
- Toast "🎨 A wandering artist strolls through and sketches your town!" plus
  `sfx('quest')` (reusing an existing cue).
- Immediate gift: 1 ornament at tier 3, 2 at tier 4, via the existing
  `gain('ornament', n)` — no trade UI or player action, unlike the trader's
  give/get exchange.
- Reroll: `now()+300000+Math.random()*300000` (5-10 min), rarer than the
  trader's own `150000±150000` window since this is a pure bonus.

Optional flourish: `spawnBurst` at the Plaza (or Hall if none) on arrival,
reusing the build-completion particle idiom. No new sprite or pathing is
needed since the artist doesn't walk.

## Ledger UI: Beauty meter
`renderLedger()` already stacks blocks into `#ledgerList` (`wh` = Valley
Wonder bar, `rh` = leaderboard rows, a closing `.ltally` "YOUR TALLY"
block). Insert a new `bh` block right after the Wonder block, same
`.ltally` visual language — bordered div, `<b>` label, an 8px bordered
progress bar filled `var(--amber)` at `width:NN%`: label "🌷 TOWN BEAUTY",
fill = `min(100, beautyScore()/nextThreshold*100)`%, caption showing the
current tier name and a "12 more to Postcard-Perfect" countdown (mirroring
the Wonder block's "63% · click the site to contribute" caption). Zero new
UI surface — same panel players already open for score standing.

## Placement synergy hints
Reuse `firstTime(key,msg)` (the one-shot toast helper already used for the
Monument and Farm tips) the first time each relevant decor is selected:
`firstTime('decorFountain', 'Fountains glow brighter near the Plaza — place
one within 2 tiles for a beauty bonus.')` and the equivalent
`decorLamp` hint for Lamp Post + Well. Additionally, Fountain's and Lamp
Post's `desc` strings gain a short suffix (" · bonus near Plaza" / " · bonus
near Well") surfaced automatically through the existing `.bc` description
rendering in `buildTileEl` — no new DOM.

## Balance notes
- Tier 1 (15 beauty) costs roughly 3-4 flower beds/hedges along an
  existing path — a few minutes of gathering, cheaper than any production
  building.
- Tier 4 (100 beauty) requires real variety: the duplicate-diminishing
  curve caps a single-item-spam town around 35-45 beauty even with dozens
  of copies, so tiers 3-4 stay aspirational rather than a five-minute box
  to check.
- Beauty buffs stay below the tool (+60%) and path (+35%) speed bonuses so
  decor reads as a pleasant multiplier on top of real infrastructure, not
  a replacement for it.

## Persistence
Decor buildings persist as ordinary `S.buildings` entries — no save-format
changes. `beautyScore()`/`beautyTier()` are derived, not stored, recomputed
on load the same way `checkTownTier()` re-evaluates after load. The
artist's `active/until/next` timers are ephemeral, unpersisted, exactly
like the trader's — a reload at worst skips one scheduled visit.
