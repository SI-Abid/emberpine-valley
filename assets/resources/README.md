# Resource-node sprites

Sprites for harvestable map nodes, drawn in place of the procedural canvas art in
`drawRes()`. Same spec as buildings: **transparent PNG, trimmed, base flush to the
bottom edge** (the game base-aligns them on the tile), no baked shadow or ground.

## Filenames (use the game's internal `type`)
- `tree.png` (a `tree2.png` variant is supported for visual variety)
- `stone.png` — grey boulder
- `iron.png` — rock with ore veins
- `gold.png` — rock with gold flecks
- `berry.png` — berry bush
- `clay.png` — clay mound
- `sand.png` — sand/pebble pile
- `flax.png` — flax patch

## Turning one on
Add its `type` to the `RES_ASSETS` set in `index.html` (analogous to `BLD_ASSETS`).
Until it's listed the game keeps drawing the procedural version, so partial sets are fine.
