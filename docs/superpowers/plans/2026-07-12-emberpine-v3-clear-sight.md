# Emberpine Valley v3 "Clear Sight" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all item/building emoji with one cohesive inline-SVG icon set (HTML + canvas render paths) and tidy the surfaces they live in.

**Architecture:** One `ICON_SVG` map (key → 24×24 SVG string) is the single source of truth. `iconHTML(key)` wraps it for innerHTML surfaces; `drawIcon(ctx,key,…)` blits a preloaded data-URI rasterization for the canvas. Every current `ICONS[k]` / `B.ico` emoji injection is rerouted through those two functions. Presentation-only: no state, save, or gameplay changes.

**Tech Stack:** Vanilla JS in a single `index.html`; verification via `node --check` + Playwright against `python3 -m http.server 8901`.

## Global Constraints

- Single self-contained `index.html`; no external files/CDNs/build step. All SVG as JS strings.
- `emberpine-valley.html` must be byte-identical to `index.html` at final commit (`cp index.html emberpine-valley.html`).
- No change to `store` / `save-v1` shape; `S` gains no new persisted fields.
- SVG icons: `viewBox="0 0 24 24"`, ~2px safe margin, 2px ink outline `#2b2620`, flat fills only, **no external refs / filters / fonts** (external refs would taint the canvas). Aim <~400 bytes each.
- Palette: wood `#8a6b45` · stone `#9a978e` · iron `#7a6a5a` · plant `#5aa06a` · water `#5b8fb0` · amber `#e8a33d` · clay `#b0563b` · bread `#d9a05f` · gold `#f4c542` · glass `#bcd6e0` · cloth `#b58fb0` · ink `#2b2620`.
- Player emotes (`EMOTES`), toast/hint prose emoji, splash text: **stay emoji**. `toast()` uses `textContent`, so toasts can never carry HTML icons — where a toast currently embeds `ICONS[k]`, switch to the `NICE[k]` name (e.g. `+3 Wood`).
- Verify in-browser via http.server (game blocks `file://`); force daylight in tests with `darknessNow=()=>0`.
- Commit after every task; push only in Task 5.

**Reference — current emoji sites in `index.html` (line numbers as of commit e073575):** harvest toast 627 · built toast 658 · drawBuilding glyph 743–748 · ICONS/NICE maps 927–930 · chipHtml 935 · HUD villager chip 940 · costStr 955 · build bar 966/971 · recruit 998 · building popup title 1032 · relic toast 1208 · trader 1240 · quest reward toast 1274 · quest icon 1287 · ledger tally 1341 · feast row 1482 · contribute rows 1488 · Wonder rows 1505.

---

### Task 1: Icon infrastructure + 5-icon mockup gate

**Files:**
- Modify: `index.html` (CSS block ~line 27; JS before `const ICONS=` ~line 926)

**Interfaces:**
- Produces: `ICON_SVG` (map key→svg string, plus `_missing`), `iconHTML(key,cls)` → HTML string, `drawIcon(cx,key,cxPx,cyPx,sizePx)` → boolean (drew or not), `iconImg` preload cache. Later tasks only add `ICON_SVG` entries and call these two functions.

- [ ] **Step 1: Add the `.ic` CSS rule** right after the `.res .ico` rule:

```css
.ic{display:inline-flex;vertical-align:-2px}
.ic svg{width:1em;height:1em;display:block}
```

- [ ] **Step 2: Add the icon system** immediately above `const ICONS={…}`:

```js
/* ============ v3 icon system ============ */
const ICON_SVG={
 _missing:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4" fill="#9a978e" stroke="#2b2620" stroke-width="2"/><text x="12" y="17" font-size="13" font-weight="800" text-anchor="middle" fill="#2b2620">?</text></svg>',
 wood:'<svg viewBox="0 0 24 24"><rect x="2" y="8" width="17" height="8" rx="3" fill="#8a6b45" stroke="#2b2620" stroke-width="2"/><ellipse cx="19" cy="12" rx="3" ry="4" fill="#d9b98a" stroke="#2b2620" stroke-width="2"/><ellipse cx="19" cy="12" rx="1.2" ry="1.8" fill="#8a6b45"/></svg>',
 stone:'<svg viewBox="0 0 24 24"><path d="M6 19 3 12l6-7 9 2 3 8-5 4z" fill="#9a978e" stroke="#2b2620" stroke-width="2" stroke-linejoin="round"/><path d="M9 5l3 7-6 7M12 12l9-5" fill="none" stroke="#6f6d66" stroke-width="1.5"/></svg>',
 clay:'<svg viewBox="0 0 24 24"><path d="M4 17c0-5 3-9 8-9s8 4 8 9c0 2-3 3-8 3s-8-1-8-3z" fill="#b0563b" stroke="#2b2620" stroke-width="2"/><path d="M8 12c1-2 3-3 5-3" fill="none" stroke="#d98a6a" stroke-width="1.6" stroke-linecap="round"/></svg>',
 goldbar:'<svg viewBox="0 0 24 24"><path d="M6 9h12l3 8H3z" fill="#f4c542" stroke="#2b2620" stroke-width="2" stroke-linejoin="round"/><path d="M7 12h7" stroke="#fff3c0" stroke-width="1.8" stroke-linecap="round"/></svg>',
 brick:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="11" rx="1.5" fill="#b0563b" stroke="#2b2620" stroke-width="2"/><path d="M3 12.5h18M9 7v5.5M15 12.5V18" stroke="#7d3a26" stroke-width="1.6"/></svg>',
};
function iconHTML(k,cls){return '<span class="ic'+(cls?' '+cls:'')+'" title="'+(NICE[k]||'')+'">'+(ICON_SVG[k]||ICON_SVG._missing)+'</span>'}
const iconImg={};
function preloadIcons(){for(const k in ICON_SVG){const im=new Image();im.onload=()=>{im.ready=true};im.src='data:image/svg+xml;utf8,'+encodeURIComponent(ICON_SVG[k]);iconImg[k]=im}}
function drawIcon(c2,k,px,py,sz){const im=iconImg[k]||iconImg._missing;if(!im||!im.ready)return false;c2.drawImage(im,px-sz/2,py-sz/2,sz,sz);return true}
preloadIcons();
```

(`iconHTML` references `NICE`, which is declared with `const` *after* this block — so place the block **above** `ICONS` but call `iconHTML` only at render time, which is how every surface already works. `preloadIcons()` at the end of the block is safe: it touches only `ICON_SVG`.)

- [ ] **Step 3: Syntax check** — `sed -n '/^<script>$/,/^<\/script>$/p' index.html | sed '1d;$d' > /tmp/g.js && node --check /tmp/g.js` → OK.

- [ ] **Step 4: Mockup gate (art direction check).** Serve, boot past splash, then inject a comparison strip and screenshot:

```js
// browser_evaluate
() => { const d=document.createElement('div');
  d.style.cssText='position:fixed;top:80px;left:20px;z-index:999;background:#efe3c2;padding:10px;font-size:16px;display:flex;gap:8px;align-items:center';
  d.innerHTML=['wood','stone','clay','goldbar','brick'].map(k=>iconHTML(k)).join('')
    +'<span style="font-size:32px">'+['wood','stone','clay','goldbar','brick'].map(k=>iconHTML(k)).join('')+'</span>';
  document.body.appendChild(d); return 'ok'; }
```

Screenshot and **eyeball at 16px**: every silhouette distinct? clay vs stone vs brick unmistakable? Outline weight consistent? Adjust the five SVGs until yes — they set the style for all 37.

- [ ] **Step 5: Verify canvas path** — `browser_evaluate`: `() => drawIcon(cv.getContext('2d'),'wood',50,50,24)` → `true` (after ~1s for preload).

- [ ] **Step 6: Commit** — `git add index.html && git commit -m "feat(v3): icon system infra (ICON_SVG/iconHTML/drawIcon) + 5 mock icons"`

---

### Task 2: All 21 good icons, wired into every HTML surface

**Files:**
- Modify: `index.html` — `ICON_SVG` map; lines 627, 935, 940, 955, 998 (via costStr), 1208, 1240, 1274, 1287–1289, 1341, 1482, 1488, 1505

**Interfaces:**
- Consumes: `ICON_SVG`, `iconHTML` from Task 1.
- Produces: `ICON_SVG` entries for every key in `ICONS` (wood stone ore berry fish egg plank ingot wheat bread tool clay sand goldore flax brick glass beam cloth goldbar ornament) + `villagers`.

- [ ] **Step 1: Author the remaining 16 good SVGs** in the Task-1 style (2px ink outline, flat fills, palette). Silhouette briefs — each must read by shape alone at 16px:
  - `ore` dark rock `#7a6a5a` + 3 lighter nuggets · `berry` 3 water-blue circles on a plant-green leaf · `fish` side-profile fish, water-blue, round eye · `egg` cream egg, brown speckles · `plank` flat thin board (long low rect), wood tones + 2 grain lines · `ingot` steel trapezoid `#9a978e`, no shine mark · `wheat` amber sheaf: 3 stalks + head grains · `bread` bread-tan loaf, 2 score marks · `tool` hammer at 45°, iron head + wood handle · `sand` low dune heap, amber-sand `#e0c98a`, dotted grains · `goldore` = `stone` silhouette in `#7a6a5a` with 3 gold `#f4c542` vein strokes (contrast to plain stone AND to goldbar) · `flax` slender plant-green stalk + 3 water-blue buds · `glass` upright pane `#bcd6e0` at slight skew + white highlight streak · `beam` I-beam end profile (⌶) in steel grey (contrast to flat plank) · `cloth` folded bolt, cloth-violet, 2 fold lines · `ornament` faceted diamond-cut gem, gold + amber facets.
