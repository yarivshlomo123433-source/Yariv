# Coin Hopper

An online platform race for up to 4 friends, built with Phaser 4.2.1. Every race runs on a
newly generated course, and power-ups on the floor let you slow the others down.

## Play

The online version is published as a claude.ai artifact. Online rooms use the artifact
`room` capability, so friends need a claude.ai account and access to the artifact (Share menu).

Locally, open `index.html` in a browser (or serve the folder with `python3 -m http.server`).
Without claude.ai, only solo races are available.

## How it works

- **Rooms:** one player creates a room and shares the 4-letter code; up to 4 can join.
  The first player in the room is the host and starts each race.
- **Courses:** `levelgen.js` builds a course from a seed. The host shares the seed, so every
  player gets the same course; every race uses a new seed.
- **Sync:** `net.js` sends each player's position and actions through room presence. Each
  player's browser moves only its own runner and draws the others from what they send.
- **Powers** (from the glowing capsules, or every 5 coins): fireball (stuns whoever it hits),
  slime trap (dropped behind you; others slip), lightning (stuns everyone ahead of you) and
  speed boost. Players further behind get more attack powers.

## Controls

- Arrow keys or A / D: run
- Up, W or Space: jump; press again in the air for a double jump
- X, Shift or E: use your power
- On phones: on-screen buttons

## Files

- `index.html`: page, menus and touch buttons
- `main.js`: scenes, player, powers, enemies and the online race flow
- `levelgen.js`: seeded course generator
- `net.js`: wrapper around the artifact room capability
- `art.js`: generated from `art/svg/*.svg` by `node art/build-art.js`
- `art/`: SVG sources and the build script (`render.js` renders a style board)
- `vendor/phaser.min.js`: Phaser 4.2.1 (MIT license, see `vendor/PHASER-LICENSE.md`)
