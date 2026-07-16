# Terrain tiles

Ground-layer tiles that replace the 16px Kenney atlas tiles. Unlike buildings these
must **tile seamlessly** (edges wrap on all four sides) since they repeat across the map.

## Spec
- Square, **seamless-tiling**, 32×32 or 64×64 px, opaque (no transparency needed).
- Keep detail subtle/low-contrast — busy tiles read as noise when repeated.

## Filenames
- `grass.png`, `grass2.png`, `grass3.png` — variants reduce obvious repetition
- `water.png` — the river/lake surface
- `ice.png` — frozen water (winter)
- `sand.png` — beach/shore
- `stone.png` — rocky ground / mountain
- `dirt.png` — bare earth / under paths

## Note
Wiring terrain needs a small engine change (the ground layer currently samples the
atlas). That's on me — you just supply the tiles.
