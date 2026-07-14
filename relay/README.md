# Emberpine Valley relay (multiplayer Phase 2)

One WebSocket room per island. The game connects with a raw WebSocket to
`<host>/party/<SEED_STR>` and falls back to the polled shared-store when no
relay is configured or reachable.

## Local play / development

```bash
cd relay
npm install
npm run local          # plain-Node relay on ws://localhost:1999
```

Open the game with `?ws=ws://localhost:1999` (or run
`localStorage.setItem('emberpine:ws','ws://localhost:1999')` once in the
console). Two browsers on one machine now share the valley in real time.

## Production (PartyKit / Cloudflare)

```bash
cd relay
npm install
npm run dev            # PartyKit dev server (same protocol)
npm run deploy         # → wss://emberpine-relay.<your-username>.partykit.dev
```

Then set the default host in `index.html` (`NET.host` fallback) or hand
players a `?ws=wss://...` link. Note: a page served over https needs `wss://`.

## Protocol

JSON frames; see `src/server.ts` header. `pos` is relay-only (~10Hz);
`bld` / `rmres` / `chat` / `gift` persist in room storage so late joiners get
everything via the `snap` frame sent on connect.

Not yet wired (next iteration): shared Wonder/relics over WS (still fine via
the polled store), co-op raid entities (`ent` frames).
