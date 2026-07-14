// Dependency-light local/dev relay speaking the exact same protocol as the
// PartyKit server (src/server.ts). Also fine on any small VPS.
//   npm i ws && node local.mjs        → ws://localhost:1999/party/<room>
// Point the game at it with  ?ws=ws://localhost:1999
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 1999;
const rooms = new Map(); // id → {clients:Set<ws>, state:{bld,removed,chat,gifts}}

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws, req) => {
  const m = (req.url || '').match(/\/party\/([^/?]+)/);
  const id = m ? decodeURIComponent(m[1]) : 'lobby';
  let room = rooms.get(id);
  if (!room) { room = { clients: new Set(), state: { bld: {}, removed: {}, chat: [], gifts: [], mkt: [], feast: { pot: 0, until: 0 } } }; rooms.set(id, room); }
  room.clients.add(ws);
  ws.send(JSON.stringify({ t: 'snap', snapshot: room.state }));

  ws.on('message', (data) => {
    const raw = data.toString();
    if (raw.length > 4096) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const st = room.state;
    switch (msg.t) {
      case 'pos': break;                                                    // relay only
      case 'bld':   if (typeof msg.k === 'string' && msg.e) st.bld[msg.k] = msg.e; else return; break;
      case 'rmres': if (typeof msg.k === 'string') st.removed[msg.k] = msg.at; else return; break;
      case 'chat':  if (msg.msg && typeof msg.msg.m === 'string') { st.chat.push(msg.msg); while (st.chat.length > 50) st.chat.shift(); } else return; break;
      case 'gift':  if (msg.g && msg.g.id) { st.gifts.push(msg.g); st.gifts = st.gifts.slice(-100); } else return; break;
      case 'giftclaim': st.gifts = st.gifts.filter((g) => g.id !== msg.id); return;
      case 'feast': {
        const f = st.feast;
        if (f.until > Date.now()) return;
        f.pot = (f.pot || 0) + (typeof msg.n === 'number' ? Math.max(0, Math.min(20, msg.n)) : 0);
        const send = (obj) => { const s = JSON.stringify(obj); for (const c of room.clients) if (c.readyState === 1) c.send(s); };
        if (f.pot >= 30) { f.pot = 0; f.until = Date.now() + 86400000; send({ t: 'feast_on', until: f.until }); }
        else send({ t: 'feast_pot', pot: f.pot, byName: msg.byName });
        return;
      }
      case 'mkt_post': {
        const o = msg.o;
        if (!o || !o.id || !o.by || !o.give || st.mkt.length >= 30 || st.mkt.some((x) => x.id === o.id)) return;
        st.mkt.push(o); break;
      }
      case 'mkt_take': {
        const i = st.mkt.findIndex((x) => x.id === msg.id);
        if (i < 0) return;
        const o = st.mkt[i];
        if (o.by === msg.by) return;
        st.mkt.splice(i, 1);
        const g1 = { id: 'mg' + o.id, to: msg.by, from: (o.byName || 'A settler') + '’s stall', items: o.give, t: Date.now() };
        st.gifts.push(g1);
        let g2 = null;
        if (o.want && Object.keys(o.want).length) { g2 = { id: 'mp' + o.id, to: o.by, from: (msg.byName || 'A settler') + ' (market)', items: o.want, t: Date.now() }; st.gifts.push(g2); }
        st.gifts = st.gifts.slice(-100);
        const send = (obj) => { const s = JSON.stringify(obj); for (const c of room.clients) if (c.readyState === 1) c.send(s); };
        send({ t: 'mkt_take', id: o.id, by: msg.by }); send({ t: 'gift', g: g1 }); if (g2) send({ t: 'gift', g: g2 });
        return;
      }
      case 'mkt_cancel': {
        const i = st.mkt.findIndex((x) => x.id === msg.id && x.by === msg.by);
        if (i < 0) return;
        const o = st.mkt[i]; st.mkt.splice(i, 1);
        const g1 = { id: 'mc' + o.id, to: o.by, from: 'Your market stall', items: o.give, t: Date.now() };
        st.gifts.push(g1); st.gifts = st.gifts.slice(-100);
        const send = (obj) => { const s = JSON.stringify(obj); for (const c of room.clients) if (c.readyState === 1) c.send(s); };
        send({ t: 'mkt_cancel', id: o.id }); send({ t: 'gift', g: g1 });
        return;
      }
      default: break;                                                       // ephemeral frames (wave, trades…): relay, don't store
    }
    for (const c of room.clients) if (c !== ws && c.readyState === 1) c.send(raw);
  });
  ws.on('close', () => room.clients.delete(ws));
});
console.log('emberpine relay listening on :' + PORT);
