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
      default:
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
