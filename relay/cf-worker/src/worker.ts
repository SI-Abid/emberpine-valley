// Emberpine Valley relay — native Cloudflare Worker + Durable Object.
// Same protocol as ../src/server.ts (PartyKit) and ../local.mjs.
// One Durable Object per island room; connect a plain WebSocket to
//   wss://emberpine-relay.<your-subdomain>.workers.dev/party/<room>

export interface Env {
  ROOMS: DurableObjectNamespace;
  DB?: D1Database;               // player accounts (optional — relay works without it)
  RECOVERY_PEPPER?: string;
  TOKEN_SECRET?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/account/")) return account(req, path, env);
    const m = path.match(/^\/party\/([^/]+)/);
    if (!m) return new Response("emberpine relay: connect to /party/<room>", { status: 200 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(decodeURIComponent(m[1])));
    return room.fetch(req);
  },
};

// ============ player accounts (cross-device saves, recovery-code identity) ============
// POST /account/create {name?}                    → {id, code, token}   code shown ONCE, never stored plaintext
// POST /account/login  {code}                     → {id, token, save, legacy, updated_at}
// GET  /account/sync   (Authorization: Bearer t)  → {id, save, legacy, updated_at}
// POST /account/sync   {save, legacy, baseUpdatedAt} → {updated_at, conflict}   last-write-wins

// 256 unambiguous words → 5 words = 40 bits of entropy
const WORDS = ("acorn amber apple aspen badger barley barn basil beach bean bear beaver berry birch bloom boat bread breeze brick brook cabin camp candle canoe cedar cherry chest chick cider clay cliff cloud clover coal cocoa comet coral cork corn cotton cove crab creek crow crumb daisy dawn deer dew dill dock dove drift drum duck dune dusk eagle earth ember fable falcon fawn fern field fig finch fire fish flake flame flax fleece flint foam fog forest fox frost garden garnet ginger glade glen gold goose gourd grain grape grass grove gull hare hawk hay hazel heron hill hive holly home honey hoof hook horn house ice inlet iris iron island ivy jade jam jar kale kelp kettle kiln kite lagoon lake lamb larch lark lava leaf lemon lily lime linen loaf log loom lotus lunar mango maple marsh meadow melon mill mint mist moon moose moss moth mouse mud mule nest nettle newt night north nut oak oat ocean olive onion opal otter owl ox pail palm pansy peach pear pearl peat pebble pecan penny peony pepper perch pig pine plum pond pony poppy porch quail quartz quill quilt rabbit rain raven reed reef ridge river robin rock root rose rowan rust rye saddle sage sail salt sand sap seal seed shell shore silver sky sled sleet slope snail snow soil spice spring spruce squash star stone storm straw stream summer sun swan thyme tide timber toad torch trail tree trout tulip turnip twig valley vine violet wagon walnut water wave wheat willow wind winter wolf wool wren yarn yew zinnia").split(" ").slice(0, 256);

const enc = new TextEncoder();
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const b64u = (b: ArrayBuffer) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s: string) => b64u(enc.encode(s).buffer as ArrayBuffer);
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fromB64u = (s: string) => fromB64(s.replace(/-/g, "+").replace(/_/g, "/"));

function genCode(): string {
  const r = new Uint8Array(5); crypto.getRandomValues(r);
  return Array.from(r, (n) => WORDS[n].toUpperCase()).join("-");
}
const normCode = (c: string) => (c || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).join("-");

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function pbkdf2(code: string, saltB64: string): Promise<string> {
  // 25k iterations: measured ~4ms, safely inside the Workers free-tier 10ms CPU budget.
  // The codes carry ~40 bits of true random entropy (they're generated, not human-chosen),
  // so the KDF is defense-in-depth, not the primary strength.
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: 25000 }, key, 256);
  return b64(bits);
}
async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(id: string, secret: string): Promise<string> {
  const payload = b64uStr(JSON.stringify({ id, iat: Date.now() }));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return payload + "." + b64u(sig);
}
async function readToken(req: Request, secret: string): Promise<string | null> {
  const h = req.headers.get("Authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t) return null;
  const [payload, sig] = t.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64u(sig), enc.encode(payload));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    if (!p.id || Date.now() - (p.iat || 0) > 400 * 86400000) return null;   // ~13-month life
    return p.id as string;
  } catch { return null; }
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};
const j = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...CORS } });

