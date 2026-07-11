# Emberpine Valley v3 — "Clear Sight" UI/UX Design

Date: 2026-07-12
Status: Draft — specced for later implementation (approach approved by user; icon-visual details to confirm at build time)

## Goal

Replace the emoji-per-item and emoji-per-building icons — which are low-legibility, near-duplicated (🟤 clay vs 🪨 stone vs 🟡 goldore vs 🪙 goldbar; 🧱 brick vs 🟤 clay), and inconsistent across operating systems — with **one cohesive custom inline-SVG icon set**, and do a focused **readability pass** on the UI surfaces where those icons live (HUD, build bar, cost labels, popups). Pure presentation change: no gameplay, economy, or save-format changes. Remains a single self-contained `index.html` on GitHub Pages.

## Scope (confirmed with user)

- **In scope:** a custom SVG icon set for all ~21 goods and ~16 buildings; wiring it into every place icons render (HTML + canvas); a readability tidy of the HUD, build bar, and cost/quest/trade/popup labels around those icons.
- **Out of scope:** game logic, the v2 economy/Monument/quest/trader systems, the save format, the co-op Wonder, the world terrain/tree/rock/water/villager sprites (already hand-drawn), and player **emotes** (👋❤️😄⚒️🎉 stay emoji — they're intentional expressive reactions, not UI chrome). No full re-skin of colours/typography (that was the rejected "full overhaul" option).

## Non-negotiable constraints

- Single self-contained `index.html` (keep `emberpine-valley.html` byte-identical, synced at the end). No external files, CDN, fonts beyond those already linked, or build step. All SVG markup is embedded as JS strings.
- No change to `store`/`save-v1` shape. v3 is presentational.
- Verify in-browser over `python3 -m http.server` (the game blocks `file://`).
- Keep the cozy existing palette (parchment/pine/amber/clay/water/ink). Icons draw *from* that palette; they don't introduce a new theme.

## Icon system architecture

Two render targets share one source of truth.

### 1. Source of truth: `ICON_SVG`

A single map from key → compact inline SVG string. Keys cover every good and building (and `hall`). All icons use a fixed `viewBox="0 0 24 24"`, a consistent 2px ink outline (`#2b2620`, matching the game's existing sprite outlines), and a small palette (below). Example shape (illustrative, not final art):

```js
const ICON_SVG = {
  wood:  '<svg viewBox="0 0 24 24">…log with rings…</svg>',
  stone: '<svg viewBox="0 0 24 24">…grey faceted rock…</svg>',
  // …one entry per good and building…
};
```

Author guidance: keep each SVG small (aim < ~400 bytes) — no gradients unless cheap, no filters, no external refs (external refs would taint the canvas and break offline/single-file). Use flat fills + the shared outline.

### 2. HTML usage — `iconHTML(key, cls)`

```js
function iconHTML(key, cls){ return '<span class="ic '+(cls||'')+'">'+(ICON_SVG[key]||ICON_SVG._missing)+'</span>'; }
```

- `.ic svg{width:1em;height:1em;display:block}` sized by the parent's `font-size`, so a 16px HUD chip and a 20px build-bar tile both work with no per-call sizing.
- Replaces every current emoji injection: HUD `chipHtml`, build-bar `B.ico`, `costStr` (each cost becomes `<n> <icon>`), quest `q.icon`, trader `costStr`, contribute/Wonder popup rows, building popup title, recruit button, ledger tally.
- `title`/`aria-label` carry the `NICE[key]` name for accessibility and hover.

### 3. Canvas usage — `drawIcon(ctx, key, cx, cy, size)`

On-map buildings currently draw a colored box (`BCOLS`) then `cx.fillText(emoji,…)`. v3 keeps the colored box and swaps the emoji for a rasterized SVG:

- At boot, preload each `ICON_SVG[key]` into an offscreen `Image` via `img.src='data:image/svg+xml;utf8,'+encodeURIComponent(svg)`, cache in `iconImg[key]`, set a `ready` flag on `onload`.
- `drawIcon` does `ctx.drawImage(iconImg[key], cx-size/2, cy-size/2, size, size)` when ready; while not ready (first frames) it falls back to the existing colored box alone (no glyph) — no crash, no layout jump.
- `drawBuilding` replaces its `fillText(ico,…)` with `drawIcon(cx, b.type, sx+sz/2, sy+sz/2, sz*0.55)`; `hall` uses `drawIcon(cx,'hall',…)`. `monument` is unchanged (it already uses the custom `drawMonument`, no emoji).
- SVG data-URIs are self-contained, so they do **not** taint the canvas.

### 4. Fallback

`ICON_SVG._missing` is a neutral "?" tile so a typo or a not-yet-authored key degrades gracefully rather than throwing.

## Visual language

- **Grid:** 24×24, ~2px safe margin, single 2px ink outline (`#2b2620`) on the primary silhouette for cohesion with the world art.
- **Silhouette-first:** every icon must be recognizable by shape alone at 16px (the HUD chip size), because colour is a *secondary* cue (colour-blind-safe, and OS-independent). This directly fixes the clay/stone/goldore/goldbar/brick confusion: distinct silhouettes, not just tints.
- **Palette (from existing theme + a few material tones):** wood-brown `#8a6b45`, stone-grey `#9a978e`, iron-grey `#7a6a5a`, meadow/plant-green `#5aa06a`, water-blue `#5b8fb0`, amber `#e8a33d`, clay-red `#b0563b`, bread-tan `#d9a05f`, gold `#f4c542`, glass-pale `#bcd6e0`, cloth-violet `#b58fb0`, ink outline `#2b2620`. Reuse CSS vars where they exist.
- **Category as secondary cue** (tint family, not the only signal): gathered raws (earthy browns/greys/greens), refined goods (cooler/metallic), food (warm tan), textiles (violet), precious/gold (gold+amber).

### The confusable pairs (must be visually unmistakable)

| Pair | Distinguishing silhouette |
|---|---|
| clay vs stone | clay = smooth rounded lump / small pot form, clay-red; stone = angular grey faceted rock |
| goldore vs stone | goldore = grey rock with bright gold flecks/veins |
| goldbar vs ingot | goldbar = gold trapezoid bar (shiny, gold); ingot = grey/steel bar |
| brick vs clay | brick = crisp rectangular block with mortar lines, kiln-red; clay = soft lump |
| plank vs beam | plank = flat thin board with grain; beam = I-beam cross-section / girder |
| glass vs ornament | glass = square pane with a highlight streak; ornament = faceted gem |

## Icon inventory (~37) — silhouette brief per key

**Gathered raws:** `wood` log w/ end-grain rings · `stone` faceted grey rock · `ore` dark rock w/ metallic nuggets · `berry` cluster of 3 round berries on a leaf · `fish` side-profile fish · `egg` egg (optionally in a nest hint) · `clay` clay-red rounded lump/small pot · `sand` heap of sand / dune with grains · `goldore` grey rock with gold veins · `flax` slender plant with blue buds.

**Refined / crafted:** `plank` flat board w/ grain · `ingot` steel trapezoid bar · `wheat` bundled sheaf · `bread` rounded loaf w/ scored top · `tool` hammer (or hammer+wrench) · `brick` red block w/ mortar lines · `glass` pane w/ highlight · `beam` I-beam girder · `cloth` folded fabric bolt · `goldbar` gold trapezoid bar w/ shine · `ornament` faceted gem/jewel.

**Buildings:** `sawmill` circular saw blade / sawn log · `smelter` furnace w/ chimney + ember · `farm` furrowed field w/ sprout (or small barn) · `dock` post + hanging line/hook over water line · `bakery` loaf in an oven arch · `workshop` anvil + hammer · `kiln` domed kiln w/ fire mouth · `glassworks` blowpipe + molten gob (or a glass flask) · `forge` anvil w/ spark · `loom` upright loom frame w/ threads · `gilder` crown or gem-on-pedestal · `torch` post w/ flame · `path` paved stones · `crate` wooden box w/ slats · `hall` town-hall with columns + pennant · (`monument` needs no icon — custom sprite).

Each also implicitly defines its HUD/label form (same SVG). Job labels (`JOBS[].label`) and the time-of-day clock (🌅☀️🌇🌙) are **stretch**: convert if cheap, otherwise leave — they are not the reported pain point. Flag at implementation.

## Readability pass (the "+" in the scope)

Focused tidy of the surfaces the icons live in — no full layout redesign:

1. **HUD chips:** keep the v2 conditional new-good rendering and the Raw · Crafted `.hsep` split. Standardize chip padding/gap; icon at ~16px on the baseline of the count; keep `title=NICE[key]`. Ensure the row stays single-line-scrollable on mobile (existing behaviour).
2. **Cost labels (`costStr`):** render each cost as `count`␠`icon` with a hair of spacing and vertical centering, instead of `count`+emoji jammed together. Used in the build bar, quests, trades, recruit — one change, many surfaces improve.
3. **Build bar:** icons at ~20px; keep era-lock treatment but render the lock as a small SVG lock (consistency) instead of 🔒 (optional — keep 🔒 if cheaper). Consider a thin category separator (Gathering | Production | Infra | Monument) — **stretch**, only if it reads cleaner; do not reorder buildings in a way that breaks muscle memory without confirming.
4. **Popups (building / contribute / Wonder):** titles and rows use `iconHTML`. The contribute rows already use `.wrow`/`.wgive`; just swap the good emoji for the icon.
5. **On-map buildings:** colored box + crisp SVG glyph (via `drawIcon`), replacing the emoji glyph.

Keep everything else (panels, colours, fonts, toasts' prose) as-is.

## What explicitly stays emoji

- Player **emotes** (`EMOTES`, keys 1–5, the emote row) — expressive reactions, not UI chrome.
- Occasional **prose emoji in toasts/hints/splash** (e.g. "💾 Progress saved") — these are sentence decoration, not the item/building icon grid the user objected to. Leave unless trivially improved.
- Time-of-day **clock** glyphs — stretch (see above).

## Testing plan (Playwright against local http.server)

1. Boot: every `ICON_SVG` key referenced by `ICONS`/`BUILDS` exists; `iconImg` preloads without console errors; no missing-key fallbacks appear in normal play.
2. HUD: screenshot with a mix of goods owned — all chips show distinct, legible icons at 16px; confusable pairs (clay/stone/goldore/goldbar, brick/clay, plank/beam, glass/ornament) are visually unmistakable.
3. Build bar: screenshot locked + unlocked states — building icons legible at 20px; costs read as `n icon`; era-lock still clear.
4. Popups: building popup, contribute popup (a Frame/Walls stage), Wonder popup — icons render in titles/rows.
5. On-map: place one of each building; screenshot at low and high zoom — `drawIcon` blits crisp glyphs; fallback (colored box only) shows for at most the first frame(s) before images load, never a broken glyph.
6. Cross-surface: quests panel, trader offer, recruit button, ledger tally all render SVG icons, no leftover item/building emoji (grep the runtime for the old emoji in HUD/build contexts).
7. Regression: gameplay, save/reload, and the v2 Monument arc still work (icons are presentation-only); console clean but for the favicon 404.
8. Single-file: `index.html` and `emberpine-valley.html` byte-identical after the change.

## Decisions to confirm at implementation (flagged, not blocking)

- Final icon art direction (flat-fill vs light line-work) — pick by mocking 4–5 icons first and eyeballing at 16px before authoring all 37. (User declined a live visual companion for now; do a quick static mockup + screenshot pass at build time.)
- Whether to also convert job labels, the clock, and the era-lock 🔒 to SVG (stretch items above).
- Whether the build-bar category separators improve or clutter (stretch).

## Rollout

- Single feature branch or direct-to-`main` (v2 was direct-to-`main` per user). Implement behind the existing structure; the icon swap is mechanical once `ICON_SVG` + `iconHTML` + `drawIcon` exist. Suggested task order for the eventual plan: (1) icon infra (`ICON_SVG` stub + `iconHTML` + `drawIcon` + preload), (2) author + wire good icons (HUD, costs), (3) author + wire building icons (build bar, popups, on-map), (4) readability tidy, (5) full-set visual QA + duplicate sync.
