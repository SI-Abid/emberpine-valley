# Emberpine Valley v2 — "The Five Eras" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace v1's instant Monument-placement win with a five-stage Monument construction arc fed by a deeper economy (4 map resources, 5 buildings, 10 new goods, 5-deep recipe chains, extended quests, a victory ceremony), keeping the game a single self-contained `index.html`.

**Architecture:** Pure data-driven extension of the existing global tables (`baseRes`/`gen()`, `RES_INFO`, `JOBS`, `BUILDS`, `RECIPES`, `QUESTS`, `TRADES`, `S.inv`) plus one new `MONUMENT_STAGES` table and one small `S.monu={stage,given,lit}` state object. No new subsystems, no module split. The staged Monument reuses the existing walk-up-and-contribute popup pattern (from the co-op Wonder) and the existing `productionTick`, `spawnBurst`, `spawnFireworks`, and `#victory` overlay.

**Tech Stack:** Vanilla JS in a single HTML file, Canvas 2D rendering, `localStorage` persistence. No build step, no dependencies. Verified in-browser with Playwright MCP against a local `python3 -m http.server` (the game blocks `file://` — see Global Constraints).

## Global Constraints

- **Single file.** All game code lives in `index.html`. A duplicate `emberpine-valley.html` exists and MUST stay byte-identical to `index.html` (synced in the final task). Do not introduce external files, CDN scripts, or a build step.
- **No test-only code in the shipped game.** Do NOT add debug hooks (e.g. `window.S=S`), test flags, or exports. Verification reaches game internals another way — see next bullet.
- **Game internals are directly reachable from Playwright.** `browser_evaluate(fn)` runs in the page's global scope, so a passed function can read top-level `const` tables and `function` declarations **by bare name**: `S`, `S.inv.wood`, `BUILDS`, `RECIPES`, `RES_INFO`, `MONUMENT_STAGES`, `QUESTS`, `TRADES`, `JOBS`, `baseRes`, and functions like `gain`, `placeBuilding`, `productionTick`, `render`, `completedStages`, `renderBuildBar`, `renderHUD`, `openMonumentPopup`, `saveGame`, `trader`. (Verified: `S.inv.wood` returns `0`; `window.S` is `undefined` but bare `S` works.) Tests use these bare names — never a `window.` prefix for `const`s.
- **Save key stays `save-v1`.** Extend the saved object with new fields; never rename the key. Old saves must load (migration in Task 11).
- **New goods must be listed in the `S.inv` literal** (index.html:337) so `Object.assign(S.inv, saved.inv||{})` defaults them to 0 for old saves.
- **Verify in-browser over HTTP.** `file://` is blocked (memory: `playwright-mcp-blocks-file-url`). A server is already running at `http://localhost:8151/index.html` (`python3 -m http.server 8151` from the repo root). `http.server` reads files from disk per request, so committed edits are picked up on reload — no restart needed.
- **Force daylight in tests** with `window.darknessNow=()=>0` after entering the valley. Villagers stop working at night (`darknessNow()>.52`); overriding this function global makes gathering/production deterministic. (`darknessNow` is a `function` declaration, so it IS on `window` and reassignable.)
- **Commit after every task** with the exact message given in the task's final step. The only console error tolerated is the favicon 404; any other console error is a defect.

## Exact new-good, resource, building, recipe, and stage values (copied from spec — use verbatim)

New goods (10): `clay, sand, goldore, flax, brick, glass, beam, cloth, goldbar, ornament`.

`ICONS` / `NICE` (append to index.html:838-839):
```
clay:'🟤'      Clay
sand:'⏳'      Sand
goldore:'🟡'   Gold Ore
flax:'🌿'      Flax
brick:'🧱'     Brick
glass:'🪟'     Glass
beam:'🏗️'     Steel Beam
cloth:'🧵'     Cloth
goldbar:'🪙'   Gold Bar
ornament:'💎'  Ornament
```

`RES_INFO` additions (index.html:344):
```
clay:{yield:'clay',n:2,time:2.2,emoji:'🧱'},
sand:{yield:'sand',n:2,time:1.8,emoji:'⏳'},
gold:{yield:'goldore',n:1,time:3.0,emoji:'✨'},
flax:{yield:'flax',n:2,time:1.4,emoji:'🌿'}
```

`BUILDS` additions (index.html:359):
```
kiln:{name:'Kiln',ico:'🔥',cost:{stone:20,wood:10},desc:'2 clay + 1 wood → 1 brick / 5s',rate:5},
glassworks:{name:'Glassworks',ico:'🪩',cost:{stone:16,plank:8},desc:'2 sand + 1 wood → 1 glass / 6s',rate:6},
forge:{name:'Forge',ico:'⚒️',cost:{stone:20,ingot:6},desc:'2 ingot + 1 plank → 1 beam / 7s',rate:7},
loom:{name:'Loom',ico:'🧵',cost:{plank:12,wood:8},desc:'2 flax → 1 cloth / 5s',rate:5},
gilder:{name:'Gilder',ico:'👑',cost:{brick:10,glass:4},desc:'1 goldbar + 1 glass → 1 ornament / 8s',rate:8}
```

`RECIPES` additions (index.html:539); smelter becomes an array (gold first):
```
smelter:[{in:{goldore:1,wood:1},out:'goldbar'},{in:{ore:1,wood:1},out:'ingot'}],
kiln:{in:{clay:2,wood:1},out:'brick'},
glassworks:{in:{sand:2,wood:1},out:'glass'},
forge:{in:{ingot:2,plank:1},out:'beam'},
loom:{in:{flax:2},out:'cloth'},
gilder:{in:{goldbar:1,glass:1},out:'ornament'}
```

`MONUMENT_STAGES` (new table; index 0 unused so `stage` reads naturally 1..5):
```
const MONUMENT_STAGES=[
 null,
 {name:'Foundation',   need:{stone:40,plank:20},  bonus:50,  banner:'⛏️ The Foundation is laid — the Era of Stone begins'},
 {name:'Frame',        need:{brick:24,beam:16},   bonus:50,  banner:'🏗️ The Frame rises — the Era of Iron begins'},
 {name:'Walls',        need:{glass:20,brick:20},  bonus:50,  banner:'🧱 The Walls stand — the Era of Craft begins'},
 {name:'Spire',        need:{cloth:12,ornament:8},bonus:50,  banner:'🗼 The Spire pierces the sky — the Era of Splendor begins'},
 {name:'Eternal Flame',need:{bread:15},           bonus:200, banner:'🔥 The Eternal Flame is lit — Emberpine is complete'},
];
```

**Stage model (single source of truth):**
- `S.monu` is `null` before the Foundation is placed.
- Placing the Monument pays `MONUMENT_STAGES[1].need` (40 stone + 20 plank, via `BUILDS.monument.cost`) and sets `S.monu={stage:2,given:{},lit:false}` — i.e. Foundation (stage 1) is done, Frame (stage 2) is now under construction.
- `S.monu.stage` = the stage currently under construction (2, 3, 4). Stage 5 (the Flame) is lit by the Feast button, which sets `S.monu.lit=true` and `S.monu.stage=6`.
- `completedStages()` = `S.monu ? (S.monu.lit ? 5 : S.monu.stage-1) : 0`. Drives sprite state, era-gating, gold reveal, and quests.
- Stages 2–4 fill via the walk-up **Contribute** buttons. Stage 5 is the single-click **Feast** button (needs 15 bread). Score bonuses: +50 per completed stage 1–4, +200 for the Flame.

Build-bar era gating (`completedStages()` threshold to unlock):
```
kiln:1, glassworks:1, forge:1,   loom:2, gilder:2
```

