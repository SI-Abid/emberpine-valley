# Native-resolution asset set (32px)

A parallel, true-game-resolution version of the terrain tiles and resource sprites,
built to the intended in-game dimensions (terrain 32×32, water 4×64×64, tree 32×64,
sand-pile 32×24, other resources 32×32). Downscaled from the hi-res sources with matte
cleanup and base-alignment.

**Not wired into the game** — the game currently loads the hi-res sprites from
`assets/terrain/` and `assets/resources/` and scales them down. This set is a lighter
alternative that looks virtually identical at gameplay zoom (verified with an in-world
A/B). To switch, point `terrTile()`/`resImg()` at `assets/native32/…`.

Filenames match the game's asset names so the loaders can swap with only a base-path change.

## Present
- `terrain/`: grass, grass2, grass3, sand, stone, dirt, ice (32×32); water (2×2 sheet) + water_4f (horizontal strip)
- `resources/`: tree (32×64), stone, iron, gold, clay, flax, berry, berry_spent (32×32); sand (32×24)

## Not built — no source art
- `tile_path`, `tile_ice_animated_4f` (needs animation frames), `resource_tree_pine`, `resource_berry_wild`
