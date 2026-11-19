# Coin Hopper

A small browser platformer built with Phaser 4.2.1: run, jump, double jump, collect coins,
stomp enemies and reach the flag in three short levels.

## Play

From this folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080 in a browser. Opening `index.html` directly also works,
since the game has no asset files to load.

## Controls

- Arrow keys or A / D: run
- Up, W or Space: jump (press again in the air for a double jump; release early for a short hop)
- Land on an enemy from above to stomp it; touching it from the side restarts the level

## Files

- `index.html`: page that loads the scripts
- `levels.js`: the three level maps as text grids (edit these to change the levels)
- `main.js`: scenes, player, enemies and generated art
- `vendor/phaser.min.js`: Phaser 4.2.1 (MIT license, see `vendor/PHASER-LICENSE.md`)
