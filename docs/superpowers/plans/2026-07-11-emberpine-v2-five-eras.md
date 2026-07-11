# Emberpine Valley v2 — "The Five Eras" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace v1's instant Monument-placement win with a five-stage Monument construction arc fed by a deeper economy (4 map resources, 5 buildings, 10 new goods, 5-deep recipe chains, extended quests, a victory ceremony), keeping the game a single self-contained `index.html`.

**Architecture:** Pure data-driven extension of the existing global tables (`baseRes`/`gen()`, `RES_INFO`, `JOBS`, `BUILDS`, `RECIPES`, `QUESTS`, `TRADES`, `S.inv`) plus one new `MONUMENT_STAGES` table and one small `S.monu={stage,given,lit}` state object. No new subsystems, no module split. The staged Monument reuses the existing walk-up-and-contribute popup pattern (from the co-op Wonder) and the existing `productionTick`, `spawnBurst`, `spawnFireworks`, and `#victory` overlay.

**Tech Stack:** Vanilla JS in a single HTML file, Canvas 2D rendering, `localStorage` persistence. No build step, no dependencies. Verified in-browser with Playwright MCP against a local `python3 -m http.server` (the game blocks `file://` — see Global Constraints).

## Global Constraints

- **Single file.** All game code lives in `index.html`. A duplicate `emberpine-valley.html` exists and MUST stay byte-identical to `index.html` (synced in the final task). Do not introduce external files, CDN scripts, or a build step.
- **Save key stays `save-v1`.** Extend the saved object with new fields; never rename the key. Old saves must load (migration in Task 12).
- **New goods must be listed in the `S.inv` literal** (index.html:337) so `Object.assign(S.inv, saved.inv||{})` defaults them to 0 for old saves.
- **`const S` is not a `window` global.** Tests reach game internals through the `window.EV` debug hook added in Task 1. Function declarations (`gain`, `placeBuilding`, `darknessNow`, …) already become `window` globals and may be called/overridden directly in tests.
- **Verify in-browser over HTTP.** `file://` is blocked (memory: `playwright-mcp-blocks-file-url`). Every verification serves the folder with `python3 -m http.server 8151` and navigates Playwright to `http://localhost:8151/index.html`.
- **Force daylight in tests** with `EV to override; villagers stop working at night (`darknessNow()>.52`). Set `window.darknessNow=()=>0` after load so gathering/production runs deterministically.
- **Commit after every task** with the exact message given in the task's final step.

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
 {name:'Foundation',   need:{stone:40,plank:20}, bonus:50,  banner:'⛏️ The Foundation is laid — the Era of Stone begins'},
 {name:'Frame',        need:{brick:24,beam:16},  bonus:50,  banner:'🏗️ The Frame rises — the Era of Iron begins'},
 {name:'Walls',        need:{glass:20,brick:20}, bonus:50,  banner:'🧱 The Walls stand — the Era of Craft begins'},
 {name:'Spire',        need:{cloth:12,ornament:8},bonus:50, banner:'🗼 The Spire pierces the sky — the Era of Splendor begins'},
 {name:'Eternal Flame',need:{bread:15},          bonus:200, banner:'🔥 The Eternal Flame is lit — Emberpine is complete'},
];
```

**Stage model (single source of truth):**
- `S.monu` is `null` before the Foundation is placed.
- Placing the Monument pays `MONUMENT_STAGES[1].need` (40 stone + 20 plank, via `BUILDS.monument.cost`) and sets `S.monu={stage:2,given:{},lit:false}` — i.e. Foundation (stage 1) is done, Frame (stage 2) is now under construction.
- `S.monu.stage` = the stage currently under construction (2, 3, 4). Stage 5 (the Flame) is lit by the Feast button, which sets `S.monu.lit=true`.
- `completedStages()` = `S.monu ? (S.monu.lit ? 5 : S.monu.stage-1) : 0`. Drives sprite state, era-gating, gold reveal, and quests.
- Stages 2–4 fill via the walk-up **Contribute** buttons. Stage 5 is the single-click **Feast** button (needs 15 bread). Score bonuses: +50 per completed stage 1–4, +200 for the Flame.

Build-bar era gating (`completedStages()` threshold to unlock):
```
kiln:1, glassworks:1, forge:1,   loom:2, gilder:2
```