Quest chain (replaces the single v1 quest #8 "Raise the Monument"; quests 1–7 unchanged):
```
8.  Lay the Monument Foundation   c: completedStages()>=1     r:{clay:10}
9.  Fire 5 bricks                 c: (S.stats.g.brick||0)>=5  r:{sand:6}
10. Forge 3 steel beams           c: (S.stats.g.beam||0)>=3   r:{clay:8}
11. Complete the Frame            c: completedStages()>=2     r:{sand:10}
12. Craft an ornament             c: (S.stats.g.ornament||0)>=1  r:{bread:5}
13. Raise the Spire               c: completedStages()>=4     r:{bread:10}
14. Light the Eternal Flame       c: !!S.won                  r:null
```

`TRADES` additions (index.html:1114):
```
{give:{brick:10},get:{glass:6}},{give:{cloth:8},get:{ornament:1}},{give:{wood:15},get:{clay:4}},{give:{glass:6},get:{goldbar:2}}
```

Victory rank titles by `S.score`: `<300` Settler · `<600` Builder · `<1000` Architect · `>=1000` Master Builder of Emberpine.

---

## File Structure

- `index.html` — the entire game; every task edits this one file. Edits are localized to the existing table/function it names, following the established terse single-file style (no reformatting of untouched code).
- `emberpine-valley.html` — byte-identical duplicate; re-synced from `index.html` in Task 11.
- `docs/superpowers/plans/2026-07-11-emberpine-v2-five-eras.md` — this plan.

Because it is one file, tasks are **sequential** (no parallel edits). Each task is an independently reviewable slice that leaves the game booting and playable.

---

## How to verify a task (shared procedure)

1. The server is already running (`http://localhost:8151/index.html`). If it is not, start it from the repo root: `python3 -m http.server 8151` (background).
2. In Playwright MCP: `browser_navigate` to `http://localhost:8151/index.html`.
3. Enter the valley and force daylight — one `browser_evaluate`:
   ```js
   () => { document.getElementById('nameInput').value='Tester';
           document.getElementById('enterBtn').click();
           window.darknessNow=()=>0; return 'entered'; }
   ```
4. Run the task's assertion snippet with `browser_evaluate` (wrap in `async () => {…}` when it uses `await`). Each step states the expected return value.
5. Check `browser_console_messages` (level `error`) shows nothing but the favicon 404.
6. Where a step says "screenshot", `browser_take_screenshot` and eyeball the described visual.

A "test fails first" step means: run the assertion **before** implementing; it throws or returns the wrong value on current code. Then implement, and it returns the expected value. All snippets access internals by bare name (`S`, `BUILDS`, …) — never `window.S`.

---

### Task 1: New goods in inventory, icons, and conditional HUD chips

**Files:**
- Modify: `index.html:337` (`S.inv` literal), `index.html:838-839` (`ICONS`/`NICE`), `index.html:841` (`RAW`/`CRAFT`; add `NEWRAW`/`NEWCRAFT` + `ownsGood`), `index.html:843-848` (`renderHUD`).

**Interfaces:**
- Produces: `S.inv` contains all 10 new goods (default 0). `NEWRAW=['clay','sand','goldore','flax']`, `NEWCRAFT=['brick','glass','beam','cloth','goldbar','ornament']`, `ownsGood(k)`→boolean. HUD renders a new-good chip only when `ownsGood(k)` is true.

- [ ] **Step 1: Write the failing test.** After entering (shared procedure), `browser_evaluate`:

```js
() => ['clay','sand','goldore','flax','brick','glass','beam','cloth','goldbar','ornament'].map(k=>S.inv[k])
```
Expected AFTER implementation: `[0,0,0,0,0,0,0,0,0,0]`. Before: `[undefined,…]`.

- [ ] **Step 2: Extend the `S.inv` literal** (index.html:337). Replace:

```js
  inv:{wood:0,stone:0,ore:0,berry:0,fish:0,egg:0,plank:0,ingot:0,wheat:0,bread:0,tool:0},
```
with:
```js
  inv:{wood:0,stone:0,ore:0,berry:0,fish:0,egg:0,plank:0,ingot:0,wheat:0,bread:0,tool:0,
       clay:0,sand:0,goldore:0,flax:0,brick:0,glass:0,beam:0,cloth:0,goldbar:0,ornament:0},
```

- [ ] **Step 3: Extend `ICONS` and `NICE`** (index.html:838-839). Append inside each object literal, before its closing `}`:

```js
// ICONS: add
,clay:'🟤',sand:'⏳',goldore:'🟡',flax:'🌿',brick:'🧱',glass:'🪟',beam:'🏗️',cloth:'🧵',goldbar:'🪙',ornament:'💎'
// NICE: add
,clay:'Clay',sand:'Sand',goldore:'Gold Ore',flax:'Flax',brick:'Brick',glass:'Glass',beam:'Steel Beam',cloth:'Cloth',goldbar:'Gold Bar',ornament:'Ornament'
```

- [ ] **Step 4: Add new-good groups + `ownsGood`** after index.html:841 (`const RAW=…,CRAFT=…;`):

```js
const NEWRAW=['clay','sand','goldore','flax'], NEWCRAFT=['brick','glass','beam','cloth','goldbar','ornament'];
function ownsGood(k){return (S.inv[k]||0)>0 || (S.stats.g[k]||0)>0}
```

- [ ] **Step 5: Update `renderHUD`** (index.html:843-848):

```js
function renderHUD(){
  const rawChips=RAW.map(chipHtml).join('')+NEWRAW.filter(ownsGood).map(chipHtml).join('');
  const craftChips=CRAFT.map(chipHtml).join('')+NEWCRAFT.filter(ownsGood).map(chipHtml).join('');
  hud.innerHTML=rawChips+'<div class="hsep"></div>'+craftChips
   +'<div class="hsep"></div><div class="res" title="Villagers"><span class="ico">👥</span>'+S.villagers.length+'</div>'
   +'<div class="res" id="clockChip" title="Time of day"></div>';
  updateClock();
}
```

- [ ] **Step 6: Verify.** Reload + re-enter, run Step 1 → `[0,0,0,0,0,0,0,0,0,0]`. Then confirm chips are hidden until owned:

```js
() => { const before=document.querySelectorAll('#hud .res').length;
        gain('brick',3); renderHUD();
        const after=document.querySelectorAll('#hud .res').length;
        return [before, after, document.getElementById('res-brick')?.textContent]; }
```
Expected: `after === before+1`, `res-brick` text `"3"`. `browser_take_screenshot` → a 🧱3 chip appears; the other 9 new goods do not.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add 10 v2 goods with conditional HUD chips"
```

---

### Task 2: New map resources (gen, RES_INFO, jobs, drawRes, minimap + gated gold reveal)

**Files:**
- Modify: `index.html:344-349` (`RES_INFO`), `index.html:312-331` (`gen()`), `index.html:353-354` (`JOBS.miner`/`JOBS.forager`), `index.html:653-673` (`drawRes`), `index.html:820-835` (`bakeMini`/`renderMini`).

**Interfaces:**
- Consumes: `completedStages()` is added in Task 4 (lands after this). Guard its use here: `(typeof completedStages==='function'?completedStages():0)`.
- Produces: `baseRes` may contain `{type:'clay'|'sand'|'gold'|'flax'}`. Miners gather clay/sand/gold; foragers gather flax.

- [ ] **Step 1: Write the failing test.** After entering:

```js
() => { const c={clay:0,sand:0,gold:0,flax:0};
        for(const k in baseRes){const t=baseRes[k].type; if(t in c)c[t]++}
        return c; }
```
Expected AFTER: all four counts > 0 (clay/flax uncommon, sand common, gold rare but non-zero on 110×110). Before: all 0.

- [ ] **Step 2: Extend `RES_INFO`** (index.html:344). Append inside the object:

```js
,clay:{yield:'clay',n:2,time:2.2,emoji:'🧱'},
sand:{yield:'sand',n:2,time:1.8,emoji:'⏳'},
gold:{yield:'goldore',n:1,time:3.0,emoji:'✨'},
flax:{yield:'flax',n:2,time:1.4,emoji:'🌿'}
```

- [ ] **Step 3: Place new resources in `gen()`.** The existing `else if` chain (index.html:321-325) assigns at most one resource per tile using `r=hash2(x,y,SEED^333)`. Immediately after that chain (still inside the loop, before its closing `}`), add a second independent roll that only fills empty tiles. Use the raw `terrain` array for neighbor checks (`terrAt` is not defined until after `gen()`):

```js
    const kk=key(x,y), r2=hash2(x,y,SEED^444);
    if(!baseRes[kk]){
      const nearWater=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>terrain[(y+dy)*MW+(x+dx)]===0);
      if(t===1&&nearWater&&r2<.16)baseRes[kk]={type:'clay'};        // sand near water, uncommon
      else if(t===1&&r2<.30)baseRes[kk]={type:'sand'};              // beaches, common
      else if(t===4&&r2<.023)baseRes[kk]={type:'gold'};             // rock ground, ~1/3 of iron's rate
      else if(t===2&&r2>.955)baseRes[kk]={type:'flax'};             // grass meadows, uncommon
    }
