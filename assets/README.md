# Assets

Game art, organized by kind. The game loads the **processed, game-ready** sprites
from these folders by exact filename — drop a correctly-named PNG in and it appears,
no code change beyond adding the name to the relevant allow-list in `index.html`.

```
assets/
  buildings/   game-ready building sprites — loaded as assets/buildings/<type>.png
  resources/   resource-node sprites (trees, rocks, bushes…) — planned
  terrain/     seamless ground tiles (grass, water, ice, stone…) — planned
  animals/     animal sprites (sheep, pig, cow, chicken…) — planned
  sources/     raw high-res uploads the processed sprites were derived from.
               NOT loaded by the game; kept for reprocessing only.
```

## Processing convention (buildings, resources, animals)
Raw uploads land in `sources/<kind>/`. Each is trimmed to its alpha bbox, its matte
fringe neutralized to kill downscale halos, scaled to ~220px on the long edge, and
saved into the matching folder under the game's internal `type` name. See each
folder's README for its exact spec.