Quest chain (replaces the single v1 quest #8 "Raise the Monument"; quests 1–7 unchanged):
```
8.  Lay the Monument Foundation   c: completedStages()>=1   r:{clay:10}
9.  Fire 5 bricks                 c: (S.stats.g.brick||0)>=5   r:{sand:6}
10. Forge 3 steel beams           c: (S.stats.g.beam||0)>=3    r:{clay:8}
11. Complete the Frame            c: completedStages()>=2   r:{sand:10}
12. Craft an ornament             c: (S.stats.g.ornament||0)>=1 r:{bread:5}
13. Raise the Spire               c: completedStages()>=4   r:{bread:10}
14. Light the Eternal Flame       c: !!S.won                r:null
```

`TRADES` additions (index.html:1114):
```
{give:{brick:10},get:{glass:6}},{give:{cloth:8},get:{ornament:1}},{give:{wood:15},get:{clay:4}},{give:{glass:6},get:{goldbar:2}}
```

Victory rank titles by `S.score`: `<300` Settler · `<600` Builder · `<1000` Architect · `>=1000` Master Builder of Emberpine.

---

## File Structure

- `index.html` — the entire game; every task edits this one file. Edits are localized to the existing table/function it names, following the established terse single-file style (no reformatting of untouched code).
- `emberpine-valley.html` — byte-identical duplicate served nowhere important; re-synced from `index.html` in Task 12.
- `docs/superpowers/plans/2026-07-11-emberpine-v2-five-eras.md` — this plan.

Because it is one file, tasks are **sequential** (no parallel edits). Each task is an independently reviewable slice that leaves the game booting and playable.

---

## How to verify a task (shared procedure)

1. From `/home/habiba/emberpine-valley`, start a server **once** (leave it running across tasks):
   `python3 -m http.server 8151` (run in background).
2. In Playwright MCP: `browser_navigate` to `http://localhost:8151/index.html`.
3. Enter the valley: `browser_evaluate` → `document.getElementById('nameInput').value='Tester'; document.getElementById('enterBtn').click();` then `window.darknessNow=()=>0;`
4. Run the task's assertion snippet with `browser_evaluate`. Each returns a value; the step states the expected value.
5. `console_error`-free: check `browser_console_messages` shows no uncaught errors.
6. Where a step says "screenshot", `browser_take_screenshot` and eyeball the described visual.

A "test fails first" step means: run the assertion **before** implementing; it should throw or return the wrong value on current code. Then implement, and it returns the expected value.

---

### Task 1: Test hook + server smoke

**Files:**
- Modify: `index.html` (add one debug-export line just before `boot();` at index.html:1538)

**Interfaces:**
- Produces: `window.EV` — `{S, BUILDS, RECIPES, RES_INFO, MONUMENT_STAGES, QUESTS, TRADES, JOBS, gain, placeBuilding, completedStages, monBuilding, advanceStage, lightFlame, bakeMini}`. Later tasks reference `EV.S` etc. in tests. (`completedStages`, `monBuilding`, `advanceStage`, `lightFlame` do not exist yet — add them to the hook as their tasks create them; in Task 1 include only the ones that already exist.)

- [ ] **Step 1: Write the failing check** — with the server running and the page loaded (shared procedure steps 1–3), run:

```js
// browser_evaluate
typeof window.EV
```
Expected now: `"undefined"`.

- [ ] **Step 2: Add the debug hook.** Immediately before `boot();` (index.html:1538) insert:

```js
/* ---- debug/test hook (harmless; exposes read access to game internals) ---- */
window.EV={get S(){return S},BUILDS,RECIPES,RES_INFO,MONUMENT_STAGES:typeof MONUMENT_STAGES!=='undefined'?MONUMENT_STAGES:null,QUESTS,TRADES,JOBS,gain,placeBuilding,bakeMini};
```

(Note: `MONUMENT_STAGES` is guarded because it is added in Task 5; the guard lets Task 1 land first. Update the hook to drop the guard once Task 5 lands, and add `completedStages,monBuilding,advanceStage,lightFlame` to the object in the tasks that define them.)

- [ ] **Step 3: Verify it passes.** Reload the page, re-enter, then:

```js
// browser_evaluate
[typeof window.EV, typeof EV.S.inv.wood, typeof EV.gain]
```
Expected: `["object","number","function"]`.

- [ ] **Step 4: Confirm the game still boots** — `browser_take_screenshot`; expect the valley with the settler, HUD, build bar, and no console errors (`browser_console_messages`).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "test: expose window.EV debug hook for v2 verification"
```

---

### Task 2: New goods in inventory, icons, and conditional HUD chips

**Files:**
- Modify: `index.html:337` (`S.inv` literal), `index.html:838-839` (`ICONS`/`NICE`), `index.html:841` (`RAW`/`CRAFT`, add `NEWRAW`/`NEWCRAFT` + `ownsGood`), `index.html:843-848` (`renderHUD`).

**Interfaces:**
- Produces: `S.inv` contains all 10 new goods (default 0). `ownsGood(k)` → boolean. HUD renders a new-good chip only when `ownsGood(k)` is true.

- [ ] **Step 1: Write the failing test.** After load + re-enter:

```js
// browser_evaluate — expect the new goods to already be tracked at 0
['clay','sand','goldore','flax','brick','glass','beam','cloth','goldbar','ornament'].map(k=>EV.S.inv[k])
```
Expected after implementation: `[0,0,0,0,0,0,0,0,0,0]`. Before: `[undefined, …]`.

- [ ] **Step 2: Extend the `S.inv` literal** (index.html:337). Replace:

```js
  inv:{wood:0,stone:0,ore:0,berry:0,fish:0,egg:0,plank:0,ingot:0,wheat:0,bread:0,tool:0},
```
with:
```js
  inv:{wood:0,stone:0,ore:0,berry:0,fish:0,egg:0,plank:0,ingot:0,wheat:0,bread:0,tool:0,
       clay:0,sand:0,goldore:0,flax:0,brick:0,glass:0,beam:0,cloth:0,goldbar:0,ornament:0},
```

- [ ] **Step 3: Extend `ICONS` and `NICE`** (index.html:838-839). Append inside each object literal, before the closing `}`:

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

- [ ] **Step 5: Update `renderHUD`** (index.html:843-848) to append conditional chips:

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

- [ ] **Step 6: Verify.** Run Step 1's snippet → `[0,0,0,0,0,0,0,0,0,0]`. Then confirm chips are hidden until owned:

```js
// browser_evaluate
const before=document.querySelectorAll('#hud .res').length;
EV.gain('brick',3); renderHUD();
const after=document.querySelectorAll('#hud .res').length;
[before, after, document.getElementById('res-brick')?.textContent]
```
Expected: `after === before+1`, and `res-brick` text is `"3"`. `browser_take_screenshot` → a 🧱3 chip now appears in the HUD; the other 9 new goods do not.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add 10 v2 goods with conditional HUD chips"
```