async function account(req: Request, path: string, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!env.DB || !env.RECOVERY_PEPPER || !env.TOKEN_SECRET)
    return j({ error: "accounts not configured on this relay" }, 503);

  const body = async () => {
    const t = await req.text();
    if (t.length > 262144) throw new Error("too large");   // 256KB save-blob cap, well under D1's 2MB row limit
    return t ? JSON.parse(t) : {};
  };

  try {
    if (path === "/account/create" && req.method === "POST") {
      const b = await body();
      const code = genCode();
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
      const id = "acct_" + b64u(crypto.getRandomValues(new Uint8Array(12)).buffer as ArrayBuffer);
      const ts = Date.now();
      await env.DB.prepare(
        "INSERT INTO players (id, code_lookup, code_hash, code_salt, name, save_v, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)")
        .bind(id, await sha256Hex(env.RECOVERY_PEPPER + normCode(code)), await pbkdf2(normCode(code), salt), salt,
              typeof b.name === "string" ? b.name.slice(0, 32) : null, ts, ts).run();
      return j({ id, code, token: await makeToken(id, env.TOKEN_SECRET), updated_at: ts });
    }

    if (path === "/account/login" && req.method === "POST") {
      const b = await body();
      const code = normCode(b.code);
      if (!code) return j({ error: "invalid code" }, 404);
      const row = await env.DB.prepare("SELECT * FROM players WHERE code_lookup=?")
        .bind(await sha256Hex(env.RECOVERY_PEPPER + code)).first<any>();
      if (!row || (await pbkdf2(code, row.code_salt)) !== row.code_hash) return j({ error: "invalid code" }, 404);
      return j({ id: row.id, token: await makeToken(row.id, env.TOKEN_SECRET),
                 save: row.save_json ? JSON.parse(row.save_json) : null,
                 legacy: row.legacy_json ? JSON.parse(row.legacy_json) : null,
                 updated_at: row.updated_at });
    }

    if (path === "/account/sync") {
      const id = await readToken(req, env.TOKEN_SECRET);
      if (!id) return j({ error: "unauthorized" }, 401);
      if (req.method === "GET") {
        const row = await env.DB.prepare("SELECT save_json, legacy_json, updated_at FROM players WHERE id=?")
          .bind(id).first<any>();
        if (!row) return j({ error: "unknown account" }, 404);
        return j({ id, save: row.save_json ? JSON.parse(row.save_json) : null,
                   legacy: row.legacy_json ? JSON.parse(row.legacy_json) : null, updated_at: row.updated_at });
      }
      if (req.method === "POST") {
        const b = await body();
        const row = await env.DB.prepare("SELECT updated_at, save_json IS NOT NULL AS has_save FROM players WHERE id=?").bind(id).first<any>();
        if (!row) return j({ error: "unknown account" }, 404);
        // a conflict needs a real save that moved under us — the row's own creation timestamp doesn't count
        const conflict = !!row.has_save && typeof b.baseUpdatedAt === "number" && row.updated_at > b.baseUpdatedAt;
        const ts = Date.now();
        await env.DB.prepare(
          "UPDATE players SET save_json=COALESCE(?,save_json), legacy_json=COALESCE(?,legacy_json), name=COALESCE(?,name), updated_at=? WHERE id=?")
          .bind(b.save !== undefined && b.save !== null ? JSON.stringify(b.save) : null,
                b.legacy !== undefined && b.legacy !== null ? JSON.stringify(b.legacy) : null,
                b.save && typeof b.save.name === "string" ? b.save.name.slice(0, 32) : null, ts, id).run();
        return j({ updated_at: ts, conflict });
      }
    }
    return j({ error: "not found" }, 404);
  } catch (e: any) {
    return j({ error: e && e.message === "too large" ? "save too large" : "bad request" }, 400);
  }
}

