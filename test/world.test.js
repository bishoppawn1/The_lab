import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const definitions = source.slice(0, source.indexOf("$('#select-survival').addEventListener"));

function loadGameLogic(random) {
  const element = { getContext: () => ({}), classList: { add() {}, remove() {} } };
  const context = { document: { querySelector: () => element }, performance: { now: () => 1000 } };
  if (random) context.Math = Object.assign(Object.create(Math), { random });
  vm.runInNewContext(`${definitions}\nglobalThis.lab = { state, WEAPONS, generateWorld, spawnLoot, takeLoot, respawnLoot, spawnBot, respawnBot, blocked, lineClear, interact, unlockDoor, updateVision, seedRoomThreats, spawnEnemy, firingLaneClear, updateBot, updateEnemy, botCanTakeLoot, botPickupLoot, hit, shoot, advanceBullet };`, context);
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
    const mode = run % 2 ? 'pvp' : 'survival';
    generateWorld(mode);
    const { world } = state;
    assert.equal(world.mode, mode);
    assert.equal(world.w, 160);
    assert.equal(world.h, 116);
    assert.equal(world.rooms.length, 18);
    assert.equal(world.doors.length, 18);
    assert.equal(world.doors.filter(door => !door.open).length, 17);
    for (const y of world.corridors.horizontal) {
      for (let x = 7; x <= world.w - 8; x++) assert.equal(world.map[y][x], 0, `main corridor at ${x},${y} must stay open`);
    }
    for (const x of world.corridors.vertical) {
      for (let y = 34; y <= 82; y++) assert.equal(world.map[y][x], 0, `cross-corridor at ${x},${y} must stay open`);
    }
    layouts.add(world.rooms.map(room => `${room.x},${room.y},${room.w},${room.h}`).join('|'));
    const reachable = reachableTiles(world, world.spawnZones[0]);
    for (const room of world.rooms) {
      const x = room.x + Math.floor(room.w / 2);
      const y = room.y + Math.floor(room.h / 2);
      assert.ok(reachable.has(`${x},${y}`), `${room.name} must be reachable`);
      assert.equal(roomExits(world, room), 1, `${room.name} should branch from a main corridor through one entrance`);
    }
    assert.ok(world.rooms.some(room => roomExits(world, room) === 1), 'each layout should contain a dead-end room');
    assert.ok(reachable.has(`${Math.floor(world.exit.x / 32)},${Math.floor(world.exit.y / 32)}`));
  }
  assert.ok(layouts.size > 1, 'new operations should produce different room layouts');
});

test('collected world loot respawns as a different item in a new location', () => {
  const { state, generateWorld, spawnLoot, takeLoot, respawnLoot } = loadGameLogic();
  generateWorld('pvp');
  state.player = { alive: false, x: 0, y: 0, r: 11 };
  state.bots = [];
  state.enemies = [];
  spawnLoot(14);
  const pickup = state.loot[0];
  assert.equal(takeLoot(pickup), true);
  assert.equal(state.loot.some(item => item.spawnId === pickup.spawnId), false);
  state.elapsed = 11;
  respawnLoot();
  assert.equal(state.loot.some(item => item.spawnId === pickup.spawnId), false);
  state.elapsed = 12;
  respawnLoot();
  const returned = state.loot.find(item => item.spawnId === pickup.spawnId);
  assert.ok(returned);
  assert.ok(Math.hypot(returned.x - pickup.x, returned.y - pickup.y) >= 5 * 32);
  assert.notEqual(`${returned.type}:${returned.weapon}`, `${pickup.type}:${pickup.weapon}`);
  assert.equal(state.world.map[Math.floor(returned.y / 32)][Math.floor(returned.x / 32)], 0);
  respawnLoot();
  assert.equal(state.loot.filter(item => item.spawnId === pickup.spawnId).length, 1);
});

