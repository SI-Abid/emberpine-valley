# Emberpine Valley v4 "Civilization" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Homes replace the Recruit button as the population engine; villagers sleep at their own house, eat a dawn meal, and the town levels Hamlet→Village→Town→City through civic buildings.

**Architecture:** Data-driven extension of the single-file game: home/civic entries in `BUILDS` (+`home:true,cap`), a pause-safe `S.spawnQ` drained in the main loop, a new `toHome` villager state, a `dawnMealTick` keyed on a persisted day index, and a `TOWN_TIERS`/`TIER` gate mirroring the existing monument `ERA` gate. All UI reuses existing chips/popups/quest machinery and v3 SVG icons.

**Tech Stack:** Vanilla JS in `index.html`; verification via `node --check` + Playwright on `python3 -m http.server 8901`.

## Global Constraints

- Single self-contained `index.html`; `emberpine-valley.html` byte-identical at the end (final task).
- Every new SVG icon: `viewBox="0 0 24 24"` + `xmlns="http://www.w3.org/2000/svg"` (mandatory — canvas data-URI decode fails without it), 2px `#2b2620` outline on the primary silhouette, flat fills, existing palette.
- NEVER deduct food via `gain()` — it inflates `S.stats.g` lifetime counters, changes score, and fires questTick per call. Mutate `S.inv[k]--` directly, then call `renderHUD()` yourself.
- NEVER use `setTimeout` for gameplay events (spawns) — timers ignore the pause gate. Queue + drain with dt inside `if(running&&!paused)`.
- Old saves must load with zero data loss: missing fields default (`home:null`, `hungry:false`, `town:{tier:0}`, `lastMeal:<current day index>`), villagers load homeless, tier recomputes upward with banners.
- `toast()` is textContent — plain text only.
- Do not touch: monument arc, Wonder, multiplayer sync, target claiming, pause system (only *read* `running`/`paused` via loop placement).
- Line numbers below reference commit 9972ac3; re-locate by searching the quoted code.
- Verification is in-browser (game blocks `file://`); pass splash via `document.getElementById('enterBtn').click()`; clear `localStorage` for fresh-boot tests; `darknessNow=()=>0` forces day, `darknessNow=()=>1` forces night.
- Commit after each task with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. No push until the final review gate (controller pushes).

---

### Task 1: Homes, population capacity, move-in & upgrade; Recruit removal

**Files:**
- Modify: `index.html` — `S` literal (~350), `BUILDS` (~380), `makeVillager` (~471), `placeBuilding` (~654), HUD chip (~992), roster DOM (~225) + `renderRoster` (~1037), `openBuildingPopup` (~1081), `renderBuildBar` (~1009), `loop()` (~1773), `saveGame`/`loadGame` (~1143), `boot`/`start` (~1736)

**Interfaces (later tasks rely on):**
- `BUILDS.cottage/house/manor` with `home:true, cap:1|2|3`
- `popCap()` → number · `homeless()` → villager[] · `moveIn(bKey)` · `spawnQueueTick(dt)`
- `NEXT_HOME = {cottage:'house', house:'manor'}` · `TIER = {house:1,manor:2,tavern:1,plaza:1,chapel:2,statue:2}` · `S.town = {tier:0}` (scaffold; full tier logic in Task 4)
- `v.home` = building key `"x,y"` | `'hall'` | `null` — persisted

- [ ] **Step 1: Data.** Add to `S` literal: `town:{tier:0}, spawnQ:[]`. Add to `BUILDS` (before `monument`):

```js
cottage:{name:'Cottage',ico:'🐱',cost:{plank:6,stone:2},desc:'A home for 1 settler — settlers move in when built',home:true,cap:1},
house:{name:'House',ico:'🏠',cost:{plank:12,stone:6,bread:4},desc:'A home for 2 settlers',home:true,cap:2},
manor:{name:'Manor',ico:'🏛',cost:{brick:20,glass:8,bread:6},desc:'A home for 3 settlers',home:true,cap:3},
```