---

### Task 3: New map resources (gen, RES_INFO, jobs, drawRes, minimap + gated gold reveal)

**Files:**
- Modify: `index.html:344-349` (`RES_INFO`), `index.html:312-331` (`gen()`), `index.html:353-354` (`JOBS.miner`/`JOBS.forager` finds), `index.html:653-673` (`drawRes`), `index.html:820-835` (`bakeMini`/`renderMini`).

**Interfaces:**
- Consumes: `completedStages()` (added in Task 5) for the gated gold reveal. Task 3 lands before Task 5, so guard the call: `(typeof completedStages==='function'?completedStages():0)`. Update to a bare `completedStages()` when Task 5 lands (optional cleanup).
- Produces: `baseRes` may contain `{type:'clay'|'sand'|'gold'|'flax'}`. Miners gather clay/sand/gold; foragers gather flax.

- [ ] **Step 1: Write the failing test.** After load + re-enter:

```js
// browser_evaluate — count new resources on the generated map
const c={clay:0,sand:0,gold:0,flax:0};
for(const k in EV.S){} // noop
for(const k in window.baseRes||{}){const t=baseRes[k].type; if(t in c)c[t]++}
c
```
`baseRes` is a `const` — expose it via the hook. Add `baseRes` to the `window.EV` object in Task 1's hook line, then read `EV.baseRes`. Adjust the snippet to iterate `EV.baseRes`. Expected after implementation: all four counts > 0 (clay/flax uncommon, sand common, gold rare but non-zero on a 110×110 map). Before: all 0.

  > Add `baseRes` to the `window.EV` hook now: `window.EV={…, baseRes, …}`.

- [ ] **Step 2: Extend `RES_INFO`** (index.html:344). Append inside the object:

```js
,clay:{yield:'clay',n:2,time:2.2,emoji:'🧱'},
sand:{yield:'sand',n:2,time:1.8,emoji:'⏳'},
gold:{yield:'goldore',n:1,time:3.0,emoji:'✨'},
flax:{yield:'flax',n:2,time:1.4,emoji:'🌿'}
```

- [ ] **Step 3: Place new resources in `gen()`.** Inside the double loop (index.html:321-325), the existing `else if` chain assigns at most one resource per tile. Immediately after that chain (after the `else if(t===4&&r<.22)…` line, still inside the loop, before the closing `}`), add a second independent roll that only fills tiles with no resource yet:

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

- [ ] **Step 7: Verify resources + gathering.** Run Step 1's snippet (via `EV.baseRes`) → all four counts > 0. Then verify a miner gathers clay by forcing a nearby clay tile and a miner onto it (functional check):