```

(The village-green clear loop at index.html:328-330 already `delete baseRes[key(x,y)]`, so new resources near the Hall are removed too — no change needed.)

- [ ] **Step 4: Extend miner/forager `finds`** (index.html:353-354):

```js
  miner:{label:'⛏️ Miner',finds:['stone','iron','clay','sand','gold']},
  forager:{label:'🫐 Forager',finds:['berry','flax']},
```

- [ ] **Step 5: Draw the new resources.** In `drawRes` (index.html:653), before its closing `}`, add four branches:

```js
  else if(r.type==='clay'){
    cx.fillStyle='rgba(0,0,0,.18)';cx.beginPath();cx.ellipse(cxm,sy+sz*.8,sz*.3,sz*.09,0,0,7);cx.fill();
    cx.fillStyle='#a4674a';cx.beginPath();cx.arc(cxm,sy+sz*.62,sz*.24,0,7);cx.fill();
    cx.fillStyle='#8a5238';cx.fillRect(cxm-sz*.12,sy+sz*.58,sz*.24,sz*.14);
  }else if(r.type==='sand'){
    cx.fillStyle='rgba(0,0,0,.14)';cx.beginPath();cx.ellipse(cxm,sy+sz*.82,sz*.28,sz*.08,0,0,7);cx.fill();
    cx.fillStyle='#e6d29a';cx.beginPath();cx.moveTo(sx+sz*.16,sy+sz*.78);cx.quadraticCurveTo(cxm,sy+sz*.42,sx+sz*.84,sy+sz*.78);cx.closePath();cx.fill();
    cx.fillStyle='#d3bc78';cx.fillRect(sx+sz*.32,sy+sz*.66,sz*.36,2);
  }else if(r.type==='gold'){
    cx.fillStyle='rgba(0,0,0,.18)';cx.beginPath();cx.ellipse(cxm,sy+sz*.8,sz*.3,sz*.09,0,0,7);cx.fill();
    cx.fillStyle='#8f8b82';cx.beginPath();cx.moveTo(sx+sz*.22,sy+sz*.8);cx.lineTo(sx+sz*.36,sy+sz*.36);cx.lineTo(sx+sz*.66,sy+sz*.32);cx.lineTo(sx+sz*.8,sy+sz*.8);cx.closePath();cx.fill();
    cx.fillStyle='#f4c542';cx.fillRect(cxm-2,sy+sz*.5,4,4);cx.fillRect(cxm+3,sy+sz*.62,3,3);cx.fillRect(cxm-5,sy+sz*.6,2,2);
  }else if(r.type==='flax'){
    cx.strokeStyle='#5c8a52';cx.lineWidth=2;
    for(let i=0;i<3;i++){const bx=cxm+(i-1)*5;cx.beginPath();cx.moveTo(bx,sy+sz*.78);cx.lineTo(bx,sy+sz*.42);cx.stroke();
      cx.fillStyle='#8fb6d8';cx.beginPath();cx.arc(bx,sy+sz*.4,2.4,0,7);cx.fill();}
  }
```

- [ ] **Step 6: Minimap colors + gated gold reveal.** In `bakeMini` (index.html:820-824) replace the resource-color line so clay/sand/flax are baked but gold is NOT:

```js
    const rr=baseRes[key(x,y)];
    if(rr){const c={tree:'#2f6b3e',berry:'#8a3d8f',stone:'#6e6a60',iron:'#6e6a60',clay:'#a4674a',sand:'#d3bc78',flax:'#7fa9c9'}[rr.type];
      if(c){g.fillStyle=c;g.fillRect(x,y,1,1)}}
```

In `renderMini` (index.html:826-835), after `mcx.drawImage(miniBase,0,0,140,140);` add the gated gold overlay:

```js
  if((typeof completedStages==='function'?completedStages():0)>=3){
    mcx.fillStyle='#f4c542';
    for(const k in baseRes){if(baseRes[k].type!=='gold')continue;const p=k.split(',');mcx.fillRect(p[0]*f-1,p[1]*f-1,2,2)}
  }
```

- [ ] **Step 7: Verify resources + gathering wiring.** Run Step 1 → all four counts > 0. Then:

```js
() => { const v=S.villagers[0]; setJob(v,'miner');
        return [JOBS.miner.finds.includes('clay'), JOBS.miner.finds.includes('gold'), JOBS.forager.finds.includes('flax')]; }
```
Expected: `[true,true,true]`. (Full visual confirmation of new sprites happens in the Task 11 playthrough.)

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: add clay/sand/gold/flax map resources, jobs, sprites, minimap"
```

---

### Task 3: New buildings, recipes, and dual-recipe smelter

**Files:**
- Modify: `index.html:359-370` (`BUILDS`), `index.html:538` (`prodTimers`), `index.html:539-542` (`RECIPES`), `index.html:544-560` (`productionTick`), `index.html:674` (`BCOLS`).

**Interfaces:**
- Produces: `RECIPES.smelter` is now an **array** of recipe objects (gold first, then ingot). `productionTick` runs the first affordable recipe for each building type. Buildings `kiln, glassworks, forge, loom, gilder` produce `brick, glass, beam, cloth, ornament`.

- [ ] **Step 1: Write the failing test.** After entering + `window.darknessNow=()=>0`:

```js
() => { S.inv.stone=100; S.inv.wood=100; S.inv.clay=100;
        placeBuilding('kiln', S.me.x|0, (S.me.y|0)+3);   // needs 20 stone +10 wood
        const b4=S.inv.brick;
        for(let i=0;i<12;i++) productionTick(1);          // >2× the 5s rate
        return [typeof BUILDS.kiln, S.inv.brick>b4]; }
```
Expected AFTER: `["object", true]`. Before: `BUILDS.kiln` is `undefined` → `false`.

- [ ] **Step 2: Add the five `BUILDS` entries** — insert after `workshop:` (index.html:365), before `torch:`:

```js
  kiln:{name:'Kiln',ico:'🔥',cost:{stone:20,wood:10},desc:'2 clay + 1 wood → 1 brick / 5s',rate:5},
  glassworks:{name:'Glassworks',ico:'🪩',cost:{stone:16,plank:8},desc:'2 sand + 1 wood → 1 glass / 6s',rate:6},
  forge:{name:'Forge',ico:'⚒️',cost:{stone:20,ingot:6},desc:'2 ingot + 1 plank → 1 beam / 7s',rate:7},
  loom:{name:'Loom',ico:'🧵',cost:{plank:12,wood:8},desc:'2 flax → 1 cloth / 5s',rate:5},
  gilder:{name:'Gilder',ico:'👑',cost:{brick:10,glass:4},desc:'1 goldbar + 1 glass → 1 ornament / 8s',rate:8},
```

