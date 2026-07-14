# Emberpine Valley — Player Interaction Update (plan)

Goal: make other settlers something you *play with*, not just see. Four
milestones, each shippable alone, all riding the existing relay (rooms,
JSON frames, Durable Object storage) and the gift/escrow pattern that
already works.

## Design pillars

- **Walk-up, not menus**: interactions start by clicking a settler in the
  world, close enough to feel physical (≤6 tiles).
- **Async-friendly**: the valley is co-presence-light — every interaction
  needs an offline path (the market board) next to its live path (direct
  trade).
- **Cozy, not exploitable enough to matter**: confirm handshakes, clamps
  and the DO's single-threaded message processing prevent dupes; perfect
  server authority stays a Phase 3 non-goal.

## M1 — The settler popup (½ session)

Clicking another player's ghost opens a popup like the villager one:

- Name, score, town tier chip, 👑 if they've lit the Flame, achievements
  earned (from a small `profile` field added to presence).
- Actions: **👋 Wave** (sends a targeted emote that pops above your head
  on their screen + "Alice waved at you!" toast), **🎁 Gift** (moves the
  existing care-package button here from the ledger, keeping the ledger
  copy), **🔁 Trade** (M2).
- Needs: ghost hit-testing in the canvas click handler (same pattern as
  villagers), one new relay frame `{t:'wave', to, from}`.

## M2 — Direct trade (1 session)

Live, both players present, within 6 tiles.

**Flow** (offer/accept with a confirm handshake):
1. A clicks Trade → a small panel: pick up to 3 give-items with counts
   and up to 3 want-items (same chip UI as the trader).
2. `{t:'toffer', id, to, from, fromName, give, want}` → B gets a panel:
   the offer, Accept / Decline.
3. B accepts → client-side check B can afford `want` → escrow B's side
   locally (deduct) → `{t:'taccept', id}`.
4. A receives → check A can afford `give` → deduct, apply `want`,
   `{t:'tdone', id}` → B applies `give`. Either side failing sends
   `{t:'tcancel', id}` which refunds any escrowed goods.
5. 30-second timeout auto-cancels; walking >8 tiles apart cancels.

**Safety**: storage caps apply on receipt (partial-fit refuses the trade
up front, same as the NPC trader); all deltas clamp at 0; ids are
one-shot so replays are no-ops. A dishonest client can at worst cheat
itself a one-sided trade with a consenting partner — acceptable for a
cozy game, revisit in Phase 3.

## M3 — Market stall & trade board (1 session)

The async path, and a reason to build something new.

- **Market Stall** building (Village tier, ~12 plank + 6 cloth, new
  pixel sprite: counter + awning + hanging scales). Any player with a
  stall may post offers; anyone may fulfill from anywhere (it's a board,
  not a location — the stall is the posting license + flavor).
- **Posting**: pick give (escrowed immediately — deducted and shipped to
  the server) and want. `{t:'mkt_post', o:{id, by, byName, give, want}}`.
- **Fulfilling**: board UI lists open offers (new tab in the trader
  panel or the ledger). `{t:'mkt_take', id, by}` → **the Durable Object
  settles it server-side**: atomically removes the offer, appends the
  escrowed `give` as a gift to the taker and the taker's `want` as a
  gift to the poster. The DO's serialized message handling makes
  double-takes impossible — this is deliberately our first piece of
  real server logic (a soft step toward Phase 3).
- **Cancel**: poster reclaims escrow as a gift-to-self.
- Wants are validated client-side on take (deduct before sending), same
  clamp rules as trade.
- Board capped at 30 open offers per room, 7-day expiry back to poster.

## M4 — Playing together (1 session)

- **Co-op raids** (the deferred `ent` frames): the raid owner simulates
  goblins and broadcasts render-state at 10Hz; other players' E-strikes
  send `{t:'hit', gid}` damage events back to the owner; loot to the
  killer. Watchtowers of *any* player in range pelt shared goblins.
- **Feast at the Plaza**: a wonder-pattern co-op event — any player can
  pledge food at a plaza (`{t:'feast', items}` accumulating in room
  storage); when the pot reaches N×players, everyone online gets a
  1-day +10% speed / +10% XP "Well Fed Together" buff and fireworks.
  Rewards towns that build near each other without punishing loners.
- **Company warmth** (tiny freebie): standing within 4 tiles of another
  live player gives +5% walk speed and a subtle sparkle — proximity
  should simply feel good.

## Protocol additions (all rooms, all JSON)

| Frame | Stored? | Purpose |
|---|---|---|
| `wave` | no | targeted emote |
| `toffer/taccept/tdone/tcancel` | no | direct trade handshake |
| `mkt_post/mkt_take/mkt_cancel` | yes (DO settles) | trade board escrow |
| `ent/hit` | no | co-op raid entities |
| `feast` | yes | plaza feast pot |

Presence gains a compact `profile:{tier,ach,flame}` field.

## Order & estimates

1. M1 settler popup + wave — ½ session, unlocks everything else's UI.
2. M2 direct trade — 1 session.
3. M3 market board — 1 session (includes the first server-side logic).
4. M4 co-op raids + feast + warmth — 1 session.

Total ≈ 3½ sessions. Each milestone ships and is useful alone; stop
anywhere and the game is still better than before.
