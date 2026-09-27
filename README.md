# THE LAB — Combat Simulator

**[Play THE LAB on GitHub Pages](https://bishoppawn1.github.io/The_lab/)**

A browser-based, top-down shooter with two operations: escape a hostile research facility, or fight in a team deathmatch. It uses Canvas and plain JavaScript, with no game-engine or runtime package dependencies. Runs locally and on GitHub Pages.

## Operations

**Lab Escape** is a solo survival run through a large facility with randomly arranged rooms, varied doorways, dead ends, and alternate routes. Search for guns, melee weapons, grenades, medkits, and armor. Randomly placed supplies respawn at their original locations 20 seconds after collection. Guns have unlimited reserves and reloadable magazines, so there are no ammunition pickups. Fight crawlers, brutes, and spitters alongside a friendly guard; monsters can detect you only nearby and through a clear line of sight. Locate extraction, then press **E** to leave. Four gear slots stay visible along the bottom; collect a weapon into an empty slot or select a slot to swap when full. Firearm variants are rare. Standard, Hardcore, and Training conditions adjust the challenge; Balanced, Assault, and Medic kits change the starting equipment.

**PvP Arena** is team deathmatch in the same generated facility layout as Lab Escape. Choose 5v5 or 10v10, a side, and a score target of 50, 100, or 250 eliminations. You start with a pistol; AI fills both teams, gathers ground weapons, and switches guns to suit the current range. Enemy bots detect you only nearby and through a clear line of sight. Gear drops when you are eliminated, while the original random pickup sites refill after 20 seconds. Your map reveals terrain and units through your squad's shared vision, while keeping the rest of the facility outline visible.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Move |
| Mouse | Aim |
| Hold left mouse button or Space | Fire / swing |
| E | Collect nearby supplies or extract |
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
