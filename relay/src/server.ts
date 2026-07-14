import type * as Party from "partykit/server";

// Emberpine Valley realtime relay — one room per island (room id = SEED_STR,
// e.g. "EMBERPINE-1"). Clients connect with a plain WebSocket to
//   wss://<project>.<user>.partykit.dev/party/<room>
// Protocol (JSON, one object per frame):
//   → {t:'pos',  p:{id,name,x,y,score,won,emote}}   relayed, not stored (~10Hz)
//   → {t:'bld',  k, e}                              per-tile entry or {rm} tombstone; stored
//   → {t:'rmres',k, at}                             resource removal; stored
//   → {t:'chat', msg:{id,pid,name,m,t}}             stored (ring of 50)
//   → {t:'gift', g:{id,to,from,items,t}}            stored until claimed
//   → {t:'giftclaim', id}                           removes a delivered gift
//   ← {t:'snap', snapshot:{bld,removed,chat,gifts}} sent once on connect

export default class Emberpine implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    const snapshot = {
      bld:     (await this.room.storage.get("bld"))     ?? {},
      removed: (await this.room.storage.get("removed")) ?? {},
      chat:    (await this.room.storage.get("chat"))    ?? [],
      gifts:   (await this.room.storage.get("gifts"))   ?? [],
      mkt:     (await this.room.storage.get("mkt"))     ?? [],
    };
    conn.send(JSON.stringify({ t: "snap", snapshot }));
  }

  async onMessage(raw: string | ArrayBuffer, sender: Party.Connection) {
    if (typeof raw !== "string" || raw.length > 4096) return;
    let m: any; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case "pos":
        this.room.broadcast(raw, [sender.id]);
        return;
      case "bld": {
        if (typeof m.k !== "string" || !m.e) return;
        const bld = ((await this.room.storage.get("bld")) as any) ?? {};
        bld[m.k] = m.e;
        await this.room.storage.put("bld", bld);
        break;
      }
      case "rmres": {
        if (typeof m.k !== "string") return;
        const rm = ((await this.room.storage.get("removed")) as any) ?? {};
        rm[m.k] = m.at;
        await this.room.storage.put("removed", rm);
        break;
      }
      case "chat": {
        if (!m.msg || typeof m.msg.m !== "string") return;
        const chat = ((await this.room.storage.get("chat")) as any[]) ?? [];
        chat.push(m.msg); while (chat.length > 50) chat.shift();
        await this.room.storage.put("chat", chat);
        break;
      }
      case "gift": {
        if (!m.g || !m.g.id) return;
        const gifts = ((await this.room.storage.get("gifts")) as any[]) ?? [];
        gifts.push(m.g);
        await this.room.storage.put("gifts", gifts.slice(-100));
        break;
      }
      case "giftclaim": {
        const gifts = ((await this.room.storage.get("gifts")) as any[]) ?? [];
        await this.room.storage.put("gifts", gifts.filter((g) => g.id !== m.id));
        return; // no broadcast needed
      }
      // --- market board: settled here, atomically (room messages are serialized) ---
      case "mkt_post": {
        const o = m.o;
        if (!o || !o.id || !o.by || !o.give) return;
        const mkt = ((await this.room.storage.get("mkt")) as any[]) ?? [];
        if (mkt.length >= 30 || mkt.some((x: any) => x.id === o.id)) return;
        mkt.push(o);
        await this.room.storage.put("mkt", mkt);
        break;
      }
      case "mkt_take": {
        const mkt = ((await this.room.storage.get("mkt")) as any[]) ?? [];
        const i = mkt.findIndex((x: any) => x.id === m.id);
        if (i < 0) return;
        const o = mkt[i];
        if (o.by === m.by) return;
        mkt.splice(i, 1);
        await this.room.storage.put("mkt", mkt);
        const gifts = ((await this.room.storage.get("gifts")) as any[]) ?? [];
        const g1 = { id: "mg" + o.id, to: m.by, from: (o.byName || "A settler") + "’s stall", items: o.give, t: Date.now() };
        gifts.push(g1);
        let g2: any = null;
        if (o.want && Object.keys(o.want).length) {
          g2 = { id: "mp" + o.id, to: o.by, from: (m.byName || "A settler") + " (market)", items: o.want, t: Date.now() };
          gifts.push(g2);
        }
        await this.room.storage.put("gifts", gifts.slice(-100));
        this.room.broadcast(JSON.stringify({ t: "mkt_take", id: o.id, by: m.by }));
        this.room.broadcast(JSON.stringify({ t: "gift", g: g1 }));
        if (g2) this.room.broadcast(JSON.stringify({ t: "gift", g: g2 }));
        return;
      }
      case "mkt_cancel": {
        const mkt = ((await this.room.storage.get("mkt")) as any[]) ?? [];
        const i = mkt.findIndex((x: any) => x.id === m.id && x.by === m.by);
        if (i < 0) return;
        const o = mkt[i];
        mkt.splice(i, 1);
        await this.room.storage.put("mkt", mkt);
        const gifts = ((await this.room.storage.get("gifts")) as any[]) ?? [];
        const g1 = { id: "mc" + o.id, to: o.by, from: "Your market stall", items: o.give, t: Date.now() };
        gifts.push(g1);
        await this.room.storage.put("gifts", gifts.slice(-100));
        this.room.broadcast(JSON.stringify({ t: "mkt_cancel", id: o.id }));
        this.room.broadcast(JSON.stringify({ t: "gift", g: g1 }));
        return;
      }
      default:
        // ephemeral frames (wave, trade handshake, future features): relay, don't store
        this.room.broadcast(raw, [sender.id]);
        return;
    }
    this.room.broadcast(raw, [sender.id]);
  }
}