- [ ] **Step 2: Confusable-pair check** — inject a strip (as Task 1 Step 4) with `stone clay brick / goldore goldbar ingot / plank beam / glass ornament` at 16px; screenshot; iterate until each pair is unmistakable.
- [ ] **Step 3: Wire HTML surfaces** (mechanical, one line each):
  - 935 `chipHtml`: `'<span class="ico">'+ICONS[k]+'</span>'` → `iconHTML(k,'ico')` (drop the old span; add `.ic.ico{font-size:15px}` next to the old `.res .ico` rule).
  - 940 villagers chip: add a `villagers` icon (two settler silhouettes, amber+clay) and use `iconHTML('villagers','ico')`.
  - 955 `costStr`: `(([k,v])=>v+ICONS[k])` → `(([k,v])=>v+' '+iconHTML(k))` (thin space). Build bar, recruit, quest reward line, trader all inherit.
  - 1287 quest icon: `q.icon` still emoji in the QUESTS table — leave the table, but render `'<div class="qt">'+q.icon+…` unchanged **only** for the two non-good quest icons (⚒️ etc.); where a quest reward renders via `costStr` it's already covered. (Quest title emoji are prose-adjacent; spec: leave.)
  - 1482 feast row `'<span>🍞</span>'` → `iconHTML('bread')`; 1488 + 1505 contribute/Wonder rows `'<span>'+ICONS[k]+'</span>'` → `iconHTML(k)`.
  - 1341 ledger tally: `ICONS[e[0]]+' '+e[1]` → `iconHTML(e[0])+' '+e[1]` (ledger rows are innerHTML — confirm; they are, via `renderLedger`).
  - Toasts (627 harvest, 1208 relic, 1274 quest reward): replace `ICONS[x]` with `' '+NICE[x]` (textContent — HTML would show as source).
- [ ] **Step 4: Syntax check + boot** — node --check OK; boot with a full inventory (`for(const k in S.inv)S.inv[k]=9;renderHUD()`), screenshot HUD; every chip a distinct SVG, no `?` fallbacks, console clean.
- [ ] **Step 5: Surface sweep screenshots** — build bar costs, recruit button, trader row (force via `renderTrader`-equivalent or wait), quest reward line, contribute popup rows (set `S.monu={stage:2,given:{}}` and open Monument popup), ledger. All show SVG icons.
- [ ] **Step 6: Commit** — `git commit -m "feat(v3): 21 good icons wired into HUD, costs, popups, ledger, trader"`

---

### Task 3: 16 building icons — build bar, popups, and on-map canvas

**Files:**
- Modify: `index.html` — `ICON_SVG` map; `BUILDS` (no shape change — `ico` field becomes unused except fallback); lines 658, 743–748, 966, 971, 1032

**Interfaces:**
- Consumes: `ICON_SVG`, `iconHTML`, `drawIcon`.
- Produces: `ICON_SVG` entries `sawmill smelter farm dock bakery workshop kiln glassworks forge loom gilder torch path crate hall`.

