# Coin Hopper

A 3D online platform race for 2–4 players, built with Three.js (r149, vendored). Six 3D
mascots race across four maps, collect coins and use powers on each other. Bots fill empty
spots. It plays full screen on phones in landscape and on desktop.

## Play

The online version is published as a claude.ai artifact. Rooms and the online save use the
artifact `room`, `db` and `user` capabilities, so friends need a claude.ai account and
access to the artifact (Share menu).

Locally, serve the folder (`python3 -m http.server`) and open `index.html`. Without
claude.ai only solo races are available, and progress is saved in the browser.

## Screens

- **Home:** profile, level and XP, coins and gems, Play / Shop / Characters / Settings.
- **Maps & Modes:** Sunny Valley, Frosty Peaks, Jungle Ruins, Lava Canyon. The featured map
  rotates every 6 hours. Modes are Quick Match, Private Room and Ranked.
- **Lobby (private room):** create a room or join with a 4-letter code or invite link.
  Players have ready states; the host picks the map and starts once everyone is ready.
  The lobby also has emotes and shows connection status.
- **Race:** live ranking 1st–4th, progress bar, finish line, power tray, touch buttons.
- **Results:** podium in 3D, coins, XP and gems earned.
- **Shop:** characters for coins or gems, a bundle, and a gem-to-coin exchange.
- **Characters:** upgrades for speed, jump, balance, acceleration and ability, each capped
  at level 10. Ranked races count only half of the upgrade bonus.

## Powers

Powers come from capsules on the course and stack up to the tray.

- **ICE:** a shard flies to the nearest rival ahead and freezes them.
- **SLIME:** a puddle dropped behind you that slows whoever steps in it.
- **BOOST:** a few seconds of extra speed.
- **SHIELD:** blocks the next hit.

## How it works

- `js/sim.js`: fixed-step physics, upgrade stats, status effects and the bot driver.
- `levelgen.js`: seeded course generator, so every client builds the same course.
- `js/world3d.js`: builds the 3D course, decor and backdrop for each map.
- `js/characters3d.js`: the six procedural 3D characters and their animations.
- `js/race3d.js`: renderer, race loop, camera, powers, pickups and network sync.
- `js/profile.js`: profile, economy, upgrades and rewards. Saved to localStorage and to
  the artifact database.
- `js/app.js`: all screens, lobby and matchmaking. `css/ui.css` holds the styles and
  `js/icons.js` the icons.
- `net.js`: room presence. Each client simulates its own runner; the host (first to join)
  runs the bots and decides when a race ends.

## Limits (honest status)

- There is no authoritative game server yet. Purchases, rewards and race results are
  checked on the client, so a modified client could cheat. A Colyseus (or similar)
  server would be the next step for public launch.
- Online play needs claude.ai. A standalone launch needs its own hosting and server.

## Controls

- Arrow keys or A / D: run
- Up, W or Space: jump; press again in the air for a double jump
- 1 / 2 / 3 / 4: use ice, slime, boost or shield
- On phones: on-screen buttons
