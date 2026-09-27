import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const definitions = source.slice(0, source.indexOf("$('#select-survival').addEventListener"));

function loadGameLogic() {
  const element = { getContext: () => ({}) };
  const context = { document: { querySelector: () => element } };
  vm.runInNewContext(`${definitions}\nglobalThis.lab = { state, generateWorld, spawnLoot, takeLoot, respawnLoot, firingLaneClear, updateBot, updateEnemy };`, context);
  return context.lab;
}

function reachableTiles(world, start) {
  const key = (x, y) => `${x},${y}`;
  const queue = [[Math.floor(start.x / 32), Math.floor(start.y / 32)]];
  const seen = new Set([key(...queue[0])]);
  for (let index = 0; index < queue.length; index++) {
    const [x, y] = queue[index];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = key(nx, ny);
      if (world.map[ny]?.[nx] !== 0 || seen.has(next)) continue;
      seen.add(next);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

function roomExits(world, room) {
  const open = (x, y) => world.map[y]?.[x] === 0;
  const sides = [
    Array.from({ length: room.w }, (_, dx) => open(room.x + dx, room.y)),
    Array.from({ length: room.w }, (_, dx) => open(room.x + dx, room.y + room.h - 1)),
    Array.from({ length: room.h }, (_, dy) => open(room.x, room.y + dy)),
    Array.from({ length: room.h }, (_, dy) => open(room.x + room.w - 1, room.y + dy)),
  ];
  return sides.filter(side => side.some(Boolean)).length;
}

test('generated rooms remain connected across different layouts', () => {
  const { state, generateWorld } = loadGameLogic();
  const layouts = new Set();
  for (let run = 0; run < 250; run++) {
    generateWorld('survival');
    const { world } = state;
    assert.equal(world.rooms.length, 12);
    layouts.add(world.rooms.map(room => `${room.x},${room.y},${room.w},${room.h}`).join('|'));
    const reachable = reachableTiles(world, world.spawnZones[0]);
    for (const room of world.rooms) {
      const x = room.x + Math.floor(room.w / 2);
      const y = room.y + Math.floor(room.h / 2);
      assert.ok(reachable.has(`${x},${y}`), `${room.name} must be reachable`);
      assert.ok(roomExits(world, room) >= 1 && roomExits(world, room) <= 3, `${room.name} should have one to three exits`);
    }
    assert.ok(world.rooms.some(room => roomExits(world, room) === 1), 'each layout should contain a dead-end room');
    assert.ok(reachable.has(`${Math.floor(world.exit.x / 32)},${Math.floor(world.exit.y / 32)}`));
  }
  assert.ok(layouts.size > 1, 'new operations should produce different room layouts');
});

test('collected world loot returns to its original location', () => {
  const { state, generateWorld, spawnLoot, takeLoot, respawnLoot } = loadGameLogic();
  generateWorld('pvp');
  state.player = { alive: false, x: 0, y: 0, r: 11 };
  state.bots = [];
  state.enemies = [];
  spawnLoot(14);
  const pickup = state.loot[0];
  assert.equal(takeLoot(pickup), true);
  assert.equal(state.loot.some(item => item.spawnId === pickup.spawnId), false);
  state.elapsed = 19;
  respawnLoot();
  assert.equal(state.loot.some(item => item.spawnId === pickup.spawnId), false);
  state.elapsed = 20;
  respawnLoot();
  const returned = state.loot.find(item => item.spawnId === pickup.spawnId);
  assert.ok(returned);
  assert.equal(returned.x, pickup.x);
  assert.equal(returned.y, pickup.y);
  assert.equal(returned.type, pickup.type);
  respawnLoot();
  assert.equal(state.loot.filter(item => item.spawnId === pickup.spawnId).length, 1);
});

test('opening another operation after a result hides the old game and result', () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        getContext: () => ({}),
        classList: {
          add: name => classes.add(name),
          remove: name => classes.delete(name),
          contains: name => classes.has(name),
        },
        querySelectorAll: () => [],
      });
    }
    return elements.get(id);
  };
  const context = { document: { querySelector: element } };
  vm.runInNewContext(`${definitions}\nglobalThis.lab = { state, finish, showMenu, openSetup };`, context);
  const { state, finish, showMenu, openSetup } = context.lab;
  state.running = true;
  finish(true, 'EXTRACTION CONFIRMED', 'You made it out.');
  assert.equal(element('#end-overlay').classList.contains('hidden'), false);
  showMenu();
  openSetup('pvp');
  assert.equal(element('#game').classList.contains('hidden'), true);
  assert.equal(element('#end-overlay').classList.contains('hidden'), true);
  assert.equal(element('#setup').classList.contains('hidden'), false);
  assert.equal(state.mode, 'pvp');
});