- [ ] **Step 3: Extend `prodTimers`** (index.html:538):

```js
const prodTimers={sawmill:0,smelter:0,bakery:0,workshop:0,kiln:0,glassworks:0,forge:0,loom:0,gilder:0};
```

- [ ] **Step 4: Update `RECIPES`** (index.html:539-542):

```js
const RECIPES={
  sawmill:{in:{wood:2},out:'plank'},
  smelter:[{in:{goldore:1,wood:1},out:'goldbar'},{in:{ore:1,wood:1},out:'ingot'}],
  bakery:{in:{wheat:2},out:'bread'}, workshop:{in:{plank:2,ingot:1},out:'tool'},
  kiln:{in:{clay:2,wood:1},out:'brick'}, glassworks:{in:{sand:2,wood:1},out:'glass'},
  forge:{in:{ingot:2,plank:1},out:'beam'}, loom:{in:{flax:2},out:'cloth'},
  gilder:{in:{goldbar:1,glass:1},out:'ornament'},
};
```

- [ ] **Step 5: Generalize `productionTick`** (index.html:544-560) to handle multi-recipe buildings:

```js
function productionTick(dt){
  for(const t in RECIPES){
    const n=countB(t);if(!n)continue;
    prodTimers[t]=(prodTimers[t]||0)+dt*n;
    const rate=BUILDS[t].rate;
    while(prodTimers[t]>=rate){
      prodTimers[t]-=rate;
      const recs=Array.isArray(RECIPES[t])?RECIPES[t]:[RECIPES[t]];
      const r=recs.find(rc=>Object.entries(rc.in).every(([k,v])=>S.inv[k]>=v));
      if(r){
        for(const[k,v]of Object.entries(r.in))S.inv[k]-=v;
        gain(r.out,1);
        const bl=Object.values(S.buildings).find(bb=>bb.type===t&&bb.mine);
        if(bl)spawnBurst(bl.x,bl.y,'#ffe9b8',3);
      }
    }
  }
}
```

- [ ] **Step 6: Add building colors** to `BCOLS` (index.html:674), append before its closing `}`:

```js
,kiln:'#b5643c',glassworks:'#7fa9b0',forge:'#6a6f78',loom:'#b58fb0',gilder:'#c9a94a'
```

- [ ] **Step 7: Verify.** Run Step 1 → `["object", true]`. Then confirm the dual-recipe smelter prefers gold:

```js
() => { S.inv.stone=100;S.inv.wood=100;S.inv.ore=0;S.inv.goldore=10;
        placeBuilding('smelter',(S.me.x|0)+2,(S.me.y|0)+3);
        const gb=S.inv.goldbar, ig=S.inv.ingot;
        for(let i=0;i<20;i++)productionTick(1);
        return [S.inv.goldbar>gb, S.inv.ingot===ig]; }
```
Expected: `[true,true]` (only goldore present → makes gold bars, not ingots). No console errors.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: add kiln/glassworks/forge/loom/gilder + dual-recipe smelter"
```

---

### Task 4: Staged Monument state, placement, and stage helpers

**Files:**
- Modify: `index.html:335-343` (`S` literal: add `monu:null, playSec:0, celebrateUntil:0`), add `MONUMENT_STAGES` after `BUILDS` (index.html:370), `index.html:369` (`BUILDS.monument`), `index.html:615-632` (`placeBuilding`), add helpers `completedStages()`/`monBuilding()` near the other helpers (index.html:1419-1422).

**Interfaces:**
- Produces: `S.monu` = `null` | `{stage:number, given:{}, lit:boolean}`. `completedStages()`→0..5. `monBuilding()`→ the placed monument building object or `null`. Placing the Monument no longer sets `S.won` (that moves to the Flame in Task 8).

- [ ] **Step 1: Write the failing test.**

```js
() => [ (typeof MONUMENT_STAGES!=='undefined') && MONUMENT_STAGES[2] && MONUMENT_STAGES[2].name,
        typeof completedStages ]
```
Expected AFTER: `["Frame","function"]`. Before: throws (`MONUMENT_STAGES is not defined`) → treat the throw as the failing state.

- [ ] **Step 2: Add state fields** to the `S` literal (index.html:341-342):

```js
  others:{}, score:0, won:false, msgShown:{}, quest:0, muted:false,
  monu:null, playSec:0, celebrateUntil:0,
  stats:{g:{},b:{},jobs:0},
```

- [ ] **Step 3: Add the `MONUMENT_STAGES` table** immediately after the `BUILDS` object (index.html:370):

```js
const MONUMENT_STAGES=[
 null,
 {name:'Foundation',   need:{stone:40,plank:20},  bonus:50,  banner:'⛏️ The Foundation is laid — the Era of Stone begins'},
 {name:'Frame',        need:{brick:24,beam:16},   bonus:50,  banner:'🏗️ The Frame rises — the Era of Iron begins'},
 {name:'Walls',        need:{glass:20,brick:20},  bonus:50,  banner:'🧱 The Walls stand — the Era of Craft begins'},
 {name:'Spire',        need:{cloth:12,ornament:8},bonus:50,  banner:'🗼 The Spire pierces the sky — the Era of Splendor begins'},
 {name:'Eternal Flame',need:{bread:15},           bonus:200, banner:'🔥 The Eternal Flame is lit — Emberpine is complete'},
];
```

- [ ] **Step 4: Retune `BUILDS.monument`** (index.html:369):

```js
  monument:{name:'Monument Foundation',ico:'🗿',cost:{stone:40,plank:20},desc:'Lay the Foundation, then raise it through five eras'},
```

- [ ] **Step 5: Add helpers** near index.html:1420 (beside `vLvl`, `torchNear`):

```js
function completedStages(){return S.monu?(S.monu.lit?5:S.monu.stage-1):0}
function monBuilding(){for(const k in S.buildings)if(S.buildings[k].type==='monument')return S.buildings[k];return null}
```

- [ ] **Step 6: Rewrite the monument branch in `placeBuilding`** (index.html:625-629). Replace the `if(type==='monument'&&!S.won){…}` block with:

```js
  if(type==='monument'){
    S.monu={stage:2,given:{},lit:false};
    S.score+=MONUMENT_STAGES[1].bonus;                 // Foundation complete: +50
    toast(MONUMENT_STAGES[1].banner);
    firstTime('monu','Walk to the Monument 🗿 and click it to contribute goods to the next era.');
  }
```

- [ ] **Step 7: Verify placement sets stage state and does NOT win.**

```js
() => { S.inv.stone=100;S.inv.plank=100; S.won=false;
        placeBuilding('monument',(S.me.x|0)+1,(S.me.y|0)+4);
        return [JSON.stringify(S.monu), completedStages(), S.won, monBuilding()!==null]; }
```
Expected: `['{"stage":2,"given":{},"lit":false}', 1, false, true]`.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: add MONUMENT_STAGES, S.monu state, staged Foundation placement"
```

---

### Task 5: Monument contribute popup + stage advancement

**Files:**
- Modify: `index.html:923-930` (`openBuildingPopup` — route the monument), add `openMonumentPopup`, `contributeMonu`, `advanceStage`, `lastMX/lastMY` near the Wonder popup helpers (index.html:1306 region).

