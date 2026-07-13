# Emberpine Valley — Multiplayer Plan

## 1. Where multiplayer stands today (audit)

The game already has an async "shared valley" layer, built on `store.get/set`
polling every 5 seconds:

| System | Key | What syncs |
|---|---|---|
| `syncPresence` | `presence` | name, position, score, won-flag, emote (5s samples) |
| `syncWorld` | `worldops` | resource removals (op log, 150s TTL) — gathering is genuinely shared |
| `syncChat` | chat keys | campfire messages |
| `syncWonder` | `wonder` | co-op Valley Wonder contributions |
| `syncRelics` | `relics` | relic claim races |

**Not synced:** buildings, villagers, goblins/raids, animals, trader visits,
weather. Each player sees only their own town on a shared map.

**The transport caveat:** `store` prefers `window.storage` (a shared KV that
exists only on hosts that inject it) and falls back to `localStorage`, which
is per-browser. On a static host (GitHub Pages), cross-device multiplayer is
effectively OFF today — but **two tabs of the same browser DO share
localStorage**, which makes Phase 1 fully testable (and locally playable)
with zero infrastructure.

**Two big assets we already have:**
- Terrain and resources are seeded (`EMBERPINE-<island>`), so every client
  already renders an identical world — no map sync needed, ever.
- The day/season clock derives from wall-clock time, so all players are
  already in the same season and time of day.

## 2. Design goals

Cozy co-op, not competitive RTS:
- See each other walk, build, and light up the same valley.
- Help each other: gifts, shared defense, the existing co-op Wonder.
- Gentle rivalry via the existing ledger, not resource-war griefing.
- Keep the single-file, no-login, click-and-play feel. No accounts.

Non-goals: server-authoritative physics, perfect anti-cheat, >8 players per
island.

## 3. Phase 1 — Complete the shared world on the current transport
*(no new infrastructure; one dev session; testable in two tabs)*

1. **Building sync** — the biggest visible win. Mirror the `worldops`
   pattern with an append-only `bldops` log:
   `{id, t, k, kind:'add'|'rm', type, owner, ownerName, sv}`.
   Merge into `S.buildings` with `mine:owner===S.me.id`; the dormant
   white-wash rendering for `!b.mine` buildings already exists. Others'
   paths speed everyone up and others' torches light everyone's night —
   instant co-op texture. Demolition stays owner-only (already enforced).
2. **Conflict rule** — same-tile build race: lowest `(t, id)` wins
   deterministically on merge; the loser's client detects the loss on next
   poll and refunds materials with a toast.
3. **Deterministic ambience (free "sync")** — derive weather, trader
   schedule, and herd migrations from `hash(floor(now()/period), SEED)`
   instead of `Math.random()`. All players then share rain, the same trader
   window, and the same herd arrivals with zero bytes of transport.
4. **Presence interpolation** — lerp ghost players between 5s samples with
   walk animation and facing, instead of teleporting dots.
5. **Gifting** — a `gifts` key: leave a bundle addressed to a player name;
   they collect at the Hall on next poll. Async-friendly co-op that works
   even when friends aren't online simultaneously.
6. **Op-append hygiene** — today several keys are read-modify-write JSON
   blobs (two simultaneous writers can drop an update). Move shared
   mutations to id'd op-appends with idempotent merge; accept rare races on
   presence (cosmetic).

**Limits accepted:** ~5s latency. Fine for building/gifting/chat; not for
combat. That's Phase 2.

## 4. Phase 2 — Real-time rooms
*(one small WebSocket relay; 2–3 dev sessions)*

- **Transport:** one room per island. Ranked options:
  1. **Cloudflare Durable Objects / PartyKit** *(recommended)* — rooms map
     1:1 to islands, per-room persistent storage replaces the KV blobs,
     free tier covers a cozy game's traffic, and the game stays a static
     file.
  2. Plain Node `ws` on a VPS — simple but adds ops burden.
  3. Supabase Realtime — brings auth/persistence but a heavy SDK for a
     single-file game.
- **Integration seam:** keep the `store.*`/`sync*` function signatures and
  swap their implementation to the socket; the polling path remains as the
  offline/fallback mode. Game logic barely changes.
- **Protocol:** client sends position at ~10Hz plus ops; server broadcasts
  deltas; new joiners get a room snapshot (buildings, removals, wonder,
  chat ring) then stream deltas.
- **Owner-authoritative entities** — the key trick that preserves the
  existing single-file simulation: every dynamic entity (villager, goblin,
  animal) is simulated by exactly one client (its owner) and broadcast as
  render-state. Nobody else runs its AI.
- **Co-op raids:** the raid owner simulates goblins and broadcasts them;
  any player's hits are sent as damage events to the owner; loot goes to
  whoever lands the kill. Friends can genuinely run over and help.

## 5. Phase 3 — Identity, persistence, scale (optional, later)

- Frictionless identity: server-issued anonymous token on first join, name
  reservation per room. Still no login.
- Shared island state persists server-side (already natural in DO storage);
  personal saves stay local, plus an export/import save-string for backup.
- Light validation only where it's shared-visible: rate limits, tile
  bounds, build-cost sanity. Don't chase perfect authority in a cozy game.
- Scale: cap ~8 players per island room; spawn shard rooms
  (`island-N#k`) when full; global ledger via a small KV rollup.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Blob write races on the KV transport | Phase 1 op-append + idempotent merge; true fix arrives with Phase 2 rooms |
| Clock skew between clients | Timestamps only order ops in Phase 1 (skew-tolerant); server time in Phase 2 |
| Griefing | Already blocked: can't demolish others' buildings; land-claim radius around another player's Hall cluster can be added if needed |
| Villager/goblin divergence | Never shared-simulated: owner-authoritative from day one |
| WS blocked by host CSP | Host the game on Pages/own domain for Phase 2 |

## 7. Recommended order

1. **Phase 1** now — one session, zero infra, immediately playable in two
   tabs and on any `window.storage` host. Building sync + deterministic
   weather/trader alone transform the feel.
2. **Phase 2** when Phase 1 feels good — PartyKit/DO relay, live movement,
   co-op raids.
3. **Phase 3** only if the game finds an audience that needs it.
