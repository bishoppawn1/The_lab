import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as arenaCore from '../src/arena-core.js';
import * as facility from '../src/facility.js';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const script = source.replace(/^import[^\n]*\n/gm, '');
const definitions = script.slice(0, script.indexOf("$('#select-survival').addEventListener"));
function fixture(mode = 'survival') {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: '', style: {}, dataset: {}, getContext: () => ({}),
      setAttribute() {}, addEventListener() {}, appendChild() {},
      classList: { add() {}, remove() {}, toggle() {} },
      prepend() {}, children: [], lastElementChild: {},
    });
    return elements.get(selector);
  };
  const context = { ...arenaCore, ...facility, scoreBotWeapon: arenaCore.botWeaponScore, planBotWeapon: arenaCore.botWeaponPlan, botAcceptsLoot: arenaCore.botCanTakeLoot, document: { querySelector: element, createElement: () => element('log') }, performance: { now: () => 1000 } };
  vm.runInNewContext(`${definitions}\nglobalThis.lab = { state, setDoorOpen, nearbyDoor, nearbyInteraction, updateVision, blocked, lineClear, advanceBullet, interact, onKeyDown, updateHUD };`, context);
  const lab = context.lab, { state } = lab;
  const w = 50, h = 50;
  state.world = { w, h, tile: 32, map: Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : 0)), visible: new Set(), explored: new Set(), visionAt: -Infinity, exit: { x: 1500, y: 1500, r: 39 }, doors: [], doorTiles: new Map() };
  state.mode = mode;
  state.running = true;
  state.player = { x: 20.5 * 32, y: 20.5 * 32, r: 11, alive: true, team: 'blue', hp: 100, maxHp: 100, inventory: [0, null, null, null], ammo: {}, active: 0 };
  return { ...lab, element };
}
function addDoor(state) {
  const door = { x: 20, y: 21, cx: 21 * 32, cy: 21.5 * 32, open: false, room: { name: 'ARMORY' }, approach: { x: 21 * 32, y: 22.5 * 32 } };
  state.world.map[21].fill(1);
  for (let x = 20; x <= 21; x++) {
    state.world.map[21][x] = 0;
    state.world.doorTiles.set(`${x},21`, door);
  }
  state.world.doors.push(door);
  Object.assign(state.player, door.approach);
  return door;
}

test('player visibility reaches the end of an open hall in both modes and still stops at walls', () => {
  for (const mode of ['survival', 'pvp']) {
    const { state, updateVision } = fixture(mode);
    updateVision(1000);
    assert.equal(state.world.visible.has('45,20'), true, '25 tiles down a clear hall is visible');
    assert.equal(state.world.visible.has('35,20'), true, 'there is no fixed 14-tile limit');
    assert.equal(state.world.visible.has('30,30'), true, 'clear diagonal tiles are visible');
    state.world.map[20][25] = 1;
    updateVision(1200);
    assert.equal(state.world.visible.has('45,20'), false, 'walls still occlude distant terrain');
  }
});

test('doors repeatedly open and close from either side, restoring collision and fog', () => {
  for (const mode of ['survival', 'pvp']) {
    const { state, interact, blocked, lineClear, updateVision, updateHUD, element } = fixture(mode);
    const door = addDoor(state), inside = { x: door.cx, y: 20.5 * 32 };
    for (const position of [door.approach, inside]) {
      Object.assign(state.player, position);
      const opposite = position === inside ? door.approach : inside;
      const oppositeKey = `${Math.floor(opposite.x / 32)},${Math.floor(opposite.y / 32)}`;
      for (let cycle = 0; cycle < 3; cycle++) {
        updateHUD();
        assert.equal(element('#context-prompt').textContent, '[ E ] OPEN ARMORY');
        interact();
        assert.equal(door.open, true);
        assert.equal(blocked(door.cx, door.cy, 2), false);
        assert.equal(lineClear(state.player, opposite), true);
        updateVision(1000);
        assert.equal(state.world.visible.has(oppositeKey), true);
        updateHUD();
        assert.equal(element('#context-prompt').textContent, '[ E ] CLOSE ARMORY');
        interact();
        assert.equal(door.open, false);
        assert.equal(blocked(door.cx, door.cy, 2), true);
        assert.equal(lineClear(state.player, opposite), false);
        updateVision(1000);
        assert.equal(state.world.visible.has(oppositeKey), false, 'closing invalidates cached vision immediately');
      }
    }
  }
});