**Interfaces:**
- Consumes: `S.monu`, `MONUMENT_STAGES`, `completedStages`, `monBuilding`, `ICONS`, `spawnBurst`, `sfx`, `toast`, `bumpRes`, `renderBuildBar`, `questTick`, `saveSoon`, `clamp`, `popup`, `VW`, `VH`.
- Produces: clicking the placed Monument opens a staged popup with per-good **Give** buttons (stages 2–4). Meeting a stage's `need` calls `advanceStage()` → +bonus, banner toast, `S.monu.stage++`, `given` reset. (Feast/stage-5 UI is added in Task 8.)

- [ ] **Step 1: Write the failing test.** With a monument placed and stage-2 inputs stocked:

```js
() => { S.inv.brick=30;S.inv.beam=20; S.monu={stage:2,given:{},lit:false};
        const before=completedStages();
        contributeMonu('brick'); contributeMonu('beam');   // gives up to each stage-2 need
        return [before, completedStages(), S.monu.stage, S.inv.brick, S.inv.beam]; }
```
Expected AFTER: `[1, 2, 3, 6, 4]` — 24 brick + 16 beam consumed, stage advanced to 3. Before: throws (`contributeMonu is not defined`).

- [ ] **Step 2: Add the contribute + advance + popup functions** near index.html:1306 (before `openWonderPopup`):

```js
let lastMX=200,lastMY=200;
function advanceStage(){
  const stage=S.monu.stage, st=MONUMENT_STAGES[stage];
  S.score+=st.bonus;
  toast(st.banner); sfx('quest');
  const mon=monBuilding(); if(mon)spawnBurst(mon.x,mon.y-1,'#ffe9b8',14);
  S.monu.stage=stage+1; S.monu.given={};
  renderBuildBar(); questTick(); saveSoon();
}
function contributeMonu(k){
  if(!S.monu||S.monu.lit)return;
  const stage=S.monu.stage, st=MONUMENT_STAGES[stage]; if(!st||!(k in st.need))return;
  const given=S.monu.given[k]||0, put=Math.min(S.inv[k]||0, st.need[k]-given);
  if(put<=0)return;
  S.inv[k]-=put; S.monu.given[k]=given+put; bumpRes(k);
  const mon=monBuilding(); if(mon)spawnBurst(mon.x,mon.y-1,'#ffe9b8',6); sfx('build');
  if(Object.entries(st.need).every(([g,nn])=>(S.monu.given[g]||0)>=nn)) advanceStage();
  saveSoon();
  if(popup.style.display==='block'&&S.monu&&!S.monu.lit) openMonumentPopup(lastMX,lastMY);
}
function openMonumentPopup(px,py){
  lastMX=px;lastMY=py;
  const cs=completedStages();
  let body;
  if(S.monu.lit){
    body='<div class="desc">The Eternal Flame burns on. Emberpine is complete. 🔥</div>';
  }else{
    const stage=S.monu.stage, st=MONUMENT_STAGES[stage];
    const rows=Object.entries(st.need).map(([k,need])=>{
      const given=S.monu.given[k]||0, have=S.inv[k]||0, ok=have>0&&given<need;
      return '<div class="wrow"><span>'+ICONS[k]+'</span><div class="wbar"><div class="wfill" style="width:'+(100*Math.min(given,need)/need)+'%"></div></div>'+
             '<span class="wnum">'+given+'/'+need+'</span><button data-k="'+k+'" class="wgive"'+(ok?'':' disabled')+'>Give</button></div>';
    }).join('');
    body='<div class="desc">Raising the <b>'+st.name+'</b> · era '+(cs+1)+' of 5</div>'+rows;
  }
  popup.innerHTML='<button class="close">✕</button><h4>🗿 Monument · '+(S.monu.lit?'Complete':MONUMENT_STAGES[Math.min(5,S.monu.stage)].name)+'</h4>'+body;
  popup.querySelectorAll('.wgive[data-k]').forEach(b=>b.onclick=()=>contributeMonu(b.dataset.k));
  popup.querySelector('.close').onclick=()=>popup.style.display='none';
  popup.style.display='block';
  popup.style.left=clamp(px-130,8,Math.max(8,VW-276))+'px';
  popup.style.top=clamp(py-200,8,Math.max(8,VH-280))+'px';
}
```

- [ ] **Step 3: Route monument clicks to the staged popup.** In `openBuildingPopup` (index.html:923), add at the very top of the function body:

```js
function openBuildingPopup(b,px,py){
  if(b.type==='monument'&&S.monu){openMonumentPopup(px,py);return}
  const B=BUILDS[b.type];
  // …unchanged…
```

- [ ] **Step 4: Verify** Step 1 → `[1, 2, 3, 6, 4]`. Then open the popup visually:

```js
() => { S.monu={stage:3,given:{glass:4},lit:false}; S.inv.glass=10;S.inv.brick=10;
        openMonumentPopup(400,300);
        return document.querySelector('#popup h4').textContent; }
```
Expected: `"🗿 Monument · Walls"`. `browser_take_screenshot` → popup shows Walls with 🪟 4/20 (partial bar) and 🧱 0/20 rows, each with a Give button.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: staged Monument contribute popup + stage advancement"
```

---

### Task 6: Monument five-state sprite

**Files:**
- Modify: `index.html:675-700` (`drawBuilding` — route monument to `drawMonument`), add `drawMonument` after `drawBuilding`.

**Interfaces:**
- Consumes: `completedStages()`, `S.monu`, `now()`, canvas ctx `cx`.
- Produces: the placed Monument renders through five growing states + a lit flame when `S.monu.lit`.

- [ ] **Step 1: Write the failing test** (guard — no throw at any stage):

```js
() => { S.inv.stone=100;S.inv.plank=100; if(!monBuilding())placeBuilding('monument',(S.me.x|0)+1,(S.me.y|0)+5);
        S.monu={stage:2,given:{},lit:false}; render();
        S.monu={stage:5,given:{},lit:true};  render();
        return 'ok'; }
```
Expected AFTER: `"ok"` with a distinctly taller, flame-topped sprite at `lit`. Before `drawMonument` exists, the monument draws as the generic grey box + 🗿 at every stage (screenshot identical across stages).

- [ ] **Step 2: Route monument in `drawBuilding`.** After the `torch` branch (index.html:689), add:

```js
  if(b.type==='monument'){drawMonument(b,sx,sy,sz);return;}
```

- [ ] **Step 3: Add `drawMonument`** after `drawBuilding` closes (index.html:700):

```js
function drawMonument(b,sx,sy,sz){
  const cs=completedStages();               // 0..5
  cx.fillStyle='rgba(0,0,0,.28)';cx.beginPath();cx.ellipse(sx+sz/2,sy+sz*.92,sz*.5,sz*.13,0,0,7);cx.fill();
  const tiers=[
    {w:.86,h:.34,y:.62,c:'#b8b4a6'},        // 1 Foundation
    {w:.70,h:.30,y:.34,c:'#c8c2b0'},        // 2 Frame
    {w:.56,h:.28,y:.08,c:'#d8d2bd'},        // 3 Walls
    {w:.40,h:.30,y:-.20,c:'#e6dcc2'},       // 4 Spire
  ];
  const shown=Math.min(4,cs);
  for(let i=0;i<shown;i++){const t=tiers[i];
    cx.fillStyle=t.c;cx.strokeStyle='#2b2620';cx.lineWidth=2;
    const w=sz*t.w, x=sx+sz/2-w/2, y=sy+sz*t.y;
    cx.fillRect(x,y,w,sz*t.h);cx.strokeRect(x,y,w,sz*t.h);
  }
  if(cs>=4){ // spire cap
    cx.fillStyle='#e6dcc2';cx.strokeStyle='#2b2620';
    cx.beginPath();cx.moveTo(sx+sz/2,sy-sz*.42);cx.lineTo(sx+sz/2-sz*.16,sy-sz*.16);cx.lineTo(sx+sz/2+sz*.16,sy-sz*.16);cx.closePath();cx.fill();cx.stroke();
  }
  if(S.monu&&S.monu.lit){
    const fl=1+Math.sin(now()/110)*.25;
    cx.fillStyle='rgba(255,180,60,.3)';cx.beginPath();cx.arc(sx+sz/2,sy-sz*.5,sz*.7*fl,0,7);cx.fill();
    cx.fillStyle='#e8a33d';cx.beginPath();cx.arc(sx+sz/2,sy-sz*.5,sz*.16*fl,0,7);cx.fill();
    cx.fillStyle='#ffe9a0';cx.beginPath();cx.arc(sx+sz/2,sy-sz*.5,sz*.08*fl,0,7);cx.fill();
  }
  if(cs===0){ // placed but nothing built yet — flag marker
    cx.font=(sz*.5)+'px serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText('🚩',sx+sz/2,sy+sz*.45);
  }
}
```

- [ ] **Step 4: Verify.** Run Step 1 → `"ok"`, no console errors. Screenshot at `cs=1`, `cs=3`, and `lit` (set `S.monu` then `render()` between shots): the tower must visibly gain tiers and show a glowing flame when lit.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: five-state Monument sprite with lit Eternal Flame"
```

