# Emberpine Valley — Phase 2 Setup: Real-Time Rooms

Step-by-step guide to stand up the WebSocket relay from the multiplayer
plan and wire the game to it. Target: live movement + instant building
sync across devices, one room per island, game stays a static file.

## Prerequisites

- Node 18+
- A GitHub account (login for PartyKit / Cloudflare)
- The game hosted anywhere static (GitHub Pages is fine)

Effort: the relay is ~150 lines, the client seam ~200 lines. Two to
three sessions total, exactly as scoped in the plan.

## Step 1 — Create the relay project

PartyKit (Cloudflare-backed) gives one stateful "room" per island with
built-in storage — the least infrastructure that does the job.

```bash
mkdir emberpine-relay && cd emberpine-relay
npm create partykit@latest        # accept defaults, TypeScript
```

Replace `src/server.ts` with a room server shaped like this:

```ts
import type * as Party from "partykit/server";

// One room per island: room id = "EMBERPINE-1", "EMBERPINE-2", ...
export default class Emberpine implements Party.Server {
  constructor(readonly room: Party.Room) {}

  // late joiners get the whole shared state, then live deltas
  async onConnect(conn: Party.Connection) {
    const snapshot = {
      bld:      (await this.room.storage.get("bld"))      ?? {},
      removed:  (await this.room.storage.get("removed"))  ?? {},
      wonder:   (await this.room.storage.get("wonder"))   ?? null,
      relics:   (await this.room.storage.get("relics"))   ?? {},
      chat:     (await this.room.storage.get("chat"))     ?? [],
    };
    conn.send(JSON.stringify({ t: "snap", snapshot }));
  }

  async onMessage(raw: string, sender: Party.Connection) {
    const m = JSON.parse(raw);
    switch (m.t) {
      case "pos":      // {t:'pos', p:{id,name,x,y,score,emote}} at ~10Hz
        this.room.broadcast(raw, [sender.id]);        // relay only, not stored
        break;
      case "bld": {    // {t:'bld', k, e} — one tile entry or tombstone
        const bld = (await this.room.storage.get<any>("bld")) ?? {};
        bld[m.k] = m.e;
        await this.room.storage.put("bld", bld);
        this.room.broadcast(raw, [sender.id]);
        break;
      }
      case "rmres": {  // resource removal {t:'rmres', k, at}
        const rm = (await this.room.storage.get<any>("removed")) ?? {};
        rm[m.k] = m.at;
        await this.room.storage.put("removed", rm);
        this.room.broadcast(raw, [sender.id]);
        break;
      }
      case "chat": {   // ring buffer of 50
        const chat = (await this.room.storage.get<any[]>("chat")) ?? [];
        chat.push(m.msg); while (chat.length > 50) chat.shift();
        await this.room.storage.put("chat", chat);
        this.room.broadcast(raw, [sender.id]);
        break;
      }
      case "wonder": case "relic": case "gift":
        // same pattern: merge into storage, broadcast
        break;
      case "ent":      // owner-authoritative entity render-state (goblins during a raid)
        this.room.broadcast(raw, [sender.id]);        // relay only
        break;
    }
  }
}
```

## Step 2 — Run it locally

```bash
npx partykit dev                  # ws://127.0.0.1:1999
```

Rooms are addressed as
`ws://127.0.0.1:1999/party/EMBERPINE-1`.

## Step 3 — Add the network seam to the game

All multiplayer already flows through `store.*` + the `sync*` functions,
so the game needs one new object and a few taps:

1. **`NET` object** in `index.html`: connect to
   `WS_HOST + '/party/' + SEED_STR`, with:
   - `NET.ok` — connected flag
   - `NET.send(obj)` — JSON send
   - handlers: `snap` (seed local state), `pos` (update `S.others`),
     `bld` (feed the existing `syncBuildings` merge for one entry),
     `rmres`, `chat`, `gift`
   - exponential-backoff reconnect
2. **Host resolution** (in priority order):
   `?ws=` query param → `localStorage['emberpine:ws']` → the deployed
   default → none (offline mode).
3. **Tap the send sites** — each already exists as a single choke point:
   - position: a 10Hz timer sending `pos` when `NET.ok` (the 5s
     `syncPresence` becomes the fallback path)
   - `placeBuilding`/`demolishBuilding`/upgrade → already call
     `syncBldSoon()`; make that send `bld` entries over `NET` when
     connected instead of polling the KV
   - `markRemoved` → also `NET.send({t:'rmres',...})`
   - `sendChat`, `sendGift`, wonder contribution → same pattern
4. **Fallback rule:** every sync function keeps its polling body and
   short-circuits to the socket when `NET.ok`. Kill the relay and the
   game silently degrades to today's behavior — no error states.
5. **Ghost smoothing already done:** the Phase-1 interpolator handles
   10Hz just as happily as 5s samples (it just gets much prettier).

## Step 4 — Deploy the relay

```bash
npx partykit deploy               # login via GitHub on first run
# → wss://emberpine-relay.<your-username>.partykit.dev
```

Put that hostname into `WS_HOST` in `index.html`, commit, push.

## Step 5 — Host the game and lock origins

- Game on GitHub Pages (or any static host) — WebSockets connect out,
  so no server config is needed on the Pages side.
- In `partykit.json`, restrict allowed origins to your Pages domain so
  strangers can't piggyback the relay from other sites.

## Step 6 — Persistence & hygiene

- Room storage IS the shared island state — it survives restarts
  (PartyKit rooms hibernate; storage is durable).
- Add a compaction alarm (e.g. daily): drop resource-removal entries
  older than the regrowth window, trim chat, sweep tombstones older
  than 30 days.
- Keep personal saves local as today; add save export/import later
  (Phase 3).

## Step 7 — Test checklist

1. Two browsers on one machine, `?ws=ws://127.0.0.1:1999`: both see
   each other move at 10Hz, builds appear instantly.
2. Phone + desktop against the deployed `wss://` host.
3. Late join: open a third client after building — snapshot delivers
   the full town.
4. Kill the relay mid-session: game keeps running, falls back to
   polling (tabs on the same browser still sync); reconnects with
   backoff when the relay returns.
5. Raid co-op (owner-authoritative `ent` messages): second player sees
   the goblins and their hits land as damage events.

## Costs

- PartyKit hobby tier: free, fine for a cozy game's traffic.
- If you'd rather own it end-to-end: the same server ports to a
  Cloudflare Worker + Durable Object almost line-for-line
  (`wrangler init`, a `DurableObject` class with `webSocketMessage`,
  free tier includes SQLite-backed DO storage). PartyKit is just the
  faster path to the identical architecture.