```js
// browser_evaluate — spawn a villager, make it a miner, confirm 'clay' is in its finds
const v=EV.S.villagers[0]; setJob(v,'miner');
[JOBS.miner.finds.includes('clay'), JOBS.miner.finds.includes('gold'), JOBS.forager.finds.includes('flax')]
```
Expected: `[true,true,true]`. `browser_take_screenshot` after panning is optional; visual confirmation of new sprites happens in the full playthrough (Task 12).

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: add clay/sand/gold/flax map resources, jobs, sprites, minimap"
```

---

### Task 4: New buildings, recipes, and dual-recipe smelter

**Files:**
- Modify: `index.html:359-370` (`BUILDS`), `index.html:538` (`prodTimers`), `index.html:539-542` (`RECIPES`), `index.html:544-560` (`productionTick`), `index.html:674` (`BCOLS`).

**Interfaces:**
- Produces: `RECIPES.smelter` is now an **array** of recipe objects (gold first, then ingot). `productionTick` runs the first affordable recipe for each building type. Buildings `kiln, glassworks, forge, loom, gilder` produce `brick, glass, beam, cloth, ornament`.

- [ ] **Step 1: Write the failing test.** After load + re-enter + `window.darknessNow=()=>0`:

```js
// browser_evaluate — place a kiln we own, give it inputs, tick production, expect a brick
EV.S.inv.stone=100; EV.S.inv.wood=100; EV.S.inv.clay=100;
placeBuilding('kiln', EV.S.me.x|0, (EV.S.me.y|0)+3);        // needs 20 stone +10 wood
const b4=EV.S.inv.brick;
for(let i=0;i<12;i++) productionTick(1);                     // >2× the 5s rate
[typeof BUILDS.kiln, EV.S.inv.brick>b4]
```
Expected after implementation: `["object", true]`. Before: `BUILDS.kiln` is `undefined` and `placeBuilding('kiln',…)` toasts "Not enough materials"/does nothing → `false`.

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

- [ ] **Step 4: Update `RECIPES`** (index.html:539-542) — make smelter an array and add the five recipes:

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

- [ ] **Step 5: Generalize `productionTick`** (index.html:544-560) to handle multi-recipe buildings — replace the inner recipe block:

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

- [ ] **Step 6: Add building colors** to `BCOLS` (index.html:674), append before the closing `}`:

```js
,kiln:'#b5643c',glassworks:'#7fa9b0',forge:'#6a6f78',loom:'#b58fb0',gilder:'#c9a94a'
```

- [ ] **Step 7: Verify.** Run Step 1's snippet → `["object", true]`. Then verify the dual-recipe smelter prefers gold:

```js
// browser_evaluate
EV.S.inv.stone=100;EV.S.inv.wood=100;EV.S.inv.ore=0;EV.S.inv.goldore=10;
placeBuilding('smelter',(EV.S.me.x|0)+2,(EV.S.me.y|0)+3);
const gb=EV.S.inv.goldbar, ig=EV.S.inv.ingot;
for(let i=0;i<20;i++)productionTick(1);
[EV.S.inv.goldbar>gb, EV.S.inv.ingot===ig]   // makes gold bars, not ingots, since only goldore present
```
Expected: `[true,true]`. No console errors.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: add kiln/glassworks/forge/loom/gilder + dual-recipe smelter"
```

---

### Task 5: Staged Monument state, placement, and stage helpers

**Files:**
- Modify: `index.html:335-343` (`S` literal: add `monu:null, playSec:0, celebrateUntil:0`), add `MONUMENT_STAGES` after `BUILDS` (index.html:370), `index.html:369` (`BUILDS.monument`), `index.html:615-632` (`placeBuilding`), and add helpers `completedStages()`/`monBuilding()` near the other helpers (index.html:1419-1422). Update the `window.EV` hook to add `completedStages, monBuilding` and drop the `MONUMENT_STAGES` guard.

**Interfaces:**
- Produces: `S.monu` = `null` | `{stage:number, given:{}, lit:boolean}`. `completedStages()` → 0..5. `monBuilding()` → the placed monument building object or `null`. Placing the Monument no longer sets `S.won` (that moves to the Flame in Task 9).

- [ ] **Step 1: Write the failing test.**

```js
// browser_evaluate
[EV.MONUMENT_STAGES?.[2]?.name, typeof completedStages]
```
Expected after: `["Frame","function"]`. Before: `MONUMENT_STAGES` is null (guarded hook) and `completedStages` is `undefined`.

- [ ] **Step 2: Add state fields** to the `S` literal (index.html:341-342). Change the `others:{}…` line and the `stats` line region to include the new fields:

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

- [ ] **Step 4: Retune `BUILDS.monument`** (index.html:369) to the Foundation cost + renamed label:

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

- [ ] **Step 7: Update the `window.EV` hook** (from Task 1): drop the `MONUMENT_STAGES` guard and add helpers:

```js
window.EV={get S(){return S},BUILDS,RECIPES,RES_INFO,MONUMENT_STAGES,QUESTS,TRADES,JOBS,baseRes,gain,placeBuilding,bakeMini,completedStages,monBuilding};
```

- [ ] **Step 8: Verify placement sets stage state and does NOT win.**

```js
// browser_evaluate
EV.S.inv.stone=100;EV.S.inv.plank=100; EV.S.won=false;
placeBuilding('monument',(EV.S.me.x|0)+1,(EV.S.me.y|0)+4);
[JSON.stringify(EV.S.monu), completedStages(), EV.S.won, monBuilding()!==null]
```
Expected: `['{"stage":2,"given":{},"lit":false}', 1, false, true]`.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: add MONUMENT_STAGES, S.monu state, staged Foundation placement"
```

---

### Task 6: Monument contribute popup + stage advancement

**Files:**
- Modify: `index.html:948-962` (canvas `click` handler already opens `openBuildingPopup` for buildings — the monument is a building, so route it), `index.html:923-930` (`openBuildingPopup`), and add `openMonumentPopup`, `contributeMonu`, `advanceStage`, `lastMX/lastMY` near the Wonder popup helpers (index.html:1306). Update `window.EV` to add `advanceStage`.

**Interfaces:**
- Consumes: `S.monu`, `MONUMENT_STAGES`, `completedStages`, `monBuilding`, `ICONS`, `spawnBurst`, `sfx`, `toast`, `renderBuildBar`, `questTick`.
- Produces: clicking the placed Monument opens a staged popup with per-good Contribute buttons (stages 2–4). Meeting a stage's `need` calls `advanceStage()` → +bonus, banner toast, `S.monu.stage++`, `given` reset. (Feast/stage-5 UI is added in Task 9.)

- [ ] **Step 1: Write the failing test.** With a monument placed (from Task 5 state) and stage 2 inputs given directly:

```js
// browser_evaluate — simulate a full stage-2 contribution via the popup handler
EV.S.inv.brick=30;EV.S.inv.beam=20; EV.S.monu={stage:2,given:{},lit:false};
const before=completedStages();
contributeMonu('brick'); contributeMonu('beam');   // gives up to each stage-2 need
[before, completedStages(), EV.S.monu.stage, EV.S.inv.brick, EV.S.inv.beam]
```
Expected after: `[1, 2, 3, 6, 4]` — 24 brick + 16 beam consumed, stage advanced to 3 (completedStages 2). Before: `contributeMonu` is `undefined` → throws.

- [ ] **Step 2: Add the contribute + advance functions** near index.html:1306 (before `openWonderPopup`):

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
  popup.innerHTML='<button class="close">✕</button><h4>🗿 Monument · '+(S.monu.lit?'Complete':MONUMENT_STAGES[S.monu.stage].name)+'</h4>'+body;
  popup.querySelectorAll('.wgive[data-k]').forEach(b=>b.onclick=()=>contributeMonu(b.dataset.k));
  popup.querySelector('.close').onclick=()=>popup.style.display='none';
  popup.style.display='block';
  popup.style.left=clamp(px-130,8,Math.max(8,VW-276))+'px';
  popup.style.top=clamp(py-200,8,Math.max(8,VH-280))+'px';
}
```