---

### Task 7: Build-bar era gating + monument entry lifecycle + CSS

**Files:**
- Modify: `index.html:39` (add `.bbtn.eralock` CSS), `index.html:861-872` (`renderBuildBar`; add `ERA` map).

**Interfaces:**
- Consumes: `completedStages()`, `MONUMENT_STAGES`, `S.monu`, `canAfford`, `costStr`.
- Produces: Kiln/Glassworks/Forge greyed with 🔒 until `completedStages()>=1`; Loom/Gilder until `>=2`. The Monument entry shows only until placed (then hidden). Era-locked buttons are non-selectable and show the unlocking stage name.

- [ ] **Step 1: Write the failing test.** No monument:

```js
() => { S.monu=null; renderBuildBar();
        const kiln=[...document.querySelectorAll('#buildbar .bbtn')].find(x=>x.textContent.includes('Kiln'));
        return [kiln?.classList.contains('eralock'), kiln?.textContent.includes('🔒')]; }
```
Expected AFTER: `[true, true]`. Before: kiln button not era-locked (no `eralock`).

- [ ] **Step 2: Add CSS** at index.html:39 (right after the existing `.bbtn.locked` rule):

```css
  .bbtn.eralock{opacity:.4;filter:grayscale(.85);cursor:not-allowed}
  .bbtn.eralock .bc{color:var(--clay)}
```

- [ ] **Step 3: Rewrite `renderBuildBar`** (index.html:861-872):

```js
const ERA={kiln:1,glassworks:1,forge:1,loom:2,gilder:2};
function renderBuildBar(){
  bbar.innerHTML='';
  const cs=completedStages();
  for(const t in BUILDS){
    if(t==='monument'&&S.monu)continue;                 // Foundation already placed
    const B=BUILDS[t], req=ERA[t]||0, eraLocked=cs<req;
    const btn=document.createElement('button');
    if(eraLocked){
      btn.className='bbtn eralock';
      btn.innerHTML='<span class="bi">'+B.ico+'</span><span class="bn">'+B.name+'</span><span class="bc">🔒 '+MONUMENT_STAGES[req].name+'</span>';
      btn.title='Unlocks when the '+MONUMENT_STAGES[req].name+' is complete';
      btn.onclick=()=>toast('🔒 Complete the '+MONUMENT_STAGES[req].name+' first');
    }else{
      btn.className='bbtn'+(S.buildSel===t?' sel':'')+(canAfford(B.cost)?'':' locked');
      btn.innerHTML='<span class="bi">'+B.ico+'</span><span class="bn">'+B.name+'</span><span class="bc">'+costStr(B.cost)+'</span>';
      btn.title=B.desc;
      btn.onclick=()=>{S.buildSel=S.buildSel===t?null:t;renderBuildBar();
        if(S.buildSel)toast('Tap a tile to place the '+B.name);popup.style.display='none'};
    }
    bbar.appendChild(btn);
  }
}
```

- [ ] **Step 4: Verify gating transitions.**

```js
() => { S.monu=null; renderBuildBar();
        const locked=[...document.querySelectorAll('#buildbar .bbtn')].filter(x=>x.classList.contains('eralock')).map(x=>x.querySelector('.bn').textContent).sort();
        S.monu={stage:2,given:{},lit:false}; renderBuildBar();   // Foundation done
        const afterFoundation=[...document.querySelectorAll('#buildbar .bbtn')].filter(x=>x.classList.contains('eralock')).map(x=>x.querySelector('.bn').textContent).sort();
        const monShown=[...document.querySelectorAll('#buildbar .bbtn')].some(x=>x.textContent.includes('Monument'));
        return [locked, afterFoundation, monShown]; }
```
Expected: `[["Forge","Gilder","Glassworks","Kiln","Loom"], ["Gilder","Loom"], false]`. `browser_take_screenshot` → 🔒 chips on locked buttons.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: era-gated build bar with lock chips; hide Monument once placed"
```

---

### Task 8: Endgame — playSec, Feast button, Flame lighting, victory ceremony

**Files:**
- Modify: `index.html:1518-1532` (`loop` — accumulate `S.playSec`), add `lightFlame`/`showVictory`/`monuFxUntil` near the Monument helpers, extend `openMonumentPopup` (from Task 5) with the Feast branch + feast-button wiring, extend `ambienceTick` (index.html:1057) with celebration fireworks, extend `render` (index.html:788) with villager 🎉 emotes.

**Interfaces:**
- Consumes: `completedStages`, `monBuilding`, `MONUMENT_STAGES`, `spawnFireworks`, `findPath`, `drawEmote`, `DAYLEN`, `S.stats.g`, `escapeHtml`, `bumpRes`, `now()`, `popup`.
- Produces: `S.playSec` grows while running & unpaused. When Spire is done (`completedStages()>=4`), the Monument popup shows a Feast button; clicking it with ≥15 bread calls `lightFlame()` → consumes 15 bread, `S.monu.lit=true`, `S.monu.stage=6`, +200, `S.won=true`, 10s fireworks + villager celebration, and the victory card. "Keep playing" resumes.

- [ ] **Step 1: Write the failing test.**

```js
() => { S.monu={stage:5,given:{},lit:false}; S.inv.bread=20; S.won=false;
        if(!monBuilding()){S.inv.stone=100;S.inv.plank=100;placeBuilding('monument',(S.me.x|0)+1,(S.me.y|0)+6);S.monu={stage:5,given:{},lit:false};}
        const s0=S.score;
        lightFlame();
        return [S.monu.lit, S.won, S.inv.bread, S.score-s0, document.getElementById('victory').style.display]; }
```
Expected AFTER: `[true, true, 5, 200, "flex"]`. Before: throws (`lightFlame is not defined`).

- [ ] **Step 2: Accumulate `playSec` in `loop`** (index.html:1520-1525). Inside `if(running&&!paused){ try{ … } }`, add `S.playSec+=dt;` as the FIRST line of the `try`:

```js
    try{
      S.playSec+=dt;
      playerTick(dt);
      for(const v of S.villagers)villagerTick(v,dt);
      productionTick(dt);ambienceTick(dt);
      render();
    }catch(err){ /* unchanged */ }
