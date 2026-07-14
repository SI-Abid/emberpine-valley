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
  if (!room) { room = { clients: new Set(), state: { bld: {}, removed: {}, chat: [], gifts: [] } }; rooms.set(id, room); }
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
      default: return;
    }
    for (const c of room.clients) if (c !== ws && c.readyState === 1) c.send(raw);
  });
  ws.on('close', () => room.clients.delete(ws));
});
console.log('emberpine relay listening on :' + PORT);