- [ ] **Step 3: Route monument clicks to the staged popup.** In `openBuildingPopup` (index.html:923), add at the very top:

```js
function openBuildingPopup(b,px,py){
  if(b.type==='monument'&&S.monu){openMonumentPopup(px,py);return}
  const B=BUILDS[b.type];
  // …unchanged…
```

- [ ] **Step 4: Add `advanceStage`/`contributeMonu` to the hook** (optional but useful): update `window.EV` to include `advanceStage, contributeMonu, openMonumentPopup`.

- [ ] **Step 5: Verify** Step 1's snippet → `[1, 2, 3, 6, 4]`. Then open the popup visually:

```js
// browser_evaluate
EV.S.monu={stage:3,given:{glass:4},lit:false}; EV.S.inv.glass=10;EV.S.inv.brick=10;
openMonumentPopup(400,300);
document.querySelector('#popup h4').textContent
```
Expected: `"🗿 Monument · Walls"`. `browser_take_screenshot` → popup shows Walls with 🪟 4/20 (partial bar) and 🧱 0/20 rows, each with a Give button.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: staged Monument contribute popup + stage advancement"
```

---

### Task 7: Monument five-state sprite

**Files:**
- Modify: `index.html:675-700` (`drawBuilding` — route monument to a new `drawMonument`), add `drawMonument` after `drawBuilding`.

**Interfaces:**
- Consumes: `completedStages()`, `S.monu`, canvas helpers.
- Produces: the placed Monument renders through five growing states + a lit flame when `S.monu.lit`.

- [ ] **Step 1: Write the failing test** (visual + guard). After placing a monument:

```js
// browser_evaluate — no assertion value; confirm no throw when drawing at each stage
EV.S.monu={stage:2,given:{},lit:false}; render();
EV.S.monu={stage:5,given:{},lit:true};  render();
'ok'
```
Expected: `"ok"` with a distinctly taller, flame-topped sprite at `lit`. Before `drawMonument` exists, the monument draws as the generic grey box + 🗿 at every stage (no visual growth) — the test "fails" by inspection (screenshot identical across stages).

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
    cx.fillStyle='rgba(255,180,60,'+(.3)+')';cx.beginPath();cx.arc(sx+sz/2,sy-sz*.5,sz*.7*fl,0,7);cx.fill();
    cx.fillStyle='#e8a33d';cx.beginPath();cx.arc(sx+sz/2,sy-sz*.5,sz*.16*fl,0,7);cx.fill();
    cx.fillStyle='#ffe9a0';cx.beginPath();cx.arc(sx+sz/2,sy-sz*.5,sz*.08*fl,0,7);cx.fill();
  }
  if(cs===0){ // placed but nothing built yet — flag marker
    cx.font=(sz*.5)+'px serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText('🚩',sx+sz/2,sy+sz*.45);
  }
}
```