```

- [ ] **Step 3: Add `lightFlame` + `showVictory` + `monuFxUntil`** near the Monument helpers (after `contributeMonu`, index.html:1306 region):

```js
let monuFxUntil=0;
function lightFlame(){
  if(!S.monu||S.monu.lit)return;
  if((S.inv.bread||0)<MONUMENT_STAGES[5].need.bread){toast('Need 15 🍞 for the feast');return}
  S.inv.bread-=MONUMENT_STAGES[5].need.bread; bumpRes('bread');
  S.monu.lit=true; S.monu.stage=6;
  S.score+=MONUMENT_STAGES[5].bonus; S.won=true;
  toast(MONUMENT_STAGES[5].banner); sfx('quest');
  const mon=monBuilding();
  monuFxUntil=now()+10000; S.celebrateUntil=now()+10000;
  if(mon){spawnFireworks(mon.x+.5,mon.y-1);spawnFireworks(mon.x-1,mon.y);spawnFireworks(mon.x+2,mon.y-.5);
    for(const v of S.villagers){const p=findPath(v.x,v.y,mon.x,mon.y,true);if(p)v.path=p}}
  popup.style.display='none';
  showVictory(); renderBuildBar(); questTick(); saveGame();
}
function showVictory(){
  const days=(S.playSec/DAYLEN).toFixed(1);
  const goods=Object.values(S.stats.g).reduce((a,b)=>a+b,0);
  const rank=S.score>=1000?'Master Builder of Emberpine':S.score>=600?'Architect':S.score>=300?'Builder':'Settler';
  const h1=document.querySelector('#victory h1'); if(h1)h1.textContent='THE ETERNAL FLAME';
  document.getElementById('victoryText').innerHTML=
    escapeHtml(S.me.name)+' has lit the Eternal Flame of Emberpine Valley.<br><br>'+
    '🗓️ Days survived: <b>'+days+'</b><br>'+
    '📦 Goods produced: <b>'+goods+'</b><br>'+
    '⭐ Final score: <b>'+S.score+'</b><br>'+
    '🏅 Rank: <b>'+rank+'</b>';
  document.getElementById('victory').style.display='flex';
}
```

- [ ] **Step 4: Add the Feast branch to `openMonumentPopup`** (from Task 5). Change the `else` (non-lit) branch so it splits into `else if(cs>=4)` (feast) and `else` (contribute rows). Replace the non-lit body construction:

```js
  }else if(cs>=4){
    const need=MONUMENT_STAGES[5].need.bread, can=(S.inv.bread||0)>=need;
    body='<div class="desc">The Spire is raised. Hold the feast to light the Eternal Flame.</div>'+
      '<div class="wrow"><span>🍞</span><span class="wnum">'+(S.inv.bread||0)+'/'+need+'</span>'+
      '<button id="feastBtn" class="wgive"'+(can?'':' disabled')+'>🔥 Hold the Feast</button></div>';
  }else{
    const stage=S.monu.stage, st=MONUMENT_STAGES[stage];
    const rows=Object.entries(st.need).map(([k,need])=>{
      const given=S.monu.given[k]||0, have=S.inv[k]||0, ok=have>0&&given<need;
      return '<div class="wrow"><span>'+ICONS[k]+'</span><div class="wbar"><div class="wfill" style="width:'+(100*Math.min(given,need)/need)+'%"></div></div>'+
             '<span class="wnum">'+given+'/'+need+'</span><button data-k="'+k+'" class="wgive"'+(ok?'':' disabled')+'>Give</button></div>';
    }).join('');
    body='<div class="desc">Raising the <b>'+st.name+'</b> · era '+(cs+1)+' of 5</div>'+rows;
  }
```

And after wiring the `.wgive[data-k]` buttons, wire the feast button:

```js
  const fb=popup.querySelector('#feastBtn'); if(fb)fb.onclick=lightFlame;
```

- [ ] **Step 5: Celebration fireworks in `ambienceTick`** — add near the top of `ambienceTick` (index.html:1057):

```js
  if(monuFxUntil>now()){const mon=monBuilding();
    if(mon&&Math.random()<dt*3)spawnFireworks(mon.x+.5+(Math.random()-.5)*2, mon.y-1+(Math.random()-.5));}
```

- [ ] **Step 6: Villager 🎉 emotes in `render`** — right after the `for(const v of S.villagers){…}` loop closes (index.html:788):

```js
  if(now()<S.celebrateUntil)for(const v of S.villagers)drawEmote(v.x,v.y,'🎉');
```

- [ ] **Step 7: Verify.** Run Step 1 → `[true, true, 5, 200, "flex"]`. Then confirm the feast button gates on bread and the ceremony renders:

```js
() => { if(!monBuilding()){S.inv.stone=100;S.inv.plank=100;placeBuilding('monument',(S.me.x|0)+1,(S.me.y|0)+7);}
        S.monu={stage:5,given:{},lit:false}; S.inv.bread=20;
        openMonumentPopup(400,300); return document.querySelector('#feastBtn')?.disabled; }
```
Expected: `false` (feast enabled with 20 bread). Click it (`() => document.querySelector('#feastBtn').click()`), then `browser_take_screenshot` → victory card reads "THE ETERNAL FLAME" with Days/Goods/Score/Rank; fireworks over the monument. Click "Keep playing" → overlay closes; game continues; `browser_console_messages` clean.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: Feast button, Eternal Flame, victory ceremony with fireworks + rank"
```

---

### Task 9: Extend the Guild Charter quest chain (8–14)

**Files:**
- Modify: `index.html:1137-1146` (`QUESTS` — replace the final entry with seven new entries).

**Interfaces:**
- Consumes: `completedStages()`, `S.stats.g`, `S.won`.
- Produces: 14-entry `QUESTS`.

- [ ] **Step 1: Write the failing test.**

```js
() => [QUESTS.length, QUESTS[7].t, QUESTS[13] && QUESTS[13].t]
```
Expected AFTER: `[14, "Lay the Monument Foundation", "Light the Eternal Flame"]`. Before: `[8, "Raise the Monument", undefined]`.

- [ ] **Step 2: Replace the last `QUESTS` entry** (index.html:1145 — the `Raise the Monument` line) with these seven lines:

```js
 {t:'Lay the Monument Foundation',icon:'\u{1F5FF}',p:()=>[completedStages()>=1?1:0,1],c:()=>completedStages()>=1,r:{clay:10}},
 {t:'Fire 5 bricks',icon:'\u{1F9F1}',p:()=>[Math.min(5,S.stats.g.brick||0),5],c:()=>(S.stats.g.brick||0)>=5,r:{sand:6}},
 {t:'Forge 3 steel beams',icon:'\u{1F3D7}️',p:()=>[Math.min(3,S.stats.g.beam||0),3],c:()=>(S.stats.g.beam||0)>=3,r:{clay:8}},
 {t:'Complete the Frame',icon:'\u{1F3DB}️',p:()=>[completedStages()>=2?1:0,1],c:()=>completedStages()>=2,r:{sand:10}},
 {t:'Craft an ornament',icon:'\u{1F48E}',p:()=>[Math.min(1,S.stats.g.ornament||0),1],c:()=>(S.stats.g.ornament||0)>=1,r:{bread:5}},
 {t:'Raise the Spire',icon:'\u{1F5FC}',p:()=>[completedStages()>=4?1:0,1],c:()=>completedStages()>=4,r:{bread:10}},
 {t:'Light the Eternal Flame',icon:'\u{1F525}',p:()=>[S.won?1:0,1],c:()=>!!S.won,r:null},
```

- [ ] **Step 3: Verify quest advancement.**