Near `ERA` add: `const TIER={house:1,manor:2,tavern:1,plaza:1,chapel:2,statue:2};` and `const NEXT_HOME={cottage:'house',house:'manor'};` (tavern/plaza/chapel/statue entries land in Task 4 — the map is complete now so the lock logic never changes again).

- [ ] **Step 2: Helpers + queue** (insert near `countB`):

```js
function popCap(){let cap=2;for(const k in S.buildings){const b=S.buildings[k];if(b.mine&&BUILDS[b.type]&&BUILDS[b.type].home)cap+=BUILDS[b.type].cap}return cap}
function homeless(){return S.villagers.filter(v=>!v.home||(v.home!=='hall'&&!S.buildings[v.home]))}
function moveIn(bKey){
  const b=S.buildings[bKey];if(!b||!BUILDS[b.type].home)return;
  let free=BUILDS[b.type].cap - S.villagers.filter(v=>v.home===bKey).length;
  if(free<=0)return;
  const hs=homeless().sort((a,c)=>((a.x-b.x)**2+(a.y-b.y)**2)-((c.x-b.x)**2+(c.y-b.y)**2));
  for(const v of hs){if(free<=0)break;v.home=bKey;free--}
  for(let i=0;i<free;i++)S.spawnQ.push({home:bKey,in:2*(i+1)});
  renderRoster();
}
function spawnQueueTick(dt){
  if(!S.spawnQ.length)return;
  for(let i=S.spawnQ.length-1;i>=0;i--){
    const q=S.spawnQ[i];q.in-=dt;
    if(q.in<=0){
      S.spawnQ.splice(i,1);
      const b=S.buildings[q.home];if(!b)continue;
      const v=makeVillager();v.home=q.home;
      toast('👋 '+v.name+' joins the guild!');sfx('recruit');
      spawnBurst(b.x,b.y,'#ffe9b8',8);
      renderHUD();questTick();saveSoon();
    }
  }
}
```

Call `spawnQueueTick(dt);` in `loop()` directly after `for(const v of S.villagers)villagerTick(v,dt);`.

- [ ] **Step 3: makeVillager — `home:null` + Roman names.** Replace the name line and add the field:

```js
const ROMAN=['II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI'];
function makeVillager(){
  const r=hash2(vid*7+3,S.villagers.length,SEED^vid);
  const base=pick(VNAMES,r);
  const used=(S.stats.vnameUse=S.stats.vnameUse||{});
  const n=(used[base]=(used[base]||0)+1);
  const name=n===1?base:base+' '+ROMAN[Math.min(n-2,ROMAN.length-1)];
  const v={id:++vid,name,color:pick(VCOLORS,hash2(vid,4,SEED)),x:HALL.x+0.5+(vid%3)-1,y:HALL.y+3.5+((vid/3)|0)%2,
    job:'idle',state:'idle',path:[],target:null,carry:0,work:0,speed:2.2,hasTool:false,wander:0,xp:0,home:null};
  S.villagers.push(v);return v;
}
```

- [ ] **Step 4: placeBuilding hook.** After `S.buildings[key(x,y)]={type,x,y,mine:true};`, add: `if(B.home)moveIn(key(x,y));`

- [ ] **Step 5: Recruit removal + roster.** Delete: `<button id="recruitBtn">…</button>` from the DOM, the `#recruitBtn` CSS, `recruitCost()`, the `recruitBtn` onclick handler, and the 4 recruit lines at the end of `renderRoster()`. In the roster DOM add `<div id="popHint"></div>` where the button was; at the end of `renderRoster()`:

```js
document.getElementById('popHint').textContent='🏠 '+S.villagers.length+'/'+popCap()+' housed capacity — build homes to attract settlers';
```

Also mark homeless villagers in their roster row — in the row template, right after the `hasTool` emoji, add `+((!v.home||(v.home!=='hall'&&!S.buildings[v.home]))?' 🛌❓':'')` (title-less glyph is fine; Task 3 later adds the 🥺 marker beside it).

