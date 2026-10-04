# THE LAB — Combat Simulator

**[Play THE LAB on GitHub Pages](https://bishoppawn1.github.io/The_lab/)**

A browser-based, top-down shooter with two operations: escape a hostile research facility, or fight in a team deathmatch. It uses Canvas and plain JavaScript, with no game-engine or runtime package dependencies. Runs locally and on GitHub Pages.

## Operations

**Lab Escape** is a solo survival run through a newly generated facility every run. Corridor positions, junctions, room sizes and locations, door placements, and entry and extraction locations are randomized. All 18 themed rooms remain connected, with entry and extraction kept far apart. Rooms have different roles: the Nest Chamber is crowded with crawlers and a brute, Specimen Hold and Quarantine contain smaller groups, and quieter rooms such as Observation and Archives have no assigned monsters. Medical contains medkits, the Armory holds four randomly selected firearms, and a large Supply Hub at the map center holds weapons and supplies. Its four broad, always-open entrances connect to the surrounding halls, while crates and equipment provide cover without blocking the main crossing routes. Search for guns, melee weapons, grenades, medkits, and armor. Collected world pickups respawn after 6 seconds at new random locations with a different item; themed room pickups reroll within their room. Additional random pickups appear every 7 seconds, up to a density cap. Guns have unlimited reserves and reloadable magazines, so there are no ammunition pickups. The arsenal includes machine pistols, SMG variants, auto and slug shotguns, a scout carbine, and a crowbar alongside the original weapons; shotguns hit harder up close. Fight crawlers, brutes, and spitters alongside a friendly guard; monsters detect opponents down clear lanes up to 24 tiles away. See all the way down clear corridors; walls, closed doors, and solid furniture block sight. Computers, crates, and other solid props also block movement and gunfire, so they provide cover. Press **E** to open or close a nearby room door; closed doors block movement, gunfire, and sight. Step clear of the doorway before closing it. Locate extraction, then press **E** to leave. Four gear slots stay visible along the bottom; collect a weapon into an empty slot or select a slot to swap when full. Firearm variants are rare. Standard, Hardcore, and Training conditions adjust the challenge; Balanced, Assault, and Medic kits change the starting equipment.

**PvP Arena** is team deathmatch in a fresh randomized facility each match, using the same map generator as Lab Escape. Your view extends along every clear sight line, and room doors open and close with **E**. The Armory holds four randomly selected firearms for either team to find. Choose 5v5 or 10v10, a side, and a score target of 50, 100, or 250 eliminations. Players start with a varied weapon roll; AI bots start mostly with a pistol and sometimes a basic melee weapon or SMG. Both reroll on respawn. Bots weigh ground weapons by the ranges and roles missing from their loadout, and sometimes pass on a situational pickup. Bots keep a better variant instead of taking an inferior gun from the same family. Each team has a melee pickup near its starting area. Bots search unvisited rooms for loot, favoring the Supply Hub and Armory, until an opponent enters a clear line of sight within a view-scale 24 tiles. Gun bots react quickly, seek solid cover, alternate between hiding and peeking, and strafe or back away when cover is unavailable instead of charging while firing. When sight breaks, they investigate the last position they actually saw for a few seconds, then return to patrol; they cannot track hidden movement through walls. When attacked, they reassess visible opponents and can switch to the attacker. Bot movement is close to player speed. Found gear drops when a player or bot is eliminated, while world pickups refill after 6 seconds with new locations and items. Additional random pickups appear every 7 seconds, up to a density cap. Your map reveals terrain and units through your squad's shared vision and marks the opposing spawn with a large red box; unseen enemies are fully hidden. When a public room server is configured, GitHub Pages players can create or join a room by code; otherwise the hosted game offers bot matches.

In either operation, highlighted computers can be used with **E**. The Control Room terminal opens or closes the Armory, Medical, and Quarantine doors; the Power Station terminal cuts or restores lights in nearby technical rooms. In online matches, the room server controls these changes for everyone.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Move |
| Mouse | Aim |
| Hold left mouse button or Space | Fire / swing |
| E | Use a computer, open / close a nearby door, collect supplies, or extract |
| 1–4 | Select an inventory slot (or swap a weapon pickup) |
| R | Reload the selected firearm |
| G | Throw a grenade from any inventory slot |
| Space / left mouse | Use the selected medkit or grenade; otherwise fire |
| M | Show or hide the full map |
| Escape or P | Pause |

## Run locally

The local preview requires Node.js 22 or newer. Install dependencies once, then start the preview:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:5174](http://127.0.0.1:5174). In Team Deathmatch, create a room, choose a team, and share its six-character code with another browser that can reach this preview. For another device on the same network, open `http://YOUR-COMPUTER-LAN-IP:5174` there, then select **Join with code** and a team; your firewall must allow the connection. Everyone marks themselves ready; the host starts the match, and bots fill empty spots. Multiple rooms can wait or play independently. The room server is built into the local preview, so you do not need a second npm command. Lab Escape remains local. To create the GitHub Pages build:

```sh
npm run build
```

The build writes a static copy to `dist/` and adds cache-busting versions to local asset URLs. GitHub Actions builds and deploys every push to `main`. To enable the first deployment, select **GitHub Actions** under **Settings → Pages → Build and deployment**.

## Put multiplayer online

The repo contains [render.yaml](render.yaml), a free Render web-service blueprint for the Node room server. The deployed room server is at [bishoppawn1-the-lab-rooms.onrender.com](https://bishoppawn1-the-lab-rooms.onrender.com/health). The checked-in `room-config.js` points the published game at this server, and the GitHub Pages workflow embeds the same URL in its built artifact. Players opening the [GitHub Pages game](https://bishoppawn1.github.io/The_lab/) see **Create room** and **Join with code**. The browser uses HTTPS for room requests and WSS for live matches. If the room server moves, update both `room-config.js` and `PUBLIC_ROOM_SERVER_URL` in `.github/workflows/pages.yml` and push a commit.

The public server responds to `GET /health`; check that endpoint before sharing room codes. Its `startedAt` field shows when the current server process started, which can help diagnose a dropped match. Render's free instance can sleep after 15 minutes without inbound traffic and takes time to wake; active gameplay sends WebSocket messages, so ordinary idle sleep should not end an active match. If a connection drops briefly, the client retries and the server holds that player's place for 30 seconds. The Render Blueprint rebuilds the room service only for server code or dependency changes, avoiding restarts from browser-only edits. Rooms are held only in memory, so a Render restart, deployment, or crash still ends active matches and requires a new room. To preserve matches across process replacements, the server would need durable match-state storage and restoration. The room server has a 16-room limit; a larger audience will need more capacity and persistent match coordination.

## Local Dev Match server

The server owns each Dev Match's generated map, players, bots, doors, pickups, bullets, grenades, damage, respawns, and score. It simulates at 30 ticks per second and sends team-filtered snapshots over WebSocket. The browser sends movement, aim, fire, reload, interact, grenade use, and slot selection; it cannot submit a successful hit or pickup. Rooms use six-character codes, separate lobbies, ready states, and a host-controlled start. The first player is host; if they leave before the match, hosting passes to another player. Empty rooms are removed.

The standalone room service can be run for protocol testing or future deployment:

```sh
npm run room-server
```

It listens at `http://127.0.0.1:8787`. Set `MATCH_HOST` and `MATCH_PORT` to change its bind address and port. `POST /rooms` with `{"teamSize":5,"target":50}` creates a room; `GET /rooms/CODE` checks one; WebSocket `/rooms/CODE?team=blue` joins it. The first player becomes host. Clients send `{"type":"lobby","action":"ready","ready":true}` and the host sends `{"type":"lobby","action":"start"}` after all players are ready. The server then sends `started` and team-filtered `snapshot` messages. The `welcome` message includes a private `resumeToken`; after a brief disconnect during a started match, the same player can reconnect to `/rooms/CODE?resume=TOKEN` within 30 seconds. Keep that token private. During play, send control messages in this shape:

```json
{"type":"input","moveX":1,"moveY":0,"aim":0,"fire":true,"reload":false,"interact":false,"grenade":false,"slot":0}
```

Movement axes are clamped to −1 through 1; `aim` is in radians; `slot` is 0–3. A selected slot also determines which inventory item is replaced when interacting with a pickup and all four slots are occupied. The server validates range, collision, firing rate, ammunition, team damage, and pickup availability. Snapshots include the player's own inventory, allied units, enemies and items visible to the team, bullets and door states in view, and score.

## Project structure

- `index.html` — operation selection, setup, and game interface
- `styles.css` — responsive dark interface
- `src/facility.js` — seeded, browser-independent facility generator; `createFacility('pvp', seed)` recreates the same layout and returns its seed in `world.seed`
- `src/arena-core.js` — shared weapon and loot data, inventory, bot decisions and pathfinding, movement, doors, vision, damage, projectiles, and scoring
- `src/authoritative-match.js` — browser-independent match owner and fixed-step simulation
- `src/app.js` — local and server-driven match orchestration, browser input, sound, UI, and rendering; it uses the shared modules above
- `scripts/server.js` — local preview that serves the game and room API on one port
- `scripts/room-server.js` — coded rooms, lobby state, and isolated authoritative matches over HTTP and WebSocket
- `room-config.js` — public room-service URL for branch-served Pages; the Pages build replaces it from `PUBLIC_ROOM_SERVER_URL`, while local previews use their own room server
- `render.yaml` — deployment blueprint for the public room service
- `scripts/match-server.js` — original single-match WebSocket protocol test server
- `test/arena-core.test.js` — runs shared map and arena rules directly in Node, without a browser
- `test/authoritative-match.test.js` — verifies server ownership, controls, snapshots, and WebSocket transport
- `test/devmatch-preview.test.js` — verifies room creation, joining, readiness, host transfer, and match start
- `scripts/build.js` — static Pages build
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

GitHub Pages serves the static client. The Pages workflow sets `PUBLIC_ROOM_SERVER_URL` to the deployed room service; without a configured service, deathmatch still works as a bot match.
