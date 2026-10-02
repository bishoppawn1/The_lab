import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFacility, createSeededRandom } from '../src/facility.js';
import {
  WEAPONS, createArenaStarterKit, createBotStarterKit, collectInventoryItem, consumeInventoryItem, healWithMedkit,
  botWeaponPlan, updateArenaBot, isBlocked, hasLineOfSight, moveActor, findPathStep,
  changeDoorState, canSeeOpponent, revealTiles, createGunProjectiles,
  advanceProjectile, applyDamage, recordElimination, winningTeam,
} from '../src/arena-core.js';

test('a match seed reproduces the whole facility in Node', () => {
  const first=createFacility('pvp', 0x12345678);
  const again=createFacility('pvp', 0x12345678);
  const other=createFacility('pvp', 0x12345679);
  assert.deepEqual(again, first);
  assert.equal(first.world.seed, 0x12345678);
  assert.notDeepEqual(other.world.map, first.world.map);
  assert.deepEqual(createArenaStarterKit(createSeededRandom(42)), createArenaStarterKit(createSeededRandom(42)));
});

test('shared collision, doors, and team vision agree about a blocked passage', () => {
  const map=Array.from({length:9},(_,y)=>Array.from({length:9},(_,x)=>x===0||y===0||x===8||y===8||y===4?1:0));
  map[4][4]=0;
  const door={x:4,y:4,open:false},world={w:9,h:9,tile:32,map,doorTiles:new Map([['4,4',door]]),visionAt:100};
  const blue={x:4.5*32,y:3.5*32,r:10,team:'blue',alive:true};
  const red={x:4.5*32,y:5.5*32,r:10,team:'red',alive:true};
  assert.equal(isBlocked(world,door.x*32+16,door.y*32+16,2),true);
  assert.equal(hasLineOfSight(world,blue,red),false);
  assert.equal(canSeeOpponent(world,blue,red,448),false);
  assert.equal(revealTiles(world,[{actor:blue,radius:5}]).has('4,5'),false);
  assert.equal(changeDoorState(world,door,true,[blue,red]),true);
  assert.equal(world.visionAt,-Infinity);
  assert.equal(hasLineOfSight(world,blue,red),true);
  assert.equal(canSeeOpponent(world,blue,red,448),true);
  assert.equal(revealTiles(world,[{actor:blue,radius:5}]).has('4,5'),true);
  const inDoor={...blue,y:4.5*32};
  assert.equal(changeDoorState(world,door,false,[inDoor]),false);
  assert.equal(door.open,true);
  assert.equal(changeDoorState(world,door,false,[blue,red]),true);
  moveActor(world,blue,0,32);
  assert.equal(blue.y,3.5*32);
});

test('shared firearm, armor, death, and score rules resolve a fight without a browser', () => {
  const world={tile:32,map:Array.from({length:8},()=>Array(12).fill(0))};
  const blue={x:80,y:80,r:10,team:'blue',alive:true};
  const red={x:130,y:80,r:10,team:'red',alive:true,hp:40,armor:10,invuln:0};
  const match={scoreBlue:49,scoreRed:0};
  for(let shot=0;shot<2;shot++){
    const [bullet]=createGunProjectiles(blue,WEAPONS[0],0);
    const struck=advanceProjectile(world,bullet,.1,[red]);
    assert.equal(struck,red);
    assert.equal(bullet.dead,true);
    const result=applyDamage(struck,bullet.damage);
    if(result.killed)recordElimination(match,struck.team);
  }
  assert.equal(red.alive,false);
  assert.equal(match.scoreBlue,50);
  assert.equal(winningTeam(match,50),'blue');
  assert.deepEqual(applyDamage(red,26),{applied:false,killed:false});
});