test('themed room pickups reroll within their room', () => {
  const { state, generateWorld, spawnLoot, takeLoot, respawnLoot, WEAPONS } = loadGameLogic();
  state.mode = 'pvp';
  generateWorld('pvp');
  state.player = { alive: false, x: 0, y: 0, r: 11 };
  state.bots = [];
  state.enemies = [];
  spawnLoot(40);
  for (const roomName of ['ARMORY', 'MEDICAL']) {
    const before = state.loot.find(item => item.room === roomName);
    const room = state.world.rooms.find(item => item.name === roomName);
    takeLoot(before);
    state.elapsed += 12;
    respawnLoot();
    const after = state.loot.find(item => item.spawnId === before.spawnId);
    assert.ok(after);
    assert.ok(after.x > room.x * 32 && after.x < (room.x + room.w) * 32);
    assert.ok(after.y > room.y * 32 && after.y < (room.y + room.h) * 32);
    assert.notEqual(`${after.type}:${after.weapon}`, `${before.type}:${before.weapon}`);
    if (roomName === 'ARMORY') assert.equal(WEAPONS[after.weapon].kind, 'gun');
    else assert.ok(['health', 'armor'].includes(after.type));
  }
});

test('deathmatch bots roll varied starter weapons on spawn and respawn', () => {
  let seed = 3871;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const { state, generateWorld, spawnBot, respawnBot, WEAPONS } = loadGameLogic(random);
  state.mode = 'pvp';
  generateWorld('pvp');
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  state.bots = [];
  state.enemies = [];
  for (let i = 0; i < 24; i++) spawnBot(i % 2 ? 'red' : 'blue', i);
  const starters = new Set(state.bots.map(bot => bot.inventory[1]));
  assert.ok(starters.size >= 5, 'bots should not all start with the same SMG');
  for (const bot of state.bots) {
    assert.equal(bot.inventory[0], 0);
    assert.ok(bot.inventory.slice(2).every(slot => slot == null));
    if (bot.inventory[1] != null && WEAPONS[bot.inventory[1]].kind === 'gun') assert.equal(bot.ammo[bot.inventory[1]], WEAPONS[bot.inventory[1]].magazine);
    const zone = state.world.spawnZones[bot.team === 'blue' ? 0 : 1];
    assert.ok(Math.hypot(bot.x - zone.x, bot.y - zone.y) < 8 * 32);
  }
  const bot = state.bots[0], respawnStarters = new Set();
  for (let i = 0; i < 20; i++) {
    bot.alive = false;
    respawnBot(bot);
    assert.equal(bot.alive, true);
    assert.equal(bot.inventory[0], 0);
    assert.ok(bot.inventory[1] == null || WEAPONS[bot.inventory[1]]);
    respawnStarters.add(bot.inventory[1]);
  }
  assert.ok(respawnStarters.size >= 5, 'bot respawns should also reroll their gear');
});

test('larger maps receive more supplies without flooding them with weapons', () => {
  const { state, generateWorld, spawnLoot } = loadGameLogic();
  state.player = { alive: false, x: 0, y: 0, r: 11 };
  state.bots = [];
  state.enemies = [];
  for (const [mode, count, weaponLimit] of [['survival', 46, 22], ['pvp', 40, 18]]) {
    state.mode = mode;
    generateWorld(mode);
    spawnLoot(count);
    assert.equal(state.loot.length, count + 13);
    assert.ok(state.loot.slice(weaponLimit, count).every(item => item.type !== 'weapon'), `${mode} extra random pickup sites should contain supplies`);
    assert.equal(new Set(state.loot.map(item => item.spawnId)).size, count + 13);
    const armory = state.world.rooms.find(room => room.name === 'ARMORY');
    assert.equal(state.loot.filter(item => item.room === armory.name && item.type === 'weapon').length, 4, 'armory should hold a reliable weapon cache');
    const medical = state.world.rooms.find(room => room.name === 'MEDICAL');
    assert.equal(state.loot.filter(item => item.room === medical.name && item.type === 'health').length, 3);
  }
});

