// Emberpine Valley relay — native Cloudflare Worker + Durable Object.
// Same protocol as ../src/server.ts (PartyKit) and ../local.mjs.
// One Durable Object per island room; connect a plain WebSocket to
//   wss://emberpine-relay.<your-subdomain>.workers.dev/party/<room>

export interface Env {
  ROOMS: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const m = new URL(req.url).pathname.match(/^\/party\/([^/]+)/);
    if (!m) return new Response("emberpine relay: connect to /party/<room>", { status: 200 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(decodeURIComponent(m[1])));
    return room.fetch(req);
  },
};

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