test('shared inventory rules keep supplies in four slots and preserve stronger gun variants', () => {
  const fighter={alive:true,hp:40,maxHp:100,armor:0,inventory:[0,8,{item:'grenade',count:1},3],ammo:{}};
  assert.equal(botWeaponPlan(fighter,1),null,'a common SMG should not replace a tactical SMG');
  assert.equal(collectInventoryItem(fighter,{type:'health',count:1}).collected,false);
  const replaced=collectInventoryItem(fighter,{type:'health',count:2},3);
  assert.equal(replaced.replaced,3);
  assert.equal(fighter.inventory.length,4);
  assert.equal(healWithMedkit(fighter,3),true);
  assert.equal(fighter.hp,85);
  assert.equal(fighter.inventory[3].count,1);
  assert.equal(consumeInventoryItem(fighter,'grenade',2),true);
  assert.equal(fighter.inventory[2],null);
  assert.equal(collectInventoryItem(fighter,{type:'armor'}).slot,null);
  assert.equal(fighter.armor,50);
});

test('a bot can acquire and lose a target in the headless arena rules', () => {
  const map=Array.from({length:9},(_,y)=>Array.from({length:12},(_,x)=>x===0||y===0||x===11||y===8?1:0));
  const world={w:12,h:9,tile:32,map};
  const bot={x:2.5*32,y:4.5*32,r:10,speed:100,team:'blue',alive:true,inventory:[0,null,null,null],active:0,think:0,fireTime:Infinity};
  const player={x:7.5*32,y:4.5*32,r:11,team:'red',alive:true};
  const match={world,bots:[bot],player,loot:[],elapsed:0,botSightRange:448};
  updateArenaBot(match,bot,.1,1000,{random:()=>.5});
  assert.equal(bot.target,player);
  assert.ok(bot.x>2.5*32);
  map[4][5]=1;
  bot.think=0;
  updateArenaBot(match,bot,.1,1100,{random:()=>.5});
  assert.equal(bot.target,null);
});

test('solid room furniture blocks movement, sight, and gunfire while its front stays visible', () => {
  const map=Array.from({length:9},(_,y)=>Array.from({length:12},(_,x)=>x===0||y===0||x===11||y===8?1:0));
  const prop={x:5.5*32,y:4.5*32,halfW:14,halfH:11};
  const world={w:12,h:9,tile:32,map,coverGrid:new Map([['5,4',prop]])};
  const actor={x:3.5*32,y:4.5*32,r:10},target={x:8.5*32,y:4.5*32};
  assert.equal(isBlocked(world,prop.x,prop.y,10),true);
  assert.equal(hasLineOfSight(world,actor,target),false);
  const visible=revealTiles(world,[{actor,radius:Infinity}]);
  assert.equal(visible.has('5,4'),true,'the cover itself should be visible');
  assert.equal(visible.has('8,4'),false,'terrain behind cover stays hidden');
  const [shot]=createGunProjectiles(actor,WEAPONS[0],0);
  advanceProjectile(world,shot,.4,[]);
  assert.equal(shot.dead,true);
  assert.ok(shot.x<target.x);
  const next=findPathStep(world,actor,target);
  assert.notDeepEqual(next,{x:prop.x,y:prop.y},'bots must route around solid props');
});

test('under-equipped bots search new rooms and prioritize the central cache', () => {
  const map=Array.from({length:20},(_,y)=>Array.from({length:30},(_,x)=>x===0||y===0||x===29||y===19?1:0));
  const rooms=[{name:'ENTRY BAY',x:2,y:7,w:5,h:5},{name:'SUPPLY HUB',x:11,y:6,w:7,h:7},{name:'ARMORY',x:23,y:7,w:5,h:5}];
  const world={w:30,h:20,tile:32,map,rooms};
  const bot={x:4.5*32,y:9.5*32,r:10,speed:100,team:'blue',alive:true,inventory:[0,null,null,null],active:0,think:0,fireTime:Infinity};
  const match={world,bots:[bot],player:null,loot:[],elapsed:0,botSightRange:288};
  updateArenaBot(match,bot,.016,1000,{random:()=>0});
  assert.equal(bot.patrolRoom,'SUPPLY HUB');
  assert.ok(bot.exploredRooms.has('ENTRY BAY'));
  Object.assign(bot,{x:14.5*32,y:9.5*32,think:0});
  updateArenaBot(match,bot,.016,1100,{random:()=>0});
  assert.ok(bot.exploredRooms.has('SUPPLY HUB'));
  assert.equal(bot.patrolRoom,'ARMORY');
  const kit=createBotStarterKit(()=>0);
  assert.deepEqual(kit.inventory,[0,null,null,null]);
});