test('closed room doors block movement and sight until unlocked in both modes', () => {
  const { state, generateWorld, blocked, lineClear, unlockDoor, updateVision } = loadGameLogic();
  for (const mode of ['survival', 'pvp']) {
    state.mode = mode;
    generateWorld(mode);
    const door = state.world.doors.find(item => item.room.name === 'ARMORY');
    const inside = { x: door.cx, y: door.cy + (door.approach.y > door.cy ? -32 : 32) };
    state.player = { ...door.approach, alive: true, team: 'blue' };
    state.bots = [];
    state.enemies = [];
    assert.equal(blocked(door.cx, door.cy, 2), true);
    assert.equal(lineClear(door.approach, inside), false);
    updateVision(1000);
    assert.equal(state.world.visible.has(`${Math.floor(inside.x / 32)},${Math.floor(inside.y / 32)}`), false);
    assert.equal(unlockDoor(door), true);
    assert.equal(blocked(door.cx, door.cy, 2), false);
    assert.equal(lineClear(door.approach, inside), true);
    updateVision(1200);
    assert.equal(state.world.visible.has(`${Math.floor(inside.x / 32)},${Math.floor(inside.y / 32)}`), true);
  }
});

test('the player unlocks a nearby door with interact and arena bots open doors on approach', () => {
  const { state, generateWorld, interact, updateBot } = loadGameLogic();
  state.mode = 'survival';
  generateWorld('survival');
  const survivalDoor = state.world.doors.find(door => door.room.name === 'MEDICAL');
  state.player = { ...survivalDoor.approach, alive: true, team: 'blue' };
  state.loot = [];
  state.bots = [];
  state.enemies = [];
  interact();
  assert.equal(survivalDoor.open, true);

  state.mode = 'pvp';
  generateWorld('pvp');
  const arenaDoor = state.world.doors.find(door => door.room.name === 'ARMORY');
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  const bot = { ...arenaDoor.approach, team: 'blue', alive: true, r: 10, hp: 100, maxHp: 100, speed: 0, inventory: [0, 1, null, null], active: 0, ammo: {}, think: 0, fireTime: Infinity };
  state.bots = [bot];
  updateBot(bot, .016, 1000);
  assert.equal(arenaDoor.open, true);
});

test('survival threat rooms are populated while passive rooms remain quiet', () => {
  const { state, generateWorld, seedRoomThreats, spawnEnemy } = loadGameLogic();
  state.mode = 'survival';
  state.settings.difficulty = 'standard';
  generateWorld('survival');
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  state.bots = [];
  state.enemies = [];
  seedRoomThreats();
  const count = name => state.enemies.filter(enemy => enemy.room === name).length;
  assert.equal(count('NEST CHAMBER'), 5);
  assert.equal(count('SPECIMEN HOLD'), 3);
  assert.equal(count('QUARANTINE'), 2);
  assert.equal(count('OBSERVATION'), 0);
  assert.equal(count('ARCHIVES'), 0);
  for (const enemy of state.enemies) {
    const room = state.world.rooms.find(item => item.name === enemy.room);
    assert.ok(enemy.x > room.x * 32 && enemy.x < (room.x + room.w) * 32);
    assert.ok(enemy.y > room.y * 32 && enemy.y < (room.y + room.h) * 32);
  }
  const roaming = state.enemies.length;
  spawnEnemy('monster');
  assert.equal(state.enemies.length, roaming + 1);
  const scout = state.enemies.at(-1);
  assert.ok(state.world.rooms.every(room => scout.x < room.x * 32 || scout.x >= (room.x + room.w) * 32 || scout.y < room.y * 32 || scout.y >= (room.y + room.h) * 32), 'roaming threats should start in corridors');
});

test('both arena teams have a melee pickup to discover', () => {
  const { state, generateWorld, spawnLoot } = loadGameLogic();
  state.mode = 'pvp';
  generateWorld('pvp');
  state.player = { alive: false, x: 0, y: 0, r: 11 };
  state.bots = [];
  state.enemies = [];
  spawnLoot(18);
  for (let team = 0; team < 2; team++) {
    const pickup = state.loot[team];
    assert.equal(pickup.type, 'weapon');
    assert.ok([4, 5, 6].includes(pickup.weapon));
    assert.ok(Math.hypot(pickup.x - state.world.spawnZones[team].x, pickup.y - state.world.spawnZones[team].y) <= 8 * 32);
  }
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
  let gainedFiringLane = false;
  for (let frame = 25; frame < 190; frame++) {
    updateBot(blue, 0.016, frame * 16);
    updateBot(red, 0.016, frame * 16);
    if (firingLaneClear(blue, red)) { gainedFiringLane = true; break; }
  }
  assert.ok(gainedFiringLane, 'bots should round the corner and gain a firing lane');
});