- [ ] **Step 4: Verify.** Run Step 1's snippet → `"ok"`, no console errors. Screenshot at `cs=1`, `cs=3`, and `lit` (set `EV.S.monu` and call `render()` between shots): the tower must visibly gain tiers and show a glowing flame when lit.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: five-state Monument sprite with lit Eternal Flame"
```

---

### Task 8: Build-bar era gating + monument entry lifecycle + CSS

**Files:**
- Modify: `index.html:39` (add `.bbtn.eralock` CSS), `index.html:861-872` (`renderBuildBar`).

**Interfaces:**
- Consumes: `completedStages()`, `MONUMENT_STAGES`, `S.monu`.
- Produces: Kiln/Glassworks/Forge greyed with 🔒 until `completedStages()>=1`; Loom/Gilder until `>=2`. The Monument entry shows only until placed (then hidden). Era-locked buttons are non-selectable and show the unlocking stage name.

- [ ] **Step 1: Write the failing test.** Fresh state, no monument:

```js
// browser_evaluate
EV.S.monu=null; renderBuildBar();
const kiln=[...document.querySelectorAll('#buildbar .bbtn')].find(x=>x.textContent.includes('Kiln'));
[kiln?.classList.contains('eralock'), kiln?.textContent.includes('🔒')]
```
Expected after: `[true, true]`. Before: kiln button either absent or not era-locked (no `eralock` class).

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
// browser_evaluate
EV.S.monu=null; renderBuildBar();
const locked=[...document.querySelectorAll('#buildbar .bbtn')].filter(x=>x.classList.contains('eralock')).map(x=>x.querySelector('.bn').textContent);
EV.S.monu={stage:2,given:{},lit:false}; renderBuildBar();   // Foundation done
const afterFoundation=[...document.querySelectorAll('#buildbar .bbtn')].filter(x=>x.classList.contains('eralock')).map(x=>x.querySelector('.bn').textContent);
const monShown=[...document.querySelectorAll('#buildbar .bbtn')].some(x=>x.textContent.includes('Monument'));
[locked.sort(), afterFoundation.sort(), monShown]
```
Expected: `[["Forge","Gilder","Glassworks","Kiln","Loom"], ["Gilder","Loom"], false]` — after Foundation, kiln/glassworks/forge unlock, loom/gilder stay locked, and the Monument entry disappears. `browser_take_screenshot` → 🔒 chips visible on locked buttons.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: era-gated build bar with lock chips; hide Monument once placed"
```

---

### Task 9: Endgame — playSec, Feast button, Flame lighting, victory ceremony

**Files:**
- Modify: `index.html:1518-1532` (`loop` — accumulate `S.playSec`), `index.html:260-264` (`#victory` overlay text stays generic; content set in JS), add `lightFlame`/`showVictory`/celebration FX, extend `openMonumentPopup` (Task 6) with the Feast button, extend `ambienceTick` (index.html:1057) with celebration fireworks, extend `render` (index.html:789) with villager 🎉 emotes. Update `window.EV` to add `lightFlame`.

**Interfaces:**
- Consumes: `completedStages`, `monBuilding`, `MONUMENT_STAGES`, `spawnFireworks`, `drawEmote`, `DAYLEN`, `S.stats.g`.
- Produces: `S.playSec` grows while running & unpaused. When Spire is done (`completedStages()>=4`), the Monument popup shows a Feast button; clicking it with ≥15 bread calls `lightFlame()` → consumes 15 bread, `S.monu.lit=true`, +200, `S.won=true`, 10s fireworks + villager celebration, and the victory card.

- [ ] **Step 1: Write the failing test.**

```js
// browser_evaluate — reach Spire-done, stock bread, light the flame
EV.S.monu={stage:5,given:{},lit:false}; EV.S.inv.bread=20; EV.S.won=false;
const s0=EV.S.score;
lightFlame();
[EV.S.monu.lit, EV.S.won, EV.S.inv.bread, EV.S.score-s0, document.getElementById('victory').style.display]
```
Expected after: `[true, true, 5, 200, "flex"]`. Before: `lightFlame` is `undefined` → throws.

- [ ] **Step 2: Accumulate `playSec` in `loop`** (index.html:1520-1525). Inside `if(running&&!paused){ try{ … } }`, add `S.playSec+=dt;` as the first line of the `try`:

```js
    try{
      S.playSec+=dt;
      playerTick(dt);
      for(const v of S.villagers)villagerTick(v,dt);
      productionTick(dt);ambienceTick(dt);
      render();
    }catch(err){ … }
```

- [ ] **Step 3: Add `lightFlame` + `showVictory`** near the Monument helpers (after `contributeMonu`, index.html:1306 region):

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

- [ ] **Step 4: Add the Feast button to `openMonumentPopup`** (Task 6). Change the `else` branch so that when `cs>=4` it shows the feast row instead of contribute rows:

```js
  }else if(cs>=4){
    const need=MONUMENT_STAGES[5].need.bread, can=(S.inv.bread||0)>=need;
    body='<div class="desc">The Spire is raised. Hold the feast to light the Eternal Flame.</div>'+
      '<div class="wrow"><span>🍞</span><span class="wnum">'+(S.inv.bread||0)+'/'+need+'</span>'+
      '<button id="feastBtn" class="wgive"'+(can?'':' disabled')+'>🔥 Hold the Feast</button></div>';
  }else{
    // …existing stage 2–4 contribute rows…
  }
```

And after wiring `.wgive[data-k]` buttons, wire the feast button:

```js
  const fb=popup.querySelector('#feastBtn'); if(fb)fb.onclick=lightFlame;
```

Also update the `<h4>` title expression to tolerate `stage===6`: use `MONUMENT_STAGES[Math.min(5,S.monu.stage)].name`.

- [ ] **Step 5: Celebration fireworks in `ambienceTick`** — add near the top of `ambienceTick` (index.html:1057):

```js
  if(monuFxUntil>now()){const mon=monBuilding();
    if(mon&&Math.random()<dt*3)spawnFireworks(mon.x+.5+(Math.random()-.5)*2, mon.y-1+(Math.random()-.5));}
```