Style `#popHint` reusing the old `#recruitBtn` font styles (small, bold, padded — no button border).

- [ ] **Step 6: HUD chip.** Replace the villagers chip line in `renderHUD()`:

```js
+'<div class="hsep"></div><div class="res" title="Villagers / housing capacity">'+iconHTML('villagers','ico')+S.villagers.length+'/'+popCap()+'</div>'
```

- [ ] **Step 7: Home popup with Upgrade.** In `openBuildingPopup`, before the `popup.innerHTML=` line build `extra`, and wire the button after:

```js
let extra='';
if(B.home){
  const occ=S.villagers.filter(v=>v.home===key(b.x,b.y));
  extra='<div class="desc">🛌 '+(occ.length?occ.map(v=>v.name.split(' ')[0]).join(', '):'Empty — settlers arriving')+'</div>';
  const next=NEXT_HOME[b.type];
  if(next&&b.mine&&S.town.tier>=(TIER[next]||0)){
    extra+='<button id="upgradeBtn" class="wgive"'+(canAfford(BUILDS[next].cost)?'':' disabled')+'>Upgrade → '+BUILDS[next].name+' · '+costStr(BUILDS[next].cost)+'</button>';
  }
}
popup.innerHTML='<button class="close">✕</button><h4 class="px">'+iconHTML(b.type)+' '+B.name+'</h4><div class="sub">'+(b.mine?'YOUR WORKS':'ANOTHER SETTLER’S WORKS')+'</div><div class="desc">'+B.desc+'</div>'+extra;
popup.querySelector('.close').onclick=()=>popup.style.display='none';
const ub=popup.querySelector('#upgradeBtn');
if(ub)ub.onclick=()=>{
  const next=NEXT_HOME[b.type],NB=BUILDS[next];
  if(!canAfford(NB.cost))return;
  for(const[k,v]of Object.entries(NB.cost))S.inv[k]-=v;
  b.type=next;S.stats.b[next]=(S.stats.b[next]||0)+1;S.score+=15;
  sfx('build');spawnBurst(b.x,b.y,'#e8a33d',10);
  moveIn(key(b.x,b.y));renderHUD();renderBuildBar();questTick();saveSoon();
  openBuildingPopup(b,px,py);
};
```

(`v.home` stores the tile key, so the in-place `b.type` swap keeps occupants with zero migration. Upgrade charges full next-tier cost.)

- [ ] **Step 8: TIER lock in renderBuildBar.** Extend the lock branch to cover both gates:

```js
const B=BUILDS[t], eraReq=ERA[t]||0, eraLocked=cs<eraReq;
const tierReq=TIER[t]||0, tierLocked=S.town.tier<tierReq;
const TIER_NAMES=['Hamlet','Village','Town','City'];
if(eraLocked||tierLocked){
  btn.className='bbtn eralock';
  const lockName=eraLocked?MONUMENT_STAGES[eraReq].name:TIER_NAMES[tierReq];
  btn.innerHTML='<span class="bi">'+iconHTML(t)+'</span><span class="bn">'+B.name+'</span><span class="bc">🔒 '+lockName+'</span>';
  btn.title=eraLocked?('Unlocks when the '+lockName+' is complete'):('Unlocks when the town reaches '+lockName);
  btn.onclick=()=>toast(eraLocked?('🔒 Complete the '+lockName+' first'):('🔒 Reach '+lockName+' first'));
}else{ /* existing unlocked branch unchanged */ }
```

(Compute `cs` once before the loop as today. `TIER_NAMES` may live next to `TIER`; Task 4 replaces it with `TOWN_TIERS[i].tier` — keep the array literal for now, Task 4 swaps it.)

