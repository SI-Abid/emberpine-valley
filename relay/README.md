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

## Production — Cloudflare Workers (recommended, free)

Deploys to YOUR free Cloudflare account (avoids the partykit.dev shared-zone
limit). One-time: create a free account at dash.cloudflare.com if you don't
have one.

```bash
cd relay/cf-worker
npm install
npx wrangler login     # browser opens — allow access
npm run deploy         # → https://emberpine-relay.<your-subdomain>.workers.dev
```

The game connects to `wss://emberpine-relay.<your-subdomain>.workers.dev`.

## Production — PartyKit (alternative)

Note: `partykit deploy` to the shared partykit.dev zone may fail with a
"custom domains limit" error — the free shared zone is full. It still works
against your own Cloudflare account with CLOUDFLARE_ACCOUNT_ID and
CLOUDFLARE_API_TOKEN set; otherwise use the cf-worker deploy above.

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

## Player accounts (cross-device saves) — cf-worker only

The Cloudflare Worker also serves HTTP account endpoints so a player's full
village follows them across devices via a recovery code (no email/passwords).
The WebSocket relay works fine without any of this — unconfigured deployments
just return 503 on `/account/*`.

One-time setup:

```bash
cd relay/cf-worker
npx wrangler d1 create emberpine-accounts   # paste database_id into wrangler.toml
npx wrangler d1 migrations apply emberpine-accounts --remote
npx wrangler secret put RECOVERY_PEPPER     # any long random string
npx wrangler secret put TOKEN_SECRET        # any long random string
npm run deploy
```

For local dev: copy `.dev.vars.example` to `.dev.vars`, then
`npx wrangler d1 migrations apply emberpine-accounts --local` and
`npx wrangler dev --local`.

Endpoints (JSON in/out, CORS-open):

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /account/create {name?}` | — | new account → `{id, code, token, updated_at}`; the 5-word recovery code is returned ONCE and never stored plaintext |
| `POST /account/login {code}` | — | reclaim an account on a new device → `{id, token, save, legacy, updated_at}` (generic 404 on a bad code) |
| `GET /account/sync` | Bearer token | pull the latest save |
| `POST /account/sync {save, legacy, baseUpdatedAt}` | Bearer token | push a save; last-write-wins, `conflict:true` if another device wrote since `baseUpdatedAt` |

Codes are stored as a peppered SHA-256 lookup plus a salted PBKDF2 hash;
session tokens are stateless HMAC (~13-month life). The recovery code is the
real credential — losing it means the account can't be reclaimed on new
devices (existing logged-in devices keep working).