- [ ] **Step 1: Author 15 building SVGs** (monument excluded — custom `drawMonument` sprite). Briefs: `sawmill` circular saw blade, steel teeth + wood base · `smelter` stone furnace arch + amber ember · `farm` three brown furrows + green sprout · `dock` two wood posts + water line + hook · `bakery` oven arch with bread-tan loaf inside · `workshop` iron anvil + hammer · `kiln` domed clay kiln, dark fire mouth + ember · `glassworks` glass flask/pane with blowpipe diagonal · `forge` anvil + 3 amber sparks (differs from workshop by sparks/no hammer) · `loom` upright frame + vertical threads (cloth-violet) · `gilder` gold crown on pedestal · `torch` post + amber flame · `path` 3 offset paving stones · `crate` slatted wood box · `hall` columned hall + amber pennant.
- [ ] **Step 2: Build bar** — 966 and 971: `'<span class="bi">'+B.ico+'</span>'` → `'<span class="bi">'+iconHTML(t)+'</span>'`; add `.bi .ic{font-size:20px}` (or set on `.bi`). Keep 🔒 text (spec: optional, keep).
- [ ] **Step 3: Building popup title** — 1032: `B.ico+' '+B.name` → `iconHTML(b.type)+' '+B.name`.
- [ ] **Step 4: Built toast** — 658: `toast(B.ico+' '+B.name+' built!')` → `toast(B.name+' built!')` (textContent).
- [ ] **Step 5: On-map canvas** — in `drawBuilding` (743–748): keep the colored `BCOLS` box; replace the `cx.font=…serif; cx.fillText(ico,…)` glyph with `drawIcon(cx,b.type==='hall'?'hall':b.type,sx+sz/2,sy+sz/2,sz*.55)`. When `drawIcon` returns false (first frames), draw nothing extra — box only. Monument/flag branches (780/1526/1536) untouched.
- [ ] **Step 6: Verify** — node --check; then in-browser: place one of each building via evaluate (`S.buildings[key(x,y)]={type:t,x,y,mine:true}` on passable tiles), screenshot at `ZOOM=.55` and `ZOOM=1.9` — crisp glyphs, no emoji, no missing-icon `?`; build bar + popup screenshots.
- [ ] **Step 7: Commit** — `git commit -m "feat(v3): building icons in build bar, popups, and on-map canvas"`

---

### Task 4: Readability pass

**Files:**
- Modify: `index.html` — CSS only (HUD chip, `.bc` cost line, `.wrow`), plus any spacing regressions found by screenshot

- [ ] **Step 1: HUD chips** — standardize: `.res{gap:5px;padding:3px 9px}` (match current values if already equal — change only what's inconsistent); icon vertically centered on the count baseline (the `.ic` `vertical-align:-2px` from Task 1 — tune to the font).
- [ ] **Step 2: Cost lines** — `.bc .ic svg,.qr .ic svg{width:1em;height:1em}` already inherited; ensure `.bc{display:flex;align-items:center;gap:2px;flex-wrap:wrap;justify-content:center}` keeps `n icon n icon` pairs from wrapping mid-pair (wrap between costs is fine). Screenshot build bar at 360px width (mobile) — single-line chips still scroll, costs legible.
- [ ] **Step 3: Contribute/Wonder rows** — icon → bar → count → button alignment holds (`.wrow` is flex already); tune `.wrow .ic{font-size:14px}`.
- [ ] **Step 4: Stretch items — decide and record:** job labels, clock glyphs, 🔒, category separators stay as-is (spec marks all four stretch; separators risk muscle-memory break). Note the decision in the commit message.
- [ ] **Step 5: Screenshots** — desktop (1280) + mobile (390×844 emulation) of HUD, build bar, quest panel, a contribute popup. Compare against Task-2/3 screenshots for regressions.
- [ ] **Step 6: Commit** — `git commit -m "polish(v3): readability pass on HUD, cost labels, popup rows (stretch items deferred)"`

---

### Task 5: Full QA, duplicate sync, deploy

**Files:**
- Modify: `emberpine-valley.html` (sync); no source changes except QA fixes

- [ ] **Step 1: Icon completeness audit** — `browser_evaluate`: every key of `ICONS` and every `BUILDS` key (+`hall`,`villagers`) exists in `ICON_SVG`; `Object.values(iconImg).every(i=>i.ready)` after load; console has no errors besides the favicon 404.
- [ ] **Step 2: Leftover-emoji grep** — `grep -n "ICONS\[" index.html` → remaining uses must be toast/`NICE` sites only (627/1208/1274 rewritten — expect zero icon-emoji injections in HUD/build/popup contexts). `B.ico` may remain in the `BUILDS` table but must have no render call sites.
- [ ] **Step 3: Regression sweep** — fresh boot → gather, build, assign jobs OK; pause menu (Esc) + localStorage save/reload OK; v2 Monument arc: set `S.monu={stage:2,given:{}}`, contribute bricks/beams via popup, stage advances; feast/ceremony still fires (set stage 5 prereqs). Console clean.
- [ ] **Step 4: Cross-browser raster sanity** — screenshot map icons at DPR 1 and 2 (`browser_resize` / device scale) — no blurry or clipped glyphs.
- [ ] **Step 5: Sync duplicate** — `cp index.html emberpine-valley.html && diff index.html emberpine-valley.html` → identical.
- [ ] **Step 6: Final commit + push + verify live** —

```bash
git add -A && git commit -m "feat(v3): Clear Sight — cohesive SVG icon set + readability pass" && git push
# wait for Pages build == "built", then:
curl -s https://si-abid.github.io/emberpine-valley/ | grep -c ICON_SVG   # ≥1
```

Load the live URL in Playwright, screenshot HUD + map as the shipped proof.