- [ ] **Step 9: Save/load + hall residents + reconcile.**
  - `saveGame` object: add `town:S.town,` and change the villagers map to `({name:v.name,color:v.color,job:v.job,hasTool:v.hasTool,xp:v.xp||0,home:v.home||null})`.
  - `loadGame`: after the quest line add `S.town=s.town||{tier:0};`; in the stats merge add `S.stats.vnameUse=s.stats.vnameUse||{};` (inside the `if(s.stats)`); in the villager loop add `v.home=vs.home||null;`; before `return true` add `for(const k in S.buildings)if(BUILDS[S.buildings[k].type]&&BUILDS[S.buildings[k].type].home&&S.buildings[k].mine)moveIn(k);` (reconciles legacy homeless into existing homes).
  - In `start()` where the first two villagers are created (`if(!had||S.villagers.length===0){makeVillager();makeVillager();…}`), set `.home='hall'` on both: `const a=makeVillager(),b2=makeVillager();a.home='hall';b2.home='hall';`
  - S.spawnQ is deliberately NOT persisted: on reload, unfilled slots are re-detected by `moveIn` during the load-reconcile pass above (a home with free cap and no homeless queues fresh spawns — add `moveIn`'s spawn-queue push ONLY when `free>0` remains, which the code already does).

- [ ] **Step 10: Verify in browser** (`node --check` first):
  - Fresh boot (`localStorage.clear()`): HUD shows `2/2`; build a cottage (`gain('plank',6);gain('stone',2)` + place via `placeBuilding('cottage',x,y)` on a passable tile) → within ~2s (game unpaused) a settler spawns with toast, HUD `3/3`, popup lists the occupant.
  - Pause immediately after placing a second cottage → wait 5 real seconds paused → no spawn while paused; resume → spawn fires.
  - Upgrade: set `S.town.tier=1`, `gain` house costs, open cottage popup → Upgrade button → type flips to house in place, occupant retained (same `v.home`), one new settler queued, cost deducted.
  - Recruit button gone; roster shows the housed-capacity hint; quest 4 (3 settlers) completes via cottages.
  - Save/reload: `v.home` round-trips; a manually-nulled home (`delete S.buildings[k]`) makes occupants homeless (in `homeless()` list).
- [ ] **Step 11: Commit** — `git add index.html && git commit -m "feat(v4): homes, population capacity, move-in queue, upgrade; remove recruit"`

---

### Task 2: Night rest at home (`toHome` state)

**Files:**
- Modify: `index.html` — `villagerTick` sleep branch (~486-495), roster status map (~1041)

**Interfaces:**
- Consumes: `v.home` (Task 1).
- Produces: `homeTarget(v)` → `{x,y}`; new villager state `'toHome'`.

- [ ] **Step 1: Resolver** (near `claimedRes`):

```js
function homeTarget(v){
  if(v.home==='hall')return HALL;
  if(v.home){const b=S.buildings[v.home];if(b)return b;v.home=null}
  return HALL;
}
```

- [ ] **Step 2: Replace the sleepy branch** (currently lines 486-495, all hall-bound) with:

```js
if(sleepy){
  const hp=homeTarget(v);
  if(v.state==='working'||v.state==='toWork'){v.work=0;const p=findPath(v.x,v.y,hp.x,hp.y,true);if(p){v.path=p;v.state='toHome'}else v.state='sleep';return}
  if(v.state==='toCrate'||v.state==='toPickup'){const p=findPath(v.x,v.y,hp.x,hp.y,true);if(p){v.path=p;v.state='toHome'}else v.state='sleep';return}
  if(v.state==='toHome'){
    if(Math.hypot(v.x-hp.x,v.y-hp.y)<=1.6){v.state='sleep';return}
    const p=findPath(v.x,v.y,hp.x,hp.y,true);
    if(p){v.path=p}else v.state='sleep';
    return;
  }
  if(v.state!=='sleep'){
    if(Math.hypot(v.x-hp.x,v.y-hp.y)>4.5){const p=findPath(v.x,v.y,hp.x,hp.y,true);if(p){v.path=p;v.state='toHome';return}}
    v.state='sleep';
    if(Math.random()<dt*.9)parts.push({x:v.x,y:v.y-.7,vx:.12,vy:-.3,life:1.5,max:1.5,color:'zzz',sz:1});
    return;
  }
  if(Math.random()<dt*.9)parts.push({x:v.x,y:v.y-.7,vx:.12,vy:-.3,life:1.5,max:1.5,color:'zzz',sz:1});
  return;
} else if(v.state==='sleep'||v.state==='toHome')v.state='idle';
```

Rationale (do not "simplify" back): the old code reused `toHall`, whose arrival branch delivers carried goods at the HALL — wrong building for homes, so `toHome` gets its own explicit arrival check. `toHall` remains untouched for hauling. The final `if(sleepy && state==='sleep')` zzz block keeps particles flowing every tick while asleep (the old code emitted them in the `state!=='toHall'` branch each tick; this preserves that).

- [ ] **Step 3: Roster label.** Add `toHome:'walking home 🏡'` to the status map in `renderRoster`.

- [ ] **Step 4: Verify** (`node --check` first): in browser, build a cottage far from the hall (≥10 tiles), let a settler move in; `darknessNow=()=>1;` → occupant paths to the cottage and sleeps within 1.6 tiles of it (assert position), while a homeless villager (make one: `makeVillager()`) sleeps near the hall. `darknessNow=()=>0;` → both wake to idle. Place a torch next to a worker → keeps working at night (override intact). setJob on a sleeping villager mid-night → re-paths home next tick without errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(v4): villagers sleep at their own home via toHome state"`

---

### Task 3: Food upkeep — dawn meal, hunger effects, warnings

**Files:**
- Modify: `index.html` — `S` literal, `loop()`, `villagerTick` speed/work/hauler lines (~479, ~502, ~543), `renderHUD` (~992), `renderRoster` row (~1042), `saveGame`/`loadGame`, `boot`

**Interfaces:**
- Consumes: nothing new. Produces: `dawnMealTick()`, `S.lastMeal` (day index), `v.hungry`, `S.stats.fedDay` (quest 18 reads it in Task 5).

- [ ] **Step 1: dawnMealTick** (near `productionTick`):

```js
function dawnMealTick(){
  const day=Math.floor(now()/1000/DAYLEN);
  if(day<=S.lastMeal)return;
  S.lastMeal=day;
  const order=['berry','fish','egg','bread'];
  let fed=0,hungry=0;
  for(const v of S.villagers){
    let ate=false;
    for(const k of order){if((S.inv[k]||0)>0){S.inv[k]--;ate=true;break}}
    v.hungry=!ate;if(ate)fed++;else hungry++;
  }
  if(hungry===0&&S.villagers.length>=4)S.stats.fedDay=1;
  renderHUD();renderRoster();questTick();saveSoon();
  if(S.villagers.length)toast(hungry===0?('🍞 The guild breaks fast — '+fed+' fed'):('⚠️ '+hungry+' villager'+(hungry>1?'s':'')+' went hungry!'));
}
```

Call it in `loop()` right after `spawnQueueTick(dt);` (inside `running&&!paused` — the `>` day-index compare means at most ONE catch-up meal after any pause/absence).

- [ ] **Step 2: lastMeal initialization.** `S` literal gets `lastMeal:0`. In `boot()` before `loadGame()` returns control (i.e., right after `const had=await loadGame();`): `if(!had)S.lastMeal=Math.floor(now()/1000/DAYLEN);`. In `loadGame` add `S.lastMeal=(s.lastMeal!==undefined)?s.lastMeal:Math.floor(now()/1000/DAYLEN);` — both fresh games and legacy saves start "already fed today" so nobody starves on frame one.

- [ ] **Step 3: Hunger effects in `villagerTick`:**
  - Speed line: `const spd=v.speed*(v.hasTool?1.6:1)*(1+.07*(vLvl(v)-1))*(onPath(v.x,v.y)?1.35:1)*(v.hungry?0.75:1);`
  - Work line: `v.work+=dt*(v.hasTool?1.6:1)*(1+.05*(vLvl(v)-1))*(v.hungry?0.75:1);`
  - Hauler branch: wrap the crate fetch in `if(!v.hungry){ … }` so hungry haulers fall through to wandering.

- [ ] **Step 4: HUD ⚠️.** In `renderHUD` compute before the template: `const edible=(S.inv.berry||0)+(S.inv.fish||0)+(S.inv.egg||0)+(S.inv.bread||0), foodShort=edible<S.villagers.length;` and render the villagers chip as `'<div class="res" title="'+(foodShort?'Not enough food for the next meal':'Villagers / housing capacity')+'">'+iconHTML('villagers','ico')+S.villagers.length+'/'+popCap()+(foodShort?' ⚠️':'')+'</div>'`.

- [ ] **Step 5: Roster 🥺.** In the row template add `+(v.hungry?' 🥺':'')` right after the `hasTool` tool emoji.

- [ ] **Step 6: Save/load.** `saveGame`: add `lastMeal:S.lastMeal,` and `hungry:!!v.hungry` in the villager map (extending Task 1's shape). `loadGame`: `v.hungry=!!vs.hungry;` in the villager loop; `S.stats.fedDay=s.stats.fedDay?1:0;` inside the stats merge; `S` literal `stats:{g:{},b:{},jobs:0,fedDay:0}`.

- [ ] **Step 7: Verify** (`node --check` first): in browser set `S.villagers` to 3 fed villagers, `S.inv.berry=2`, then force a meal (`S.lastMeal=Math.floor(now()/1000/DAYLEN)-1; dawnMealTick()`): 2 berries eaten, 1 villager hungry (🥺 in roster, ⚠️ on HUD chip since stock 0 < pop 3, toast "1 villager went hungry"). Hungry villager's `v.work` accrues at 0.75× (measure two villagers side by side on identical resources for 3s). Give bread + force another meal → hungry cleared. Reload old-style save (delete `lastMeal` key from the stored JSON) → no instant meal, `S.lastMeal` = today. Pause across a fake day boundary (`S.lastMeal-=2`) → exactly ONE meal on resume.
- [ ] **Step 8: Commit** — `git commit -m "feat(v4): dawn meals, hunger penalties, food warnings"`

---

### Task 4: Town tiers & civic buildings

**Files:**
- Modify: `index.html` — `BUILDS`, tier tables (Task 1 scaffold), `renderHUD`, tier check hook, `loadGame`, `renderBuildBar` (swap TIER_NAMES → TOWN_TIERS)

**Interfaces:**
- Consumes: `popCap`, `countB`, `TIER`, `S.town`, `spawnFireworks`, `monuFxUntil`.
- Produces: `TOWN_TIERS` table, `checkTownTier()`, `updateTierChip()`. Quest entries in Task 5 read `S.town.tier`.

- [ ] **Step 1: Civic BUILDS entries** (after the home entries):

```js
well:{name:'Well',ico:'⛲',cost:{stone:10},desc:'Fresh water for the town — required to reach Village',civic:true},
tavern:{name:'Tavern',ico:'🍺',cost:{plank:16,bread:8},desc:'Songs and suppers — required to reach Town',civic:true},
plaza:{name:'Plaza',ico:'🎪',cost:{stone:12,plank:6},desc:'A gathering square — required to reach Town',civic:true},
chapel:{name:'Chapel',ico:'⛪',cost:{brick:20,glass:10},desc:'A quiet spire — required to reach City',civic:true},
statue:{name:'Statue',ico:'🗿',cost:{stone:10,goldbar:2},desc:'A founder in gold — required to reach City',civic:true},
```

- [ ] **Step 2: TOWN_TIERS + check** (near `ERA`/`TIER`):

```js
const TOWN_TIERS=[
 {tier:'Hamlet',emoji:'⛺',ok:()=>true,bonus:0},
 {tier:'Village',emoji:'🗺️',ok:()=>S.villagers.length>=6&&countB('well')>=1,bonus:50},
 {tier:'Town',emoji:'🏘️',ok:()=>S.villagers.length>=10&&countB('tavern')>=1&&countB('plaza')>=1,bonus:100},
 {tier:'City',emoji:'🏰',ok:()=>S.villagers.length>=16&&countB('chapel')>=1&&countB('statue')>=1,bonus:250},
];
function checkTownTier(){
  while(S.town.tier<TOWN_TIERS.length-1&&TOWN_TIERS[S.town.tier+1].ok()){
    S.town.tier++;
    const tt=TOWN_TIERS[S.town.tier];
    S.score+=tt.bonus;
    toast(tt.emoji+' Emberpine is now a '+tt.tier+'!');sfx('quest');
    if(S.town.tier===3){
      monuFxUntil=now()+10000;
      spawnFireworks(HALL.x+.5,HALL.y-1);spawnFireworks(HALL.x-1,HALL.y);spawnFireworks(HALL.x+2,HALL.y-.5);
    }
    renderBuildBar();renderHUD();saveSoon();
  }
}
```

Call `checkTownTier()` from: end of `placeBuilding` (after `questTick()`), end of `spawnQueueTick`'s spawn branch (after its `questTick()`), and the upgrade handler (after its `questTick()`). The `while` walks multiple tiers in one call (old-save catch-up shows each banner in order, satisfying "recompute-if-higher with banner once").

Note: `monuFxUntil` drives an ambient shower positioned via `monBuilding()` in `ambienceTick` — guard that line with a fallback so it works pre-Monument: `const mon=monBuilding()||{x:HALL.x,y:HALL.y};`.

- [ ] **Step 3: Tier chip.** In `renderHUD` insert before the clock chip: `'<div class="res" id="tierChip" title="Town tier"></div>'`, then call `updateTierChip()` next to `updateClock()`:

```js
function updateTierChip(){const el=document.getElementById('tierChip');if(!el)return;
  const tt=TOWN_TIERS[S.town.tier];
  el.innerHTML='<span class="ico">'+tt.emoji+'</span>Emberpine '+tt.tier}
```

- [ ] **Step 4: Build bar swap.** Replace Task 1's `TIER_NAMES[tierReq]` with `TOWN_TIERS[tierReq].tier` and delete the `TIER_NAMES` array.

- [ ] **Step 5: Load recompute.** At the end of `loadGame` (after the reconcile pass): `checkTownTier();` — old saves that already qualify tier up with banners on first load.

- [ ] **Step 6: Verify** (`node --check` first): fresh boot → chip "⛺ Emberpine Hamlet"; well+tavern etc. visible in build bar, tavern/plaza locked "🔒 Village", chapel/statue "🔒 Town", house "🔒 Village", manor "🔒 Town". Drive pop to 6 (cottages) + place a well → Village banner, +50 score, tavern/plaza/house unlock. Force City (`S.villagers` to 16 via cottages or direct makeVillager+homes, place all civic) → banner + fireworks at the hall + chip "🏰 Emberpine City". Reload → tier persists; crafted old-save (strip `town` field, pre-place well + 6 villagers) → banner fires once on load.
- [ ] **Step 7: Commit** — `git commit -m "feat(v4): town tiers, civic buildings, tier chip and celebrations"`

---

### Task 5: Quests 15-20 + 8 SVG icons

**Files:**
- Modify: `index.html` — `QUESTS` array (~1303), `ICON_SVG` map (~930)

**Interfaces:**
- Consumes: `countB`, `S.town.tier`, `S.stats.fedDay`, `v.home`, `iconHTML` (all defined). Produces: nothing new.

- [ ] **Step 1: Append after the "Light the Eternal Flame" entry:**

```js
{t:'Build a cottage',icon:'⛺',p:()=>[countB('cottage')>0?1:0,1],c:()=>countB('cottage')>0,r:{plank:4}},
{t:'House 4 settlers',icon:'\u{1F3E0}',p:()=>[Math.min(4,S.villagers.filter(v=>v.home&&v.home!=='hall').length),4],c:()=>S.villagers.filter(v=>v.home&&v.home!=='hall').length>=4,r:{berry:6}},
{t:'Dig a well and reach Village',icon:'⛲',p:()=>[S.town.tier>=1?1:0,1],c:()=>S.town.tier>=1,r:{stone:8}},
{t:'Keep everyone fed for a full day',icon:'\u{1F35E}',p:()=>[S.stats.fedDay?1:0,1],c:()=>!!S.stats.fedDay,r:{bread:5}},
{t:'Reach Town',icon:'\u{1F3D8}️',p:()=>[S.town.tier>=2?1:0,1],c:()=>S.town.tier>=2,r:{brick:10}},
{t:'Reach City',icon:'\u{1F3F0}',p:()=>[S.town.tier>=3?1:0,1],c:()=>S.town.tier>=3,r:null},
```

(Quest-panel icons are prose emoji by spec — they stay emoji, like the existing entries.)

- [ ] **Step 2: Author 8 ICON_SVG entries** — `cottage, house, manor, well, tavern, plaza, chapel, statue` — v3 style (xmlns mandatory, 2px #2b2620 outline, flat palette fills, <~450B). Silhouette briefs:
  - `cottage` single steep gable, terracotta `#b0563b` roof, cream `#f0e6c8` wall, one door — smaller/simpler than `hall`
  - `house` two-story, two windows, chimney stub — bulkier than cottage
  - `manor` widest, twin gables + small central flag nub, glass-blue `#bcd6e0` windows
  - `well` circular grey stone rim + peaked roof strut + bucket — round silhouette, unique
  - `tavern` squat building with a hanging amber mug signboard
  - `plaza` open paved circle with radiating pavers + small central marker (only non-structure icon)
  - `chapel` narrow tall arch door + spire finial, pale stone + rose window
  - `statue` short pedestal + amber humanoid figure, arm raised — must NOT read as the Monument's tapering obelisk (compare side-by-side)
- [ ] **Step 3: Verify** (`node --check` first): all 8 keys decode (`iconImg[k].ready`), build-bar and popup render them, statue vs monument screenshot side-by-side is unmistakable at 20px; quest panel progresses through 15-17 in a scripted run (cottage → 4 housed → Village).
- [ ] **Step 4: Commit** — `git commit -m "feat(v4): civilization quests 15-20 and 8 building icons"`

---

### Task 6: Full QA + duplicate sync (no push)

**Files:**
- Modify: `emberpine-valley.html` (sync only, plus any QA fixes to `index.html`)

- [ ] **Step 1: Fresh full-arc scripted run** (browser, clean localStorage): boot → gather → cottage → settler arrives → night: settler sleeps at cottage → force dawn meal with food → fed toast → build to Village (6 pop + well) → house unlock + upgrade a cottage → Town → Monument arc still functional (place Foundation, contribute a stage) → City fireworks. Console clean except favicon 404.
- [ ] **Step 2: Regression:** pause menu (Esc), save/reload mid-arc (all new fields round-trip), build-selection persistence, roster dropdown (no self-close), villager target claiming, v3 icons on HUD/map, trader, Wonder popup.
- [ ] **Step 3: Migration:** craft a pre-v4 save (strip `town/lastMeal/home/hungry` fields from stored JSON, keep 6 villagers + a monument) → loads clean: villagers homeless, no instant starvation, tier recomputes with banners, no console errors.
- [ ] **Step 4: Leftover scan:** `grep -n "recruitCost\|recruitBtn" index.html` → zero code references (CSS gone too).
- [ ] **Step 5: Sync** — `cp index.html emberpine-valley.html && diff index.html emberpine-valley.html` → identical; commit both: `git commit -m "feat(v4): Civilization — homes, meals, night rest, town tiers"`. Do NOT push (controller pushes after the final fan-out review).