test('doors cannot close on a living player, bot, or monster, including the doorway edges', () => {
  for (const unitType of ['player', 'bot', 'monster']) {
    const { state, setDoorOpen, element } = fixture();
    const door = addDoor(state);
    setDoorOpen(door, true);
    const unit = { x: door.cx, y: door.cy + 24, r: 11, alive: true };
    if (unitType === 'player') Object.assign(state.player, unit);
    else state[unitType === 'bot' ? 'bots' : 'enemies'].push(unit);
    assert.equal(setDoorOpen(door, false, state.player), false);
    assert.equal(door.open, true);
    assert.equal(element('#notice').textContent, 'DOORWAY BLOCKED — STEP CLEAR');
    if (unitType === 'player') Object.assign(state.player, door.approach);
    else unit.alive = false;
    assert.equal(setDoorOpen(door, false, state.player), true);
  }
});

test('door interactions ignore keyboard repeats and paused or finished runs', () => {
  const { state, onKeyDown } = fixture();
  const door = addDoor(state);
  onKeyDown({ key: 'e', repeat: false });
  assert.equal(door.open, true);
  onKeyDown({ key: 'e', repeat: true });
  assert.equal(door.open, true);
  state.paused = true;
  onKeyDown({ key: 'e', repeat: false });
  assert.equal(door.open, true);
  state.paused = false;
  state.running = false;
  onKeyDown({ key: 'e', repeat: false });
  assert.equal(door.open, true);
  state.running = true;
  onKeyDown({ key: 'e', repeat: false });
  assert.equal(door.open, false);
});

test('supplies by an open door remain collectible and the HUD describes the selected action', () => {
  const { state, setDoorOpen, interact, updateVision, updateHUD, element } = fixture();
  const door = addDoor(state);
  setDoorOpen(door, true);
  const loot = { ...door.approach, type: 'armor', label: 'ARMOR' };
  state.player.armor = 0;
  state.loot.push(loot);
  updateVision(1000);
  updateHUD();
  assert.equal(element('#context-prompt').textContent, '[ E ] PICK UP ARMOR');
  interact();
  assert.equal(state.player.armor, 50);
  assert.equal(state.loot.length, 0);
  assert.equal(door.open, true);
  updateHUD();
  assert.equal(element('#context-prompt').textContent, '[ E ] CLOSE ARMORY');
  interact();
  assert.equal(door.open, false);
});

test('nearby doors cannot be operated through adjacent walls', () => {
  const { state, nearbyDoor } = fixture();
  const door = addDoor(state);
  state.player.x = door.x * 32 - 16;
  state.player.y = door.cy;
  assert.equal(nearbyDoor(state.player), null);
  Object.assign(state.player, door.approach);
  assert.equal(nearbyDoor(state.player), door);
});

test('closing a door stops bullets that would pass through it while open', () => {
  const { state, setDoorOpen, advanceBullet } = fixture();
  const door = addDoor(state);
  const bullet = () => ({ x: door.cx, y: door.cy + 32, vx: 0, vy: -600, life: 1, damage: 10, owner: state.player });
  setDoorOpen(door, true);
  const openShot = bullet();
  advanceBullet(openShot, .1);
  assert.notEqual(openShot.dead, true);
  setDoorOpen(door, false);
  const closedShot = bullet();
  advanceBullet(closedShot, .1);
  assert.equal(closedShot.dead, true);
});