- [ ] **Step 6: Villager 🎉 emotes in `render`** — after the villager draw loop (index.html:788, right after the `for(const v of S.villagers){…}` block closes):

```js
  if(now()<S.celebrateUntil)for(const v of S.villagers)drawEmote(v.x,v.y,'🎉');
```

- [ ] **Step 7: Add `lightFlame` to `window.EV`.**

- [ ] **Step 8: Verify.** Run Step 1's snippet → `[true, true, 5, 200, "flex"]`. Then screenshot mid-ceremony:

```js
// browser_evaluate
EV.S.monu={stage:4,given:{},lit:false}; EV.S.inv.cloth=20;EV.S.inv.ornament=20;
EV.S.monu={stage:5,given:{},lit:false}; EV.S.inv.bread=20;
openMonumentPopup(400,300); document.querySelector('#feastBtn')?.disabled
```
Expected: `false` (feast enabled with 20 bread). Click it (`document.querySelector('#feastBtn').click()`), then `browser_take_screenshot` → victory card reads "THE ETERNAL FLAME" with Days/Goods/Score/Rank; fireworks over the monument. Click "Keep playing" → overlay closes, game continues (`browser_console_messages` clean).

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat: Feast button, Eternal Flame, victory ceremony with fireworks + rank"
```

---

### Task 10: Extend the Guild Charter quest chain (8–14)

**Files:**
- Modify: `index.html:1137-1146` (`QUESTS` — replace the final entry with seven new entries).

**Interfaces:**
- Consumes: `completedStages()`, `S.stats.g`, `S.won`.
- Produces: 14-entry `QUESTS`; the charter now tracks the full Monument arc.

- [ ] **Step 1: Write the failing test.**

```js
// browser_evaluate
[EV.QUESTS.length, EV.QUESTS[7].t, EV.QUESTS[13].t]
```
Expected after: `[14, "Lay the Monument Foundation", "Light the Eternal Flame"]`. Before: `[8, "Raise the Monument", undefined]`.

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
// browser_evaluate — jump to quest 8 and satisfy it
EV.S.quest=7; EV.S.monu={stage:2,given:{},lit:false};   // Foundation done
questTick();
[EV.S.quest>=8, document.querySelector('#quest .qt')?.textContent]
```
Expected: quest index advances past 8 (its reward 10 clay granted), and the charter shows the next quest ("Fire 5 bricks"). `browser_take_screenshot` of the quest panel.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: extend Guild Charter to the 14-quest Monument arc"
```

---

### Task 11: Trader ledger — new trades

**Files:**
- Modify: `index.html:1114` (`TRADES` — append four entries).

**Interfaces:**
- Produces: `TRADES` includes brick→glass, cloth→ornament, wood→clay, glass→goldbar.

- [ ] **Step 1: Write the failing test.**

```js
// browser_evaluate
[EV.TRADES.length, EV.TRADES.some(t=>t.get.goldbar), EV.TRADES.some(t=>t.get.clay)]
```
Expected after: `[11, true, true]`. Before: `[7, false, false]`.

- [ ] **Step 2: Append to `TRADES`** (index.html:1114) — add before the closing `]`:

```js
,{give:{brick:10},get:{glass:6}},{give:{cloth:8},get:{ornament:1}},{give:{wood:15},get:{clay:4}},{give:{glass:6},get:{goldbar:2}}
```

- [ ] **Step 3: Verify a new trade executes.**

```js
// browser_evaluate
trader.active=true; trader.offer={give:{wood:15},get:{clay:4}}; renderTrader();
EV.S.inv.wood=100; const c0=EV.S.inv.clay;
document.getElementById('tradeBtn').click();
[EV.S.inv.clay-c0, EV.S.inv.wood]
```
Expected: `[4, 85]`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add v2 trader deals (glass, ornament, clay, gold bar)"
```

---

### Task 12: Save/load (monu + playSec), v1 migration, duplicate sync, full playthrough

**Files:**
- Modify: `index.html:984-988` (`saveGame`), `index.html:989-999` (`loadGame`), then copy `index.html` → `emberpine-valley.html`.

**Interfaces:**
- Consumes: everything above.
- Produces: `save-v1` persists `monu` and `playSec`; old saves migrate (a placed monument with no `monu` → `{stage:2,given:{},lit:false}`); new goods default to 0.

- [ ] **Step 1: Write the failing test** (round-trip persistence):

```js
// browser_evaluate
EV.S.monu={stage:3,given:{glass:5},lit:false}; EV.S.playSec=123.4; EV.S.inv.brick=7;
await saveGame();
const raw=JSON.parse(localStorage.getItem('emberpine:p:save-v1'));
[raw.monu?.stage, raw.monu?.given?.glass, Math.round(raw.playSec), raw.inv?.brick]
```
Expected after: `[3, 5, 123, 7]`. Before: `raw.monu` and `raw.playSec` are `undefined`.

- [ ] **Step 2: Extend `saveGame`** (index.html:985) — add `monu` and `playSec` to the saved object literal:

```js
  await store.set('save-v1',{inv:S.inv,name:S.me.name,id:S.me.id,x:S.me.x,y:S.me.y,score:S.score,won:S.won,msgShown:S.msgShown,quest:S.quest,stats:S.stats,muted:S.muted,wonderRewarded:!!S.wonderRewarded,
    monu:S.monu, playSec:S.playSec,
    villagers:S.villagers.map(v=>({name:v.name,color:v.color,job:v.job,hasTool:v.hasTool,xp:v.xp||0})),
    buildings:Object.values(S.buildings).filter(b=>b.mine).map(b=>({type:b.type,x:b.x,y:b.y,store:b.store}))});
```

- [ ] **Step 3: Extend `loadGame`** (index.html:992-997). After the existing `S.wonderRewarded=…` line, add `playSec`, and after the buildings-load loop add the `monu` load + migration:

```js
  S.playSec=s.playSec||0;
  // …existing inv/stats/pos/buildings/villagers loading…
  // (after: for(const b of (s.buildings||[]))S.buildings[key(b.x,b.y)]={...b,mine:true};)
  if(s.monu) S.monu=s.monu;
  else if(Object.values(S.buildings).some(b=>b.type==='monument')) S.monu={stage:2,given:{},lit:false}; // v1 migration: Foundation complete
  else S.monu=null;
```

- [ ] **Step 4: Verify round-trip** (Step 1 snippet → `[3,5,123,7]`) and reload persistence:

```js
// browser_evaluate — write a save, reload the page, confirm monu survived
EV.S.monu={stage:4,given:{},lit:false}; EV.S.playSec=250; await saveGame(); 'saved'
```
Then `browser_navigate` to the page again, re-enter, and:
```js
// browser_evaluate
[EV.S.monu?.stage, Math.round(EV.S.playSec), completedStages()]
```
Expected: `[4, 250, 3]`.

- [ ] **Step 5: Verify v1-save migration.** Simulate an old save (monument building, `won:true`, no `monu`):

```js
// browser_evaluate
const old={inv:{wood:5},name:'Old',id:'pold',score:150,won:true,quest:8,stats:{g:{},b:{monument:1},jobs:0},
  buildings:[{type:'monument',x:56,y:52}]};
localStorage.setItem('emberpine:p:save-v1', JSON.stringify(old)); 'seeded'
```
Then `browser_navigate` + re-enter, and:
```js
// browser_evaluate
[EV.S.monu?.stage, completedStages(), EV.S.won]
```
Expected: `[2, 1, true]` — Foundation treated as complete, won preserved (but the Flame still requires the feast for the new ceremony).

- [ ] **Step 6: Full manual playthrough smoke** (no injection). Clear the save (`localStorage.clear()` then reload), enter as a new settler, and exercise the loop end-to-end using `EV`-assisted shortcuts only where gathering would be too slow — but confirm the real interactions work: place the Monument Foundation from the build bar, verify Kiln/Glassworks/Forge unlock, build a Kiln + Forge, feed them (via a stocked `EV.S.inv`), contribute Frame goods through the popup, watch the sprite grow, reveal gold on the minimap after Walls, and light the Flame. `browser_take_screenshot` at: Foundation placed, Frame popup, Walls-done minimap (gold dots), victory card. Confirm `browser_console_messages` is error-free throughout.

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
- New map resources (clay/sand/gold/flax) → Task 3 ✓
- New goods + conditional HUD → Task 2 ✓
- New buildings + recipes + dual-recipe smelter → Task 4 ✓
- Staged Monument state/placement/helpers → Task 5 ✓
- Contribute flow + stage advancement + bonuses/banners → Task 6 ✓
- Five-state sprite → Task 7 ✓
- Building availability gating (🔒 + stage name) → Task 8 ✓
- Feast, victory ceremony (fireworks, villager 🎉, stats, rank, keep-playing), `S.playSec` → Task 9 ✓
- Quest chain 8–14 → Task 10 ✓
- Trader deals → Task 11 ✓
- Save compatibility + `monu`/`playSec` + v1 migration → Task 12 ✓
- Testing plan (fresh boot, gating, chain smoke, contribute flow, feast→ceremony, save/reload, migration, regression) → distributed across each task's verification + Task 12 Step 6 ✓
- "Multiplayer Wonder unchanged and separate" → no task touches Wonder code ✓

**Placeholder scan:** No TBD/TODO; every code step shows the exact code. ✓

**Type consistency:** `S.monu={stage,given,lit}`, `completedStages()`, `monBuilding()`, `advanceStage()`, `contributeMonu()`, `openMonumentPopup()`, `lightFlame()`, `showVictory()`, `RECIPES.smelter` as array, `ERA` map, `NEWRAW`/`NEWCRAFT`/`ownsGood` — names used consistently across Tasks 5→12. Task 1's `window.EV` hook is progressively extended (guarded `MONUMENT_STAGES`, then `completedStages`/`monBuilding` in Task 5, `advanceStage` in Task 6, `lightFlame` in Task 9). ✓

**Edge cases from spec:** villagers may gather inert goods (accepted — no gating on gathering); idle production buildings no-op (`productionTick` already skips when inputs missing, and the `recs.find(...)` returns `undefined` → no crash); feast button disabled until 15 bread; contribution one-way (no refund path); Monument popup shows given/needed per good. ✓