test('bots prefer an exposed opponent over a closer one behind a corner', () => {
  const { state, updateBot } = loadGameLogic();
  const map = Array.from({ length: 9 }, () => Array(9).fill(1));
  for (let y = 1; y <= 6; y++) map[y][2] = 0;
  for (let x = 2; x <= 6; x++) map[5][x] = 0;
  state.world = { w: 9, h: 9, tile: 32, map };
  state.mode = 'pvp';
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  state.loot = [];
  state.bullets = [];
  state.particles = [];
  const bot = (team, x, y) => ({ team, x, y, r: 10, hp: 100, maxHp: 100, speed: 0, alive: true, ai: true, inventory: [0, null, null, null], active: 0, ammo: {}, think: 0, fireTime: Infinity });
  const blue = bot('blue', 2.5 * 32, 3.5 * 32);
  const hidden = bot('red', 4.5 * 32, 5.5 * 32);
  const exposed = bot('red', 2.5 * 32, 6.5 * 32);
  state.bots = [blue, hidden, exposed];
  assert.ok(Math.hypot(blue.x - hidden.x, blue.y - hidden.y) < Math.hypot(blue.x - exposed.x, blue.y - exposed.y));
  updateBot(blue, .016, 1000);
  assert.equal(blue.target, exposed);
});