export class EmberpineRoom {
  constructor(private state: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server);               // hibernation-friendly
    const snapshot = {
      bld:     (await this.state.storage.get("bld"))     ?? {},
      removed: (await this.state.storage.get("removed")) ?? {},
      chat:    (await this.state.storage.get("chat"))    ?? [],
      gifts:   (await this.state.storage.get("gifts"))   ?? [],
      mkt:     (await this.state.storage.get("mkt"))     ?? [],
      feast:   (await this.state.storage.get("feast"))   ?? { pot: 0, until: 0 },
    };
    server.send(JSON.stringify({ t: "snap", snapshot }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 4096) return;
    let m: any; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case "pos":
        this.broadcast(raw, ws);
        return;
      case "bld": {
        if (typeof m.k !== "string" || !m.e) return;
        const bld = ((await this.state.storage.get("bld")) as any) ?? {};
        bld[m.k] = m.e;
        await this.state.storage.put("bld", bld);
        break;
      }
      case "rmres": {
        if (typeof m.k !== "string") return;
        const rm = ((await this.state.storage.get("removed")) as any) ?? {};
        rm[m.k] = m.at;
        await this.state.storage.put("removed", rm);
        break;
      }
      case "chat": {
        if (!m.msg || typeof m.msg.m !== "string") return;
        const chat = ((await this.state.storage.get("chat")) as any[]) ?? [];
        chat.push(m.msg); while (chat.length > 50) chat.shift();
        await this.state.storage.put("chat", chat);
        break;
      }
      case "gift": {
        if (!m.g || !m.g.id) return;
        const gifts = ((await this.state.storage.get("gifts")) as any[]) ?? [];
        gifts.push(m.g);
        await this.state.storage.put("gifts", gifts.slice(-100));
        break;
      }
      case "giftclaim": {
        const gifts = ((await this.state.storage.get("gifts")) as any[]) ?? [];
        await this.state.storage.put("gifts", gifts.filter((g: any) => g.id !== m.id));
        return;
      }
      case "feast": {
        const f = ((await this.state.storage.get("feast")) as any) ?? { pot: 0, until: 0 };
        if (f.until > Date.now()) return;
        f.pot = (f.pot || 0) + (typeof m.n === "number" ? Math.max(0, Math.min(20, m.n)) : 0);
        if (f.pot >= 30) {
          f.pot = 0; f.until = Date.now() + 86400000;
          await this.state.storage.put("feast", f);
          this.broadcast(JSON.stringify({ t: "feast_on", until: f.until }));
        } else {
          await this.state.storage.put("feast", f);
          this.broadcast(JSON.stringify({ t: "feast_pot", pot: f.pot, byName: m.byName }));
        }
        return;
      }
      // --- market board: the DO settles atomically (messages are serialized) ---
      case "mkt_post": {
        const o = m.o;
        if (!o || !o.id || !o.by || !o.give) return;
        const mkt = ((await this.state.storage.get("mkt")) as any[]) ?? [];
        if (mkt.length >= 30 || mkt.some((x) => x.id === o.id)) return;
        mkt.push(o);
        await this.state.storage.put("mkt", mkt);
        break;                                   // broadcast the post
      }
      case "mkt_take": {
        const mkt = ((await this.state.storage.get("mkt")) as any[]) ?? [];
        const i = mkt.findIndex((x) => x.id === m.id);
        if (i < 0) return;                       // already taken/cancelled
        const o = mkt[i];
        if (o.by === m.by) return;               // can't take your own
        mkt.splice(i, 1);
        await this.state.storage.put("mkt", mkt);
        const gifts = ((await this.state.storage.get("gifts")) as any[]) ?? [];
        const g1 = { id: "mg" + o.id, to: m.by, from: (o.byName || "A settler") + "’s stall", items: o.give, t: Date.now() };
        gifts.push(g1);
        let g2: any = null;
        if (o.want && Object.keys(o.want).length) {
          g2 = { id: "mp" + o.id, to: o.by, from: (m.byName || "A settler") + " (market)", items: o.want, t: Date.now() };
          gifts.push(g2);
        }
        await this.state.storage.put("gifts", gifts.slice(-100));
        this.broadcast(JSON.stringify({ t: "mkt_take", id: o.id, by: m.by }));           // everyone drops it from the board
        this.broadcast(JSON.stringify({ t: "gift", g: g1 }));
        if (g2) this.broadcast(JSON.stringify({ t: "gift", g: g2 }));
        return;
      }
      case "mkt_cancel": {
        const mkt = ((await this.state.storage.get("mkt")) as any[]) ?? [];
        const i = mkt.findIndex((x) => x.id === m.id && x.by === m.by);
        if (i < 0) return;
        const o = mkt[i];
        mkt.splice(i, 1);
        await this.state.storage.put("mkt", mkt);
        const gifts = ((await this.state.storage.get("gifts")) as any[]) ?? [];
        const g1 = { id: "mc" + o.id, to: o.by, from: "Your market stall", items: o.give, t: Date.now() };
        gifts.push(g1);
        await this.state.storage.put("gifts", gifts.slice(-100));
        this.broadcast(JSON.stringify({ t: "mkt_cancel", id: o.id }));
        this.broadcast(JSON.stringify({ t: "gift", g: g1 }));
        return;
      }
      default:
        // unknown/ephemeral frames (wave, trade handshake, future features):
        // relay without storing, so client updates don't require redeploys
        this.broadcast(raw, ws);
        return;
    }
    this.broadcast(raw, ws);
  }

  broadcast(raw: string, except?: WebSocket) {
    for (const c of this.state.getWebSockets())
      if (c !== except) { try { c.send(raw); } catch {} }
  }

  async webSocketClose() {}
  async webSocketError() {}
}
