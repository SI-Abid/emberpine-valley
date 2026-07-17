# Building sprites

Drop a PNG here named `<buildingType>.png` and the game renders it in place of the
baked 16px atlas sprite, scaled to the building's footprint.

## Requirements
- **Transparent PNG**, trimmed to the sprite (no empty margins), **base flush to the bottom** edge.
- Sized to the footprint the game gives that building (a 2×2 building → ~32×48; a tall
  1×2 → ~16×48; 1×1 → ~16×24). The game scales to the footprint width and base-aligns,
  so the roof/upper floors can extend above the base.
- No baked drop-shadow (the game draws its own contact shadow) and no ground tile.

## Turning a sprite on
Add its building type to the `BLD_ASSETS` set in `index.html` (search for `BLD_ASSETS`).
Only listed types are fetched, so unlisted types never 404.

## Current assets
- Every buildable type has a real sprite. The town `hall` and the four monument
  build-stages (`monument_1`…`monument_4`, foundation → complete) are here too;
  the monument is drawn by `drawMonument()` keyed on the build stage, not by the
  generic loader.

## Sources
Raw high-res uploads live in `../sources/buildings/` and are not loaded by the game —
they're kept only for re-processing. This folder holds just the game-ready sprites.
