# THE LAB — Combat Simulator

**[Play THE LAB on GitHub Pages](https://bishoppawn1.github.io/The_lab/)**

A browser-based, top-down shooter with two operations: escape a hostile research facility, or fight in a team deathmatch. It uses Canvas and plain JavaScript, with no game-engine or runtime package dependencies. Runs locally and on GitHub Pages.

## Operations

**Lab Escape** is a solo survival run through a large facility with two long main corridors, connecting cross-corridors, and 18 branching rooms. Rooms have different roles: the Nest Chamber is crowded with crawlers and a brute, Specimen Hold and Quarantine contain smaller groups, and quieter rooms such as Observation and Archives have no assigned monsters. Medical contains medkits, while the Armory holds four randomly selected firearms. Search for guns, melee weapons, grenades, medkits, and armor. Collected world pickups respawn after 6 seconds at new random locations with a different item; themed room pickups reroll within their room. Additional random pickups appear every 7 seconds, up to a density cap. Guns have unlimited reserves and reloadable magazines, so there are no ammunition pickups. The arsenal includes machine pistols, SMG variants, auto and slug shotguns, a scout carbine, and a crowbar alongside the original weapons; shotguns hit harder up close. Fight crawlers, brutes, and spitters alongside a friendly guard; monsters can detect you only nearby and through a clear line of sight. Unlock room doors with **E**; closed doors block movement and hide what is inside until opened. Locate extraction, then press **E** to leave. Four gear slots stay visible along the bottom; collect a weapon into an empty slot or select a slot to swap when full. Firearm variants are rare. Standard, Hardcore, and Training conditions adjust the challenge; Balanced, Assault, and Medic kits change the starting equipment.

**PvP Arena** is team deathmatch in the same generated facility layout as Lab Escape. Its rooms also have sight-blocking doors, and the Armory holds four randomly selected firearms for either team to find. Choose 5v5 or 10v10, a side, and a score target of 50, 100, or 250 eliminations. You and the AI bots use the same starting gear roll: a pistol plus a randomly selected second weapon, or just the pistol. The roll repeats on each respawn. Bots weigh ground weapons by the ranges and roles missing from their loadout, and sometimes pass on a situational pickup. Bots keep a better variant instead of taking an inferior gun from the same family. Each team has a melee pickup near its starting area. Enemy bots detect you only nearby and through a clear line of sight. Found gear drops when a player or bot is eliminated, while world pickups refill after 6 seconds with new locations and items. Additional random pickups appear every 7 seconds, up to a density cap. Your map reveals terrain and units through your squad's shared vision, while keeping the rest of the facility outline visible.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Move |
| Mouse | Aim |
| Hold left mouse button or Space | Fire / swing |
| E | Unlock a nearby door, collect supplies, or extract |
| 1–4 | Select an inventory slot (or swap a weapon pickup) |
| R | Reload the selected firearm |
| G | Throw a grenade from any inventory slot |
| Space / left mouse | Use the selected medkit or grenade; otherwise fire |
| M | Show or hide the full map |
| Escape or P | Pause |

## Run locally

Requires Node.js 22 or newer; no `npm install` is needed.

```sh
npm run dev
```

Open [http://127.0.0.1:5174](http://127.0.0.1:5174). To create the GitHub Pages build:

```sh
npm run build
```

The build writes a static copy to `dist/` and adds cache-busting versions to local asset URLs. GitHub Actions builds and deploys every push to `main`. To enable the first deployment, select **GitHub Actions** under **Settings → Pages → Build and deployment**.

## Project structure

- `index.html` — operation selection, setup, and game interface
- `styles.css` — responsive dark interface
- `src/app.js` — maps, input, combat, AI, and rendering
- `scripts/build.js` — static Pages build
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

This game is a single-player browser simulation. Its PvP mode uses AI opponents and teammates; it does not connect players over a network.
