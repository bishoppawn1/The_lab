import assert from 'node:assert/strict';
import { test } from 'node:test';
import WebSocket from 'ws';
import { createFacility } from '../src/facility.js';
import { AuthoritativeMatch } from '../src/authoritative-match.js';
import { startMatchServer } from '../scripts/match-server.js';

function openArena(match){
  const w=16,h=10;
  match.world={w,h,tile:32,seed:match.seed,map:Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>x===0||y===0||x===w-1||y===h-1?1:0)),
    doors:[],doorTiles:new Map(),spawnZones:[{x:80,y:80},{x:390,y:230}],corridors:{segments:[{x1:2,x2:13,y1:2,y2:7}]}};
  match.bots=[];match.loot=[];match.lootRespawns=[];
}

test('the server owns a seeded map, team slots, and bounded movement',()=>{
  const match=new AuthoritativeMatch({seed:0x12345678});
  assert.deepEqual(match.world.map,createFacility('pvp',0x12345678).world.map);
  const blue=match.addPlayer(),red=match.addPlayer();
  assert.equal(blue.team,'blue');assert.equal(red.team,'red');
  assert.equal(match.bots.length,8);
  const bots=match.bots;
  openArena(match);
  blue.x=80;blue.y=80;red.x=390;red.y=230;
  assert.equal(match.submitInput(blue.id,{moveX:999,moveY:999,aim:0,hit:red.id,damage:9999}),true);
  match.step(1/30);
  assert.ok(Math.hypot(blue.x-80,blue.y-80)<=blue.speed/30+.001);
  assert.equal(red.hp,100,'a claimed hit is not a control');
  assert.equal(match.submitInput('forged',{fire:true}),false);
  match.bots=bots;
  match.removePlayer(blue.id);
  assert.equal(match.bots.length,9,'a bot fills the released team slot');
});

test('only simulated bullets, pickups, and damage change match state',()=>{
  const match=new AuthoritativeMatch({seed:18}),blue=match.addPlayer('blue'),red=match.addPlayer('red');
  openArena(match);
  Object.assign(blue,{x:80,y:80,angle:0,inventory:[0,null,null,null],active:0,ammo:{0:12}});
  Object.assign(red,{x:123,y:80,armor:0,invuln:0});
  match.submitInput(blue.id,{aim:0,fire:true,hit:red.id,damage:1000});
  match.step(1/30);
  assert.equal(red.hp,74,'the server applies pistol damage');
  assert.equal(blue.ammo[0],11);
  match.submitInput(blue.id,{aim:0,fire:false});
  const loot={id:'found-grenade',type:'grenade',x:blue.x+19,y:blue.y,count:2};
  match.loot.push(loot);
  match.submitInput(blue.id,{interact:true});
  match.step(1/30);
  assert.equal(match.loot.includes(loot),false);
  assert.equal(blue.inventory[1].item,'grenade');
  assert.equal(blue.inventory[1].count,2);
  match.damage(red,1000,blue);
  assert.equal(red.alive,false);
  assert.equal(match.scoreBlue,1);
  assert.equal(match.scoreRed,0);
  for(let i=0;i<70;i++)match.step(1/30);
  assert.equal(red.alive,true);
  assert.equal(red.hp,100);
});

test('doors and fog are decided by server positions, not input claims',()=>{
  const match=new AuthoritativeMatch({seed:25}),blue=match.addPlayer('blue'),red=match.addPlayer('red');
  openArena(match);
  const door={x:4,y:4,cx:5*32,cy:4.5*32,open:false,room:{name:'ARMORY'}};
  match.world.map[4].fill(1);
  match.world.map[4][4]=0;match.world.map[4][5]=0;
  match.world.doors=[door];
  match.world.doorTiles=new Map([['4,4',door],['5,4',door]]);
  Object.assign(blue,{x:4.5*32,y:3.5*32});
  Object.assign(red,{x:4.5*32,y:5.5*32});
  assert.equal(match.snapshot(blue.id).units.some(unit=>unit.id===red.id),false);
  match.submitInput(blue.id,{doorOpen:true});
  match.step(1/30);
  assert.equal(door.open,false);
  match.submitInput(blue.id,{interact:true});
  match.step(1/30);
  assert.equal(door.open,true);
  assert.equal(match.snapshot(blue.id).units.some(unit=>unit.id===red.id),true);
  assert.deepEqual(match.snapshot(blue.id).doors,[{index:0,open:true}]);
});

