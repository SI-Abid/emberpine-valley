# Emberpine v6 — Combat Update: Enemies & Defenders

## Design pillars
Cozy-compatible combat: raids threaten *goods*, not lives. No villager death —
defeat means stolen resources. Defense is a job and a building, not micro.

## Threat: Goblin raids
- Trigger: at night, once town tier >= 1 (Village). Raid timer rolls 2–4
  game-days out; raid size = 1 + tier + (island - 1).
- Goblins spawn at the map edge, run toward the richest target
  (stocked crate, else the hall), grab up to 5 goods, and flee to the edge.
- Reaching the edge with loot = goods lost. Killed = drops 2 gold ore
  + 15 score. All goblins flee at dawn.
- HP 3. Sprites: Sunnyside Goblin (run/attack), animated like villagers.

## Defenders
1. **Guard job** (🛡️): guards skip night-sleep while a raid is active,
   chase goblins within 8 tiles, melee 1 dmg / 0.7s (human ATTACK anim).
   Off-duty they patrol near the hall.
2. **Watchtower** (🏹, plank 14 + stone 10, civic, tier 1): auto-fires an
   arrow (1 dmg / 1.2s) at goblins within 5.5 tiles.
3. **Player**: press E near a goblin to strike (1 dmg, attack anim flash).

## Raid UX
Horn toast on raid start; goblins show HP pips; theft/kill toasts.

## Persistence
Raid timer saved; live goblins are ephemeral (despawn on reload).
