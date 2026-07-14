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
      default:
        // ephemeral frames (wave, trade handshake, future features): relay, don't store
        this.room.broadcast(raw, [sender.id]);
        return;
    }
    this.room.broadcast(raw, [sender.id]);
  }
}