test('bots retarget the opponent shooting at or hitting them', () => {
  const { state, updateBot, shoot, hit } = loadGameLogic();
  state.world = { w: 12, h: 9, tile: 32, map: Array.from({ length: 9 }, (_, y) => Array.from({ length: 12 }, (_, x) => x === 0 || y === 0 || x === 11 || y === 8 ? 1 : 0)) };
  state.mode = 'pvp';
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  state.loot = [];
  state.bullets = [];
  state.particles = [];
  const bot = (team, x, y) => ({ team, x, y, r: 10, hp: 100, maxHp: 100, speed: 0, alive: true, ai: true, inventory: [0, null, null, null], active: 0, ammo: {}, think: 0, fireTime: Infinity });
  const blue = bot('blue', 4.5 * 32, 3.5 * 32);
  const first = bot('red', 6.5 * 32, 3.5 * 32);
  const attacker = bot('red', 4.5 * 32, 6.5 * 32);
  state.bots = [blue, first, attacker];
  updateBot(blue, .016, 1000);
  assert.equal(blue.target, first);

  shoot(attacker, -Math.PI / 2, 1016);
  assert.equal(blue.think, 0, 'an aimed shot should prompt a new target decision even if it misses');
  updateBot(blue, .016, 1032);
  assert.equal(blue.target, attacker);
  assert.ok(Math.abs(blue.angle - Math.PI / 2) < .01);

  state.elapsed = 4;
  blue.target = first;
  blue.think = 1;
  hit(blue, 5, attacker);
  assert.equal(blue.think, 0, 'a hit should force an immediate target decision');
  updateBot(blue, .016, 1048);
  assert.equal(blue.target, attacker);
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

test('bots drop collected weapons and supplies once when eliminated', () => {
  const { state, botPickupLoot, hit } = loadGameLogic();
  state.world = { tile: 32, map: Array.from({ length: 8 }, () => Array(8).fill(0)) };
  state.mode = 'pvp';
  state.player = { alive: false, team: 'blue', x: 200, y: 200 };
  state.enemies = [];
  state.particles = [];
  state.lootRespawns = [];
  state.loot = [
    { x: 80, y: 80, type: 'weapon', weapon: 4, label: 'KNIFE', color: '#c4d0c7' },
    { x: 80, y: 80, type: 'grenade', label: 'GRENADE', color: '#dd8e68' },
    { x: 80, y: 80, type: 'armor', label: 'ARMOR', color: '#78b5de' },
  ];
  const red = { x: 80, y: 80, r: 10, hp: 20, maxHp: 100, armor: 0, team: 'red', alive: true, ai: true, inventory: [0, 1, null, null], active: 0, ammo: { 1: 30 }, pickedSlots: [false, false, false, false], pickupRoll: () => 0 };
  const blue = { x: 120, y: 80, team: 'blue' };
  state.bots = [red];
  botPickupLoot(red);
  botPickupLoot(red);
  botPickupLoot(red);
  assert.equal(state.loot.length, 0);
  assert.equal(red.inventory[2], 4);
  assert.equal(red.inventory[3].item, 'grenade');
  hit(red, 70, blue);
  assert.equal(red.alive, false);
  assert.deepEqual(state.loot.map(item => item.type).sort(), ['armor', 'grenade', 'weapon']);
  assert.equal(state.loot.find(item => item.type === 'weapon').weapon, 4);
  assert.equal(state.loot.find(item => item.type === 'grenade').count, 1);
  hit(red, 70, blue);
  assert.equal(state.loot.length, 3, 'dead bots must not drop the same gear twice');
});

test('bots reject an inferior same-family gun but consider a new role', () => {
  const { state, botCanTakeLoot, botPickupLoot } = loadGameLogic();
  state.mode = 'pvp';
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  state.lootRespawns = [];
  state.loot = [
    { x: 80, y: 80, type: 'weapon', weapon: 1, label: 'SMG', color: '#eabf72' },
    { x: 80, y: 80, type: 'weapon', weapon: 3, label: 'RIFLE', color: '#d9c786' },
  ];
  const bot = { x: 80, y: 80, r: 10, alive: true, team: 'red', inventory: [0, 8, null, null], ammo: {}, pickedSlots: [false, false, false, false], pickupRoll: () => 0 };
  state.bots = [bot];
  state.enemies = [];
  assert.equal(botCanTakeLoot(bot, state.loot[0]), false);
  assert.equal(botCanTakeLoot(bot, state.loot[1]), true);
  botPickupLoot(bot);
  assert.equal(bot.inventory[1], 8, 'rare SMG should be retained');
  assert.ok(bot.inventory.includes(3), 'the rifle adds longer-range coverage');
  assert.equal(state.loot.some(item => item.weapon === 1), true, 'inferior SMG should remain on the ground');
});

test('bots may pass on a situational weapon instead of always taking it', () => {
  const { state, botCanTakeLoot } = loadGameLogic();
  const knife = { type: 'weapon', weapon: 4 };
  const bot = { x: 0, y: 0, alive: true, inventory: [0, 1, null, null], pickupRoll: () => .99 };
  assert.equal(botCanTakeLoot(bot, knife), false);
  bot.pickupRoll = () => 0;
  assert.equal(botCanTakeLoot(bot, { ...knife }), true);
});

test('bullets leave the gun in a straight line and hit between frames', () => {
  const { state, shoot, advanceBullet } = loadGameLogic(() => .5);
  state.world = { w: 20, h: 8, tile: 32, map: Array.from({ length: 8 }, () => Array(20).fill(0)) };
  state.mode = 'pvp';
  state.particles = [];
  state.bullets = [];
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  const owner = { x: 80, y: 80, r: 10, alive: true, team: 'red', inventory: [1, 3, null, null], active: 0 };
  const target = { x: 113, y: 80, r: 10, hp: 100, maxHp: 100, armor: 0, invuln: 0, alive: true, team: 'blue' };
  state.bots = [owner, target];
  shoot(owner, Math.PI / 4, 1000);
  const smgBullet = state.bullets.pop();
  assert.ok(Math.abs(smgBullet.x - (owner.x + Math.cos(Math.PI / 4) * 18)) < 1e-9);
  assert.ok(Math.abs(smgBullet.y - (owner.y + Math.sin(Math.PI / 4) * 18)) < 1e-9);
  assert.ok(Math.abs(smgBullet.vy / smgBullet.vx - 1) < 1e-9, 'SMG round should follow the aim exactly');
  owner.active = 1;
  shoot(owner, 0, 1100);
  const rifleBullet = state.bullets.pop();
  advanceBullet(rifleBullet, .045);
  assert.equal(target.hp, 66, 'swept collision should hit even when the frame endpoint passes the target');
});

test('a close shotgun blast deals substantial damage and pellets share a muzzle', () => {
  const { state, shoot, advanceBullet, WEAPONS } = loadGameLogic(() => .5);
  state.world = { w: 20, h: 8, tile: 32, map: Array.from({ length: 8 }, () => Array(20).fill(0)) };
  state.mode = 'pvp';
  state.particles = [];
  state.bullets = [];
  state.player = { alive: false, team: 'blue', x: 0, y: 0 };
  const owner = { x: 80, y: 80, r: 10, alive: true, team: 'red', inventory: [2, null, null, null], active: 0 };
  const target = { x: 130, y: 80, r: 10, hp: 150, maxHp: 150, armor: 0, invuln: 0, alive: true, team: 'blue' };
  state.bots = [owner, target];
  shoot(owner, 0, 1000);
  assert.equal(state.bullets.length, WEAPONS[2].pellets);
  assert.equal(new Set(state.bullets.map(bullet => `${bullet.x},${bullet.y}`)).size, 1);
  for (const bullet of state.bullets) advanceBullet(bullet, .08);
  assert.equal(target.hp, 150 - WEAPONS[2].damage * WEAPONS[2].pellets);
});

test('melee bots close into range and their swing can hit the player', () => {
  const { state, updateBot, shoot } = loadGameLogic();
  state.world = { w: 12, h: 8, tile: 32, map: Array.from({ length: 8 }, () => Array(12).fill(0)) };
  state.mode = 'pvp';
  state.loot = [];
  state.particles = [];
  state.bullets = [];
  state.player = { x: 180, y: 80, r: 11, hp: 100, maxHp: 100, armor: 0, invuln: 0, alive: true, team: 'blue' };
  const red = { x: 80, y: 80, r: 10, speed: 100, hp: 100, maxHp: 100, alive: true, team: 'red', inventory: [0, 1, 4, null], active: 1, ammo: {}, think: 0, fireTime: Infinity, invuln: 0, hitFlash: 0 };
  state.bots = [red];
  updateBot(red, 0.016, 1000);
  assert.equal(red.active, 2, 'bot should select its knife nearby');
  assert.ok(red.x > 80, 'melee bot should move toward striking distance');
  red.x = 135;
  shoot(red, 0, 1100);
  assert.equal(state.player.hp, 62);
  assert.equal(red.swingStarted, 1100);
  assert.equal(red.swingUntil, 1400);
});

test('melee rendering sweeps the weapon through different angles', () => {
  const rotations = [];
  const context2d = new Proxy({ globalAlpha: 1 }, {
    get(target, key) { return key in target ? target[key] : (...args) => { if (key === 'rotate') rotations.push(args[0]); }; },
    set(target, key, value) { target[key] = value; return true; },
  });
  const context = { document: { querySelector: () => ({ getContext: () => context2d }) } };
  vm.runInNewContext(`${definitions}\nglobalThis.lab = { state, drawEntity };`, context);
  const { state, drawEntity } = context.lab;
  state.camera = { x: 0, y: 0 };
  const fighter = { x: 80, y: 80, r: 10, hp: 100, maxHp: 100, angle: 0, invuln: 0, inventory: [4], active: 0, swingStarted: 1000, swingUntil: 1300 };
  drawEntity(fighter, '#c0ef75', 1020, '');
  const earlySwing = rotations.at(-1);
  rotations.length = 0;
  drawEntity(fighter, '#c0ef75', 1260, '');
  const lateSwing = rotations.at(-1);
  assert.ok(earlySwing < lateSwing, 'the held knife should visibly sweep during the strike');
});