test('picked gear drops on death, grenades consume a slot, and score ends the match',()=>{
  const match=new AuthoritativeMatch({seed:31,target:50}),blue=match.addPlayer('blue'),red=match.addPlayer('red');
  openArena(match);
  Object.assign(blue,{x:80,y:80,inventory:[0,{item:'grenade',count:1},null,null],pickedSlots:[false,true,false,false],angle:0});
  Object.assign(red,{x:280,y:80,armor:0,invuln:0});
  match.submitInput(blue.id,{grenade:true});
  match.step(1/30);
  assert.equal(blue.inventory[1],null);
  assert.equal(match.grenades.length,1);
  match.scoreBlue=49;
  match.damage(red,1000,blue);
  assert.equal(match.winner,'blue');
  assert.equal(match.scoreBlue,50);
  const elapsed=match.elapsed;
  match.step(1/30);
  assert.equal(match.elapsed,elapsed,'a finished match is frozen');

  const second=new AuthoritativeMatch({seed:32});
  const player=second.addPlayer('blue'),opponent=second.addPlayer('red');
  openArena(second);
  Object.assign(player,{x:80,y:80,inventory:[0,{item:'health',count:2},null,null],pickedSlots:[false,true,false,false],invuln:0});
  Object.assign(opponent,{x:190,y:80,invuln:0});
  second.damage(player,1000,opponent);
  assert.ok(second.loot.some(item=>item.type==='health'&&item.count===2));
});

test('slot selection applies before interaction and a 10v10 server keeps simulating',()=>{
  const match=new AuthoritativeMatch({seed:44,teamSize:10});
  const player=match.addPlayer('blue'),enemy=match.addPlayer('red');
  assert.equal(match.bots.length,18);
  for(let i=0;i<30;i++)match.step(1/30);
  assert.ok(match.elapsed>.9);
  openArena(match);
  Object.assign(player,{x:80,y:80,inventory:[0,1,2,3],active:0});
  Object.assign(enemy,{x:390,y:230});
  const medkit={id:'medkit',type:'health',x:player.x+20,y:player.y,count:1};
  match.loot.push(medkit);
  match.submitInput(player.id,{slot:2,interact:true});
  match.step(1/30);
  assert.equal(player.inventory[0],0);
  assert.equal(player.inventory[2].item,'health');
  assert.ok(match.loot.some(item=>item.type==='weapon'&&item.weapon===2));
});

test('grenade fuse, friendly fire, and collected-loot respawn resolve on the server',()=>{
  const match=new AuthoritativeMatch({seed:61});
  const thrower=match.addPlayer('blue'),ally=match.addPlayer('blue'),enemy=match.addPlayer('red');
  openArena(match);
  Object.assign(thrower,{x:80,y:80,angle:0,inventory:[0,{item:'grenade',count:1},null,null]});
  Object.assign(ally,{x:285,y:80,armor:0,invuln:0});
  Object.assign(enemy,{x:290,y:80,armor:0,invuln:0});
  match.submitInput(thrower.id,{grenade:true});
  for(let i=0;i<16;i++)match.step(1/30);
  assert.equal(enemy.alive,false);
  assert.equal(ally.hp,100);
  assert.equal(match.scoreBlue,1);
  const item={id:'seeded',spawnId:'seeded',type:'health',x:350,y:170};
  match.loot.push(item);
  match.takeLoot(item);
  match.elapsed=6.6;
  match.step(1/30);
  const replacement=match.loot.find(loot=>loot.spawnId==='seeded');
  assert.ok(replacement);
  assert.notEqual(replacement.type,'health');
});

test('the WebSocket process accepts controls and sends authoritative snapshots',async()=>{
  const server=await startMatchServer({port:0,seed:77});
  const clients=[];
  const connect=()=>new Promise((resolve,reject)=>{
    const socket=new WebSocket(`ws://127.0.0.1:${server.address.port}/match`),messages=[];
    clients.push(socket);
    socket.on('message',data=>messages.push(JSON.parse(data.toString())));
    socket.once('open',()=>resolve({socket,messages}));
    socket.once('error',reject);
  });
  try{
    const first=await connect(),second=await connect();
    await new Promise(resolve=>setTimeout(resolve,150));
    const welcomeA=first.messages.find(message=>message.type==='welcome');
    const welcomeB=second.messages.find(message=>message.type==='welcome');
    assert.ok(welcomeA&&welcomeB);
    assert.notEqual(welcomeA.id,welcomeB.id);
    assert.notEqual(welcomeA.team,welcomeB.team);
    assert.equal(welcomeA.seed,77);
    const before=server.match.players.get(welcomeA.id).x;
    first.socket.send(JSON.stringify({type:'input',moveX:1,moveY:0,aim:0,fire:false,hit:welcomeB.id,damage:1000}));
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.ok(server.match.players.get(welcomeA.id).x>before);
    assert.ok(first.messages.some(message=>message.type==='snapshot'));
    const health=await fetch(`http://127.0.0.1:${server.address.port}/health`).then(response=>response.json());
    assert.equal(health.players,2);
  }finally{
    for(const client of clients)client.terminate();
    await server.close();
  }
});