```js
() => { S.quest=7; S.monu={stage:2,given:{},lit:false};   // Foundation done
        questTick();
        return [S.quest>=8, document.querySelector('#quest .qt')?.textContent]; }
```
Expected: `S.quest>=8` is `true` (its reward 10 clay granted), and the charter shows the next quest ("Fire 5 bricks"). `browser_take_screenshot` of the quest panel.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: extend Guild Charter to the 14-quest Monument arc"
```

---

### Task 10: Trader ledger — new trades

**Files:**
- Modify: `index.html:1114` (`TRADES` — append four entries).

**Interfaces:**
- Produces: `TRADES` includes brick→glass, cloth→ornament, wood→clay, glass→goldbar.

- [ ] **Step 1: Write the failing test.**

```js
() => [TRADES.length, TRADES.some(t=>t.get.goldbar), TRADES.some(t=>t.get.clay)]
```
Expected AFTER: `[11, true, true]`. Before: `[7, false, false]`.

- [ ] **Step 2: Append to `TRADES`** (index.html:1114) — add before the closing `]`:

```js
,{give:{brick:10},get:{glass:6}},{give:{cloth:8},get:{ornament:1}},{give:{wood:15},get:{clay:4}},{give:{glass:6},get:{goldbar:2}}
```

- [ ] **Step 3: Verify a new trade executes.**

```js
() => { trader.active=true; trader.offer={give:{wood:15},get:{clay:4}}; renderTrader();
        S.inv.wood=100; const c0=S.inv.clay;
        document.getElementById('tradeBtn').click();
        return [S.inv.clay-c0, S.inv.wood]; }
```
Expected: `[4, 85]`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add v2 trader deals (glass, ornament, clay, gold bar)"
```

---

### Task 11: Save/load (monu + playSec), v1 migration, duplicate sync, full playthrough

**Files:**
- Modify: `index.html:984-988` (`saveGame`), `index.html:989-999` (`loadGame`), then copy `index.html` → `emberpine-valley.html`.

**Interfaces:**
- Produces: `save-v1` persists `monu` and `playSec`; old saves migrate (a placed monument with no `monu` → `{stage:2,given:{},lit:false}`); new goods default to 0.

- [ ] **Step 1: Write the failing test** (round-trip). Use an async snippet:

```js
async () => { S.monu={stage:3,given:{glass:5},lit:false}; S.playSec=123.4; S.inv.brick=7;
        await saveGame();
        const raw=JSON.parse(localStorage.getItem('emberpine:p:save-v1'));
        return [raw.monu&&raw.monu.stage, raw.monu&&raw.monu.given&&raw.monu.given.glass, Math.round(raw.playSec||0), raw.inv&&raw.inv.brick]; }
```
Expected AFTER: `[3, 5, 123, 7]`. Before: `raw.monu` and `raw.playSec` are `undefined` → `[undefined, undefined, 0, 7]`.

- [ ] **Step 2: Extend `saveGame`** (index.html:985) — add `monu` and `playSec` to the saved object literal (insert after `wonderRewarded:…,`):

```js
    monu:S.monu, playSec:S.playSec,
```

- [ ] **Step 3: Extend `loadGame`** (index.html:992-997). After the existing `S.wonderRewarded=…` line add `S.playSec=s.playSec||0;`. After the buildings-load loop (`for(const b of (s.buildings||[]))…`) add the monu load + migration:

```js
  if(s.monu) S.monu=s.monu;
  else if(Object.values(S.buildings).some(b=>b.type==='monument')) S.monu={stage:2,given:{},lit:false}; // v1 migration: Foundation complete
  else S.monu=null;
```

- [ ] **Step 4: Verify round-trip** (Step 1 → `[3,5,123,7]`). Then verify persistence across reload:

```js
async () => { S.monu={stage:4,given:{},lit:false}; S.playSec=250; await saveGame(); return 'saved'; }
```
`browser_navigate` to the page again, re-enter, then:
```js
() => [S.monu&&S.monu.stage, Math.round(S.playSec), completedStages()]
```
Expected: `[4, 250, 3]`.

- [ ] **Step 5: Verify v1-save migration.** Seed an old-style save (monument building, `won:true`, no `monu`):

```js
() => { const old={inv:{wood:5},name:'Old',id:'pold',score:150,won:true,quest:8,stats:{g:{},b:{monument:1},jobs:0},
          buildings:[{type:'monument',x:56,y:52}]};
        localStorage.setItem('emberpine:p:save-v1', JSON.stringify(old)); return 'seeded'; }
```
`browser_navigate` + re-enter, then:
```js
() => [S.monu&&S.monu.stage, completedStages(), S.won]
```
Expected: `[2, 1, true]` — Foundation treated as complete, won preserved.

- [ ] **Step 6: Full manual playthrough smoke.** Clear the save (`() => { localStorage.clear(); return 'cleared'; }`) then `browser_navigate` + enter as a new settler. Exercise the real interactions (stock inventory via `S.inv` only where gathering would be too slow): place the Monument Foundation from the build bar; confirm Kiln/Glassworks/Forge unlock and the Monument entry disappears; build a Kiln + Forge; feed them; contribute Frame goods through the popup and watch the sprite grow; confirm gold dots appear on the minimap after Walls; reach the Spire and light the Flame. `browser_take_screenshot` at: Foundation placed, Frame popup, Walls-done minimap (gold dots), victory card. `browser_console_messages` (error) shows only the favicon 404 throughout.

- [ ] **Step 7: Sync the duplicate file.**

```bash
cp /home/habiba/emberpine-valley/index.html /home/habiba/emberpine-valley/emberpine-valley.html
diff /home/habiba/emberpine-valley/index.html /home/habiba/emberpine-valley/emberpine-valley.html && echo IDENTICAL
```
Expected: `IDENTICAL`.

- [ ] **Step 8: Commit**

```bash
git add index.html emberpine-valley.html
git commit -m "feat: persist monu+playSec, migrate v1 saves, sync duplicate"
```

---

## Self-Review (completed against the spec)

**Spec coverage:**
- New goods + conditional HUD → Task 1 ✓
- New map resources (clay/sand/gold/flax) + minimap gold reveal → Task 2 ✓
- New buildings + recipes + dual-recipe smelter → Task 3 ✓
- Staged Monument state/placement/helpers → Task 4 ✓
- Contribute flow + stage advancement + bonuses/banners → Task 5 ✓
- Five-state sprite → Task 6 ✓
- Building availability gating (🔒 + stage name) → Task 7 ✓
- Feast, victory ceremony (fireworks, villager 🎉, stats, rank, keep-playing), `S.playSec` → Task 8 ✓
- Quest chain 8–14 → Task 9 ✓
- Trader deals → Task 10 ✓
- Save compatibility + `monu`/`playSec` + v1 migration + duplicate sync → Task 11 ✓
- Testing plan (fresh boot, gating, chain smoke, contribute flow, feast→ceremony, save/reload, migration, regression) → distributed across each task's verification + Task 11 Step 6 ✓
- "Multiplayer Wonder unchanged and separate" → no task touches Wonder code ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact code. ✓

**Type consistency:** `S.monu={stage,given,lit}`, `completedStages()`, `monBuilding()`, `advanceStage()`, `contributeMonu()`, `openMonumentPopup()`, `lightFlame()`, `showVictory()`, `RECIPES.smelter` array, `ERA` map, `NEWRAW`/`NEWCRAFT`/`ownsGood` — used consistently across Tasks 4→11. `openMonumentPopup` is created in Task 5 and extended (Feast branch) in Task 8; the Task 8 edit replaces the non-lit body block defined in Task 5. ✓

**Edge cases from spec:** villagers may gather inert goods (accepted — no gating on gathering); idle production buildings no-op (`recs.find(...)` returns `undefined` → no crash); feast button disabled until 15 bread; contribution one-way (no refund); popup shows given/needed per good; migrated v1 saves keep `won` but still require the feast for the new ceremony. ✓

**No test-only production code:** verification uses bare-global access from `browser_evaluate`; no debug hooks are added to `index.html`. ✓