test('opposing bots move around a close corner instead of stopping at the wall', () => {
  const { state, firingLaneClear, updateBot } = loadGameLogic();
  const map = Array.from({ length: 9 }, () => Array(9).fill(1));
  for (let y = 1; y <= 5; y++) map[y][2] = 0;
  for (let x = 2; x <= 6; x++) map[5][x] = 0;
  state.world = { w: 9, h: 9, tile: 32, map };
  state.mode = 'pvp';
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  state.loot = [];
  const bot = (team, x, y) => ({ team, x, y, r: 10, speed: 105, alive: true, inventory: [0, null, null, null], active: 0, ammo: {}, think: 0, fireTime: 0, invuln: 0, hitFlash: 0 });
  const blue = bot('blue', 2.5 * 32, 3.5 * 32);
  const red = bot('red', 4.5 * 32, 5.5 * 32);
  state.bots = [blue, red];
  state.bullets = [];
  state.particles = [];
  assert.equal(firingLaneClear(blue, red), false);
  assert.ok(Math.hypot(blue.x - red.x, blue.y - red.y) < 145);
  updateBot(blue, 0.016, 1000);
  updateBot(red, 0.016, 1000);
  assert.equal(state.bullets.length, 0, 'bots should hold fire while the wall blocks the shot');
  blue.fireTime = red.fireTime = Infinity;
  for (let frame = 1; frame < 25; frame++) {
    updateBot(blue, 0.016, frame * 16);
    updateBot(red, 0.016, frame * 16);
  }
  assert.ok(blue.y > 112 + 10, 'blue should follow its route toward the corner');
  assert.ok(red.x < 144 - 10, 'red should follow its route toward the corner');
});

test('hostile bots and monsters acquire the player only within sight range and without walls', () => {
  const { state, updateBot, updateEnemy } = loadGameLogic();
  const map = Array.from({ length: 18 }, (_, y) => Array.from({ length: 25 }, (_, x) => x === 0 || y === 0 || x === 24 || y === 17 ? 1 : 0));
  state.world = { w: 25, h: 18, tile: 32, map };
  state.mode = 'pvp';
  state.loot = [];
  state.player = { x: 19.5 * 32, y: 5.5 * 32, r: 11, team: 'blue', alive: true };
  const bot = { x: 5.5 * 32, y: 5.5 * 32, r: 10, speed: 0, team: 'red', alive: true, inventory: [0, null, null, null], active: 0, ammo: {}, think: 0, fireTime: Infinity, invuln: 0, hitFlash: 0 };
  state.bots = [bot];
  updateBot(bot, 0.016, 1000);
  assert.equal(bot.target, null, 'distant player should not be selected');
  state.player.x = 12.5 * 32;
  bot.think = 0;
  updateBot(bot, 0.016, 1016);
  assert.equal(bot.target, state.player, 'nearby visible player should be selected');
  map[5][9] = 1;
  bot.think = 0;
  updateBot(bot, 0.016, 1032);
  assert.equal(bot.target, null, 'wall should break the player lock');

  state.mode = 'survival';
  state.bots = [];
  state.enemies = [];
  const monster = { x: 5.5 * 32, y: 5.5 * 32, r: 9, speed: 0, type: 'monster', variant: 'crawler', alive: true, think: 0, fireTime: Infinity, invuln: 0, hitFlash: 0 };
  state.enemies = [monster];
  updateEnemy(monster, 0.016, 1048);
  assert.equal(monster.target, null, 'monster should not see the player through a wall');
  map[5][9] = 0;
  monster.think = 0;
  updateEnemy(monster, 0.016, 1064);
  assert.equal(monster.target, state.player);
  state.player.x = 19.5 * 32;
  monster.think = 0;
  updateEnemy(monster, 0.016, 1080);
  assert.equal(monster.target, null, 'monster should lose a distant player');
});
