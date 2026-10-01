# The Lab — agent instructions

This repository is the browser game **The Lab**. The `AGENTS.md` in the parent directory describes a different Spanish vocabulary project; use this file and this repository's README for The Lab.

## GitHub and deployment

- Remote: `git@github.com:bishoppawn1/The_lab.git`; production branch: `main`.
- After completing and verifying a task, commit and push its changes to GitHub. Push each completed task, not each individual file edit. Never force-push, discard someone else's changes, or push credentials. Report any push blocker.
- GitHub Actions builds `main` and publishes the game at https://bishoppawn1.github.io/The_lab/. For changes that affect the published game, verify the Pages workflow and live site after pushing.
- The public room server runs at https://bishoppawn1-the-lab-rooms.onrender.com/health. `.github/workflows/pages.yml` sets `PUBLIC_ROOM_SERVER_URL` to its origin, which the build embeds in `room-config.js`. If the Render service URL changes, update the workflow and verify public room creation and joining.
- The multiplayer Pages connection was pushed in commit `ba6093a` on 2026-10-01.

## Working on the game

- Read `README.md` and inspect `git status` before editing. Preserve the two operations: Lab Escape and Team Deathmatch.
- Run `npm test` and `npm run build` for application changes. Check relevant UI flows in a browser when practical.
- The authoritative room server is in `scripts/room-server.js` and `src/authoritative-match.js`; the browser client is in `src/app.js`. Keep server decisions authoritative for movement, combat, pickups, vision, and scores.
- Render's free service can sleep or restart, clearing in-memory rooms. Do not describe active rooms as persistent.
