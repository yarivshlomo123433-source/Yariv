---
name: coin-hopper
description: Art direction, character specs, asset pipeline and quality checklist for the Coin Hopper game in game/. Use before changing characters, 3D models, UI screens, rendering or anything visual in Coin Hopper, and before calling any Coin Hopper visual work finished.
---

# Coin Hopper project rules

Coin Hopper is a 2.5D online platform race for 2–4 players in Three.js (r149, classic
scripts with globals, no bundler). The game lives in `game/`. The approved art direction is
in `art-direction/`. Those images are the target, not inspiration.

## Current priority (set by the owner)

1. The six characters must match the approved designs to a professional standard.
2. **Do not build new maps, physics or gameplay features** until the owner approves the
   characters.
3. Implement and test the real game. Do not produce more mockups or redesigns.

## Approved references

- `art-direction/reference/01-home.jpg`: all six mascots in a row. This is the master
  character sheet.
- `02-race.jpg`: in-race look (astronaut mid-jump, frog and cat running).
- `03-shop.jpg`: character portraits and the shop layout.
- `04`–`09`: lobby, live race, upgrades, maps & modes, the earlier home mock.
- `art-direction/characters/<id>.png`: each character cropped from the master sheet.
  Use these as image-to-3D input and for side-by-side checks.

## Characters (ids are used in code: `astro frog cat robot penguin fox`)

All six share one style: chunky "vinyl toy" proportions with a head about 45–50% of total
height. They have short limbs, big rounded hands (white gloves or paws) and oversized
shoes or feet. Every face is large and expressive, with glossy eyes and a big open smile.
Surfaces are soft and slightly glossy, with subtle subsurface warmth and no hard edges.

| id | Design must-haves |
|---|---|
| astro | Blue spacesuit with a white collar and cuffs, and a gold star on the chest. A big round helmet with a dark-navy glossy visor shows two white oval eyes. Orange ear-pods on the helmet sides, an orange belt and orange boots. |
| frog | Bright green with a cream belly and big eyes on top of the head. Wide open smile with a pink mouth and rosy cheeks. Yellow sneakers with white soles. |
| cat | Hot pink with a white muzzle, chest and paws. Pointy ears with pink insides and a striped tail. Big eyes with lashes, often winking. Pink-and-white sneakers. |
| robot | Yellow rounded-box head and body, with a dark screen face showing cyan "^ ^" eyes. Red bulb antenna and grey grille mouth. Grey mechanical joints, yellow rounded boots. |
| penguin | Navy body with a large white belly and face patch. Orange beak, orange feet and rosy cheeks. Closed happy eyes. |
| fox | Orange with a white chest, muzzle and tail tip. Big ears with dark tips. Closed happy eyes and an open smile. Dark-brown boots and paws. |

Each character must read clearly at gameplay scale (about 110–140 px tall on a phone in
landscape) and look correct from the front, side and back.

## Asset pipeline (the only accepted way to make characters)

The procedural primitive rigs in `js/characters3d.js` (`BUILD`) are **placeholders only**.
The owner rejected them. Do not polish them further.

1. **Model:** sculpted or AI image-to-3D meshes made from `art-direction/characters/<id>.png`.
   Options are Meshy (`meshy-3d-agent:meshy-3d-generation`, needs the owner's Meshy account
   and credits), a 3D artist, or Blender sculpting. Never present spheres-and-cylinders
   geometry as a final character.
2. **Rig and animation:** a skinned humanoid rig with idle, run and jump clips at minimum,
   and cheer if available. Meshy rigging provides walk and run clips.
3. **Cleanup** in Blender if available: apply transforms, put the origin at the feet, face +Z,
   about 10–25k triangles per character, one or two 1–2k textures, PBR materials.
4. **Export** to `game/models/<id>.glb` (rig plus clips), or the rig plus
   `game/models/<id>-<clip>.glb` per clip with the same skeleton. Clip names should
   contain `idle`, `run`, `jump` and `cheer`.
5. **Integration happens automatically:** `Chars3D.preload()` loads `models/<id>.glb`,
   scales it to gameplay height, puts the feet at y=0 and turns it to face +X, then maps
   race states to clips (`animateGLB`). Any missing file falls back to the placeholder.

## Rendering

Use `THREE.ColorManagement.legacyMode = false`, sRGB output, ACES tone mapping at
exposure ~1.05, and PCFSoft shadows. Light with a soft hemisphere, a warm key light, a cool
rim and a contact shadow under each character. Keep materials PBR, not unlit.

## Testing (real game, not mockups)

- Playwright with Chromium is preinstalled. Launch with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Serve the game over HTTP, because GLB loading fails on `file://`.
- Do a character lineup check: render all six together at gameplay scale from three views
  (front, 3/4 and back), plus a run-cycle frame. Place it side by side with
  `art-direction/reference/01-home.jpg`.
- For multiplayer, use 4 pages with background throttling disabled
  (`--disable-renderer-backgrounding --disable-background-timer-throttling`).
- Report real results. Never invent server connections, purchases or race results.

## Character quality checklist (all must pass before calling characters done)

- [ ] Silhouette and proportions match the reference sheet for each of the six.
- [ ] The face matches: eye shape and size, mouth, cheeks, and accessories like the visor, antenna or ears.
- [ ] Colours match the reference palette, with nothing washed out or oversaturated.
- [ ] Real sculpted or generated mesh with no visible primitive seams, intersections or holes.
- [ ] Looks correct from the front, side and back.
- [ ] Skinned rig with smooth idle, run and jump clips, no foot sliding at race speed, and no T-pose pops.
- [ ] Reads clearly at gameplay scale on a phone in landscape.
- [ ] Fits the mobile budget: ≤ 25k triangles and ≤ 2 MB GLB per character, and 60 fps on a mid-range phone.
- [ ] Shown to the owner as an actual in-engine render and approved.

Shadows, gloss and simple expressions alone do not make a character finished.
