import { createFacility, createSeededRandom } from './facility.js';
import {
  WEAPONS, LOOT_TABLE, SUPPLY_LOOT, createArenaStarterKit, createBotStarterKit, collectInventoryItem,
  consumeInventoryItem, healWithMedkit, isBlocked, hasLineOfSight, moveActor,
  changeDoorState, updateArenaBot, revealTiles, createGunProjectiles,
  advanceProjectile, applyDamage, recordElimination, winningTeam, botCanTakeLoot,
  botWeaponPlan,
} from './arena-core.js';

const TICK_SECONDS=1/30;
const GRENADE_RANGE=210;
const MAX_INPUT_AXIS=1;
const BOT_SIGHT_RANGE=9*32;
const EMPTY_INPUT=()=>({moveX:0,moveY:0,aim:0,fire:false,actions:[]});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export class AuthoritativeMatch {
  constructor({seed=Math.floor(Math.random()*0x100000000),teamSize=5,target=50}={}){
    if(![5,10].includes(teamSize)||![50,100,250].includes(target))throw new RangeError('Invalid match settings');
    this.seed=seed;
    this.random=createSeededRandom((seed^0xa511e9b3)>>>0);
    const generated=createFacility('pvp',seed);
    this.world=generated.world;
    this.teamSize=teamSize;
    this.target=target;
    this.elapsed=0;
    this.scoreBlue=0;
    this.scoreRed=0;
    this.winner=null;
    this.players=new Map();
    this.bots=[];
    this.bullets=[];
    this.grenades=[];
    this.loot=[];
    this.lootRespawns=[];
    this.lootBaseCount=0;
    this.lootSpawnTimer=0;
    this.nextId=1;
    this.visionCache=new Map();
    this.botSightRange=BOT_SIGHT_RANGE;
    this.seedLoot();
    this.fillBots();
  }

  get fighters(){return [...this.players.values(),...this.bots];}
  rand(low,high){return low+this.random()*(high-low);}
  choice(items){return items[Math.floor(this.random()*items.length)];}
  weightedLoot(table=LOOT_TABLE){
    let roll=this.random()*table.reduce((sum,item)=>sum+item.weight,0);
    for(const item of table){roll-=item.weight;if(roll<=0)return item;}
    return table.at(-1);
  }
  openSpot(origin=null,minTiles=0,maxTiles=Infinity,room=null){
    const {world}=this,tile=world.tile;
    const valid=(x,y)=>{
      const point={x:(x+.5)*tile,y:(y+.5)*tile};
      if(world.map[y]?.[x]!==0||isBlocked(world,point.x,point.y,11))return false;
      if(origin){const d=distance(origin,point)/tile;if(d<minTiles||d>maxTiles)return false;}
      if(this.fighters.some(f=>f.alive&&distance(f,point)<f.r+20))return false;
      if(this.loot.some(item=>distance(item,point)<30))return false;
      return true;
    };
    const bounds=room?{x1:room.x+2,x2:room.x+room.w-3,y1:room.y+2,y2:room.y+room.h-3}:{x1:1,x2:world.w-2,y1:1,y2:world.h-2};
    for(let i=0;i<800;i++){
      const x=Math.floor(this.rand(bounds.x1,bounds.x2+1)),y=Math.floor(this.rand(bounds.y1,bounds.y2+1));
      if(valid(x,y))return{x:(x+.5)*tile,y:(y+.5)*tile};
    }
    for(let y=bounds.y1;y<=bounds.y2;y++)for(let x=bounds.x1;x<=bounds.x2;x++)if(valid(x,y))return{x:(x+.5)*tile,y:(y+.5)*tile};
    return null;
  }
  spawnPoint(team){
    const zone=this.world.spawnZones[team==='blue'?0:1];
    return this.openSpot(zone,0,7)||{...zone};
  }
  makeFighter(team,ai,id){
    const kit=(ai?createBotStarterKit:createArenaStarterKit)(this.random),point=this.spawnPoint(team);
    return{...point,id,team,ai,alive:true,r:ai?10:11,speed:ai?this.rand(85,115):176,
      hp:100,maxHp:100,armor:ai?25:35,invuln:0,hitFlash:0,respawn:0,
      ...kit,pickedSlots:[false,false,false,false],pickedArmor:false,
      angle:0,fireTime:0,reloadUntil:0,reloadingWeapon:null,think:0,target:null,
      input:EMPTY_INPUT(),interactAt:0,grenadeAt:0,kills:0};
  }
  fillBots(){
    for(const team of ['blue','red']){
      const count=this.fighters.filter(f=>f.team===team).length;
      for(let i=count;i<this.teamSize;i++)this.bots.push(this.makeFighter(team,true,`bot-${this.nextId++}`));
    }
  }
  addPlayer(team=null){
    if(this.winner)return null;
    const counts=Object.fromEntries(['blue','red'].map(side=>[side,[...this.players.values()].filter(p=>p.team===side).length]));
    const selected=team??(counts.blue<=counts.red?'blue':'red');
    if(!['blue','red'].includes(selected)||counts[selected]>=this.teamSize)return null;
    const botIndex=this.bots.findIndex(bot=>bot.team===selected);
    if(botIndex>=0)this.bots.splice(botIndex,1);
    const player=this.makeFighter(selected,false,`player-${this.nextId++}`);
    this.players.set(player.id,player);
    this.visionCache.clear();
    return player;
  }
  removePlayer(id){
    const player=this.players.get(id);
    if(!player)return false;
    for(let index=0;index<4;index++)if(player.pickedSlots[index])this.dropSlot(player.inventory[index],player);
    this.players.delete(id);
    this.fillBots();
    this.visionCache.clear();
    return true;
  }
  submitInput(id,input){
    const player=this.players.get(id);
    if(!player||!input||typeof input!=='object'||Array.isArray(input))return false;
    const finite=(n,defaultValue)=>typeof n==='number'&&Number.isFinite(n)?n:defaultValue;
    player.input.moveX=clamp(finite(input.moveX,0),-MAX_INPUT_AXIS,MAX_INPUT_AXIS);
    player.input.moveY=clamp(finite(input.moveY,0),-MAX_INPUT_AXIS,MAX_INPUT_AXIS);
    player.input.aim=finite(input.aim,player.input.aim);
    player.input.fire=input.fire===true;
    // Actions are requests, never client-supplied outcomes. Bound the queue so
    // a fast sender cannot accumulate actions between server ticks.
    if(Number.isInteger(input.slot)&&input.slot>=0&&input.slot<4)player.input.actions.push({slot:input.slot});
    for(const action of ['reload','interact','grenade'])if(input[action]===true&&!player.input.actions.includes(action))player.input.actions.push(action);
    if(player.input.actions.length>8)player.input.actions=player.input.actions.slice(-8);
    return true;
  }

  addLoot(spec,point,room=null,spawnId=null){
    if(!point)return null;
    const item={...point,...spec,r:10,id:`loot-${this.nextId++}`,spawnId,room};
    this.loot.push(item);
    return item;
  }
  seedLoot(){
    for(const team of ['blue','red']){
      const zone=this.world.spawnZones[team==='blue'?0:1],weapon=this.choice([4,5,6]);
      this.addLoot({type:'weapon',weapon,label:WEAPONS[weapon].name.toUpperCase(),color:WEAPONS[weapon].color},this.openSpot(zone,4,7),null,`${team}-melee`);
    }
    for(let i=2;i<40;i++)this.addLoot(this.weightedLoot(i<18?LOOT_TABLE:SUPPLY_LOOT),this.openSpot(),null,`world-${i}`);
    for(const room of this.world.rooms){
      const add=(spec,index)=>this.addLoot(spec,this.openSpot(null,0,Infinity,room),room.name,`${room.name}-${index}`);
      const type=kind=>LOOT_TABLE.find(item=>item.type===kind);
      if(room.name==='ARMORY')for(const family of [0,1,2,3])add(this.weightedLoot(LOOT_TABLE.filter(item=>item.type==='weapon'&&WEAPONS[item.weapon].family===family)),family);
      else if(room.name==='MEDICAL'){for(let i=0;i<3;i++)add(type('health'),i);add(type('armor'),3);}
      else if(room.name==='SUPPLY HUB'){
        let index=0;
        for(const weapon of [1,2,3,7,8,9])add(LOOT_TABLE.find(item=>item.weapon===weapon),index++);
        for(let i=0;i<2;i++){add(type('health'),index++);add(type('armor'),index++);}
        add(type('grenade'),index);
      }
      else if(room.name==='WORKSHOP')add(LOOT_TABLE.find(item=>item.weapon===16),0);
      else if(room.name==='POWER STATION')add(type('armor'),0);
      else if(room.name==='RESEARCH LAB')add(type('health'),0);
    }
    this.lootBaseCount=this.loot.length;
  }
  takeLoot(item){
    const index=this.loot.indexOf(item);
    if(index<0)return false;
    this.loot.splice(index,1);
    if(item.spawnId!=null)this.lootRespawns.push({item,at:this.elapsed+6});
    return true;
  }
  dropSlot(slot,actor){
    if(slot==null)return;
    const spec=typeof slot==='number'?{type:'weapon',weapon:slot,label:WEAPONS[slot].name.toUpperCase(),color:WEAPONS[slot].color}:{type:slot.item,label:slot.item.toUpperCase(),count:slot.count||1,color:slot.item==='health'?'#90d485':'#dd8e68'};
    const point=this.openSpot(actor,0,2)||{x:actor.x,y:actor.y};
    this.addLoot(spec,point);
  }
  collect(actor,item,slot=null){
    if(!actor.alive||!this.loot.includes(item)||distance(actor,item)>=39||!hasLineOfSight(this.world,actor,item))return false;
    if(actor.ai&&item.type==='weapon'){
      const plan=botWeaponPlan(actor,item.weapon);
      if(!plan)return false;
      slot=plan.slot;
    }
    if(!actor.ai&&slot==null&&item.type!=='armor'){
      const hasStack=(item.type==='health'||item.type==='grenade')&&actor.inventory.some(value=>value?.item===item.type);
      if(!hasStack&&!actor.inventory.some(value=>value==null))slot=actor.active;
    }
    const result=collectInventoryItem(actor,item,slot);
    if(!result.collected)return false;
    this.takeLoot(item);
    if(result.replaced!=null)this.dropSlot(result.replaced,actor);
    if(item.type==='armor'){if(actor.ai)actor.pickedArmor=true;}
    else actor.pickedSlots[result.slot]=true;
    if(!actor.ai&&result.slot!=null&&!result.stacked)actor.active=result.slot;
    return true;
  }
  nearbyDoor(actor,radius=54,closedOnly=false){
    const tile=this.world.tile;
    return this.world.doors.filter(door=>{
      if(closedOnly&&door.open||distance(actor,{x:door.cx,y:door.cy})>=radius)return false;
      const edge={x:clamp(actor.x,door.x*tile,(door.x+2)*tile),y:clamp(actor.y,door.y*tile,(door.y+1)*tile)};
      return hasLineOfSight(this.world,actor,edge,0);
    }).sort((a,b)=>distance(actor,{x:a.cx,y:a.cy})-distance(actor,{x:b.cx,y:b.cy}))[0]||null;
  }
  interact(actor){
    if(!actor.alive||this.elapsed<actor.interactAt)return;
    actor.interactAt=this.elapsed+.2;
    const door=this.nearbyDoor(actor);
    if(door&&!door.open){changeDoorState(this.world,door,true,this.fighters);return;}
    const item=this.loot.filter(loot=>distance(actor,loot)<39&&hasLineOfSight(this.world,actor,loot)).sort((a,b)=>distance(actor,a)-distance(actor,b))[0];
    if(item){this.collect(actor,item);return;}
    if(door)changeDoorState(this.world,door,false,this.fighters);
  }
  reload(actor){
    const id=actor.inventory[actor.active],weapon=WEAPONS[id];
    if(!weapon||weapon.kind!=='gun'||actor.reloadUntil>this.elapsed||actor.ammo[id]>=weapon.magazine)return;
    actor.reloadingWeapon=id;
    actor.reloadUntil=this.elapsed+(weapon.family===2&&weapon.name!=='Auto Shotgun'?1.05:.78);
  }
  shoot(actor){
    if(!actor.alive||this.elapsed*1000<actor.fireTime||this.elapsed<actor.reloadUntil)return;
    const slot=actor.inventory[actor.active];
    if(slot?.item==='health'){if(healWithMedkit(actor,actor.active))actor.fireTime=this.elapsed*1000+350;return;}
    if(slot?.item==='grenade'){this.throwGrenade(actor);return;}
    const id=typeof slot==='number'?slot:0,weapon=WEAPONS[id];
    if(weapon.kind==='gun'&&actor.ammo[id]<=0){this.reload(actor);return;}
    if(weapon.kind==='gun')actor.ammo[id]--;
    actor.fireTime=this.elapsed*1000+weapon.rate;
    if(weapon.kind==='melee'){
      actor.swingUntil=this.elapsed+.3;
      for(const target of this.fighters)if(target.alive&&target.team!==actor.team&&distance(actor,target)<weapon.range+actor.r&&hasLineOfSight(this.world,actor,target)){
        const direction=Math.atan2(target.y-actor.y,target.x-actor.x);
        if(Math.abs(Math.atan2(Math.sin(direction-actor.angle),Math.cos(direction-actor.angle)))<.85)this.damage(target,weapon.damage,actor);
      }
      return;
    }
    this.bullets.push(...createGunProjectiles(actor,weapon,actor.angle,this.random));
  }
  throwGrenade(actor){
    if(this.elapsed<actor.grenadeAt||!consumeInventoryItem(actor,'grenade'))return;
    actor.grenadeAt=this.elapsed+.36;
    actor.fireTime=this.elapsed*1000+360;
    this.grenades.push({x:actor.x+Math.cos(actor.angle)*GRENADE_RANGE,y:actor.y+Math.sin(actor.angle)*GRENADE_RANGE,owner:actor,at:this.elapsed+.45});
  }
  damage(target,amount,source){
    if(!source||source.team===target.team)return false;
    const result=applyDamage(target,amount);
    if(!result.applied)return false;
    if(target.ai&&source.alive){target.recentAttacker=source;target.attackedAt=this.elapsed;target.think=0;}
    if(!result.killed)return true;
    for(let index=0;index<4;index++)if(target.pickedSlots[index])this.dropSlot(target.inventory[index],target);
    if(target.pickedArmor&&target.armor>0)this.addLoot({type:'armor',label:'ARMOR',color:'#78b5de'},this.openSpot(target,0,2)||{x:target.x,y:target.y});
    target.respawn=this.elapsed+(target.ai?2.4:2.1);
    if(source.alive)source.kills++;
    recordElimination(this,target.team);
    this.winner=winningTeam(this,this.target);
    return true;
  }
  respawn(actor){
    const point=this.spawnPoint(actor.team),kit=(actor.ai?createBotStarterKit:createArenaStarterKit)(this.random);
    Object.assign(actor,point,kit,{alive:true,hp:100,armor:actor.ai?25:35,invuln:actor.ai?.55:.65,
      respawn:0,reloadUntil:0,reloadingWeapon:null,pickedSlots:[false,false,false,false],pickedArmor:false,
      target:null,recentAttacker:null,pathPoint:null,pickupTarget:null,patrolTarget:null,patrolRoom:null,exploredRooms:new Set(),think:0,fireTime:this.elapsed*1000+500});
    actor.input=EMPTY_INPUT();
  }
  step(dt=TICK_SECONDS){
    if(this.winner)return;
    dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
    this.elapsed+=dt;
    for(const actor of this.fighters){
      if(!actor.alive){if(this.elapsed>=actor.respawn)this.respawn(actor);continue;}
      if(!actor.ai){
        actor.invuln=Math.max(0,actor.invuln-dt);
        actor.hitFlash=Math.max(0,actor.hitFlash-dt);
      }
      if(actor.reloadUntil&&this.elapsed>=actor.reloadUntil){const id=actor.reloadingWeapon;if(WEAPONS[id]?.kind==='gun')actor.ammo[id]=WEAPONS[id].magazine;actor.reloadUntil=0;actor.reloadingWeapon=null;}
      if(actor.ai){
        updateArenaBot({world:this.world,bots:this.fighters,player:null,loot:this.loot,elapsed:this.elapsed,botSightRange:BOT_SIGHT_RANGE},actor,dt,this.elapsed*1000,{
          random:this.random,
          openNearbyDoor:bot=>{const door=this.nearbyDoor(bot,37,true);if(door)changeDoorState(this.world,door,true,this.fighters);},
          pickupLoot:bot=>{const item=this.loot.find(loot=>distance(bot,loot)<20&&botCanTakeLoot(bot,loot,this.random));if(item)this.collect(bot,item);},
          useMedkit:bot=>{if(bot.hp<=55)healWithMedkit(bot);},
          findPatrolPoint:()=>{const segments=this.world.corridors.segments,hall=this.choice(segments);return{x:(Math.floor(this.rand(hall.x1,hall.x2+1))+.5)*32,y:(Math.floor(this.rand(hall.y1,hall.y2+1))+.5)*32};},
          shoot:bot=>this.shoot(bot),
        });
      }else{
        const input=actor.input,mag=Math.hypot(input.moveX,input.moveY)||1;
        actor.angle=input.aim;
        moveActor(this.world,actor,input.moveX/mag*actor.speed*dt,input.moveY/mag*actor.speed*dt);
        for(const action of input.actions){
          if(action==='reload')this.reload(actor);
          else if(action==='interact')this.interact(actor);
          else if(action==='grenade')this.throwGrenade(actor);
          else if(typeof action==='object'&&actor.inventory[action.slot]!=null)actor.active=action.slot;
        }
        input.actions=[];
        if(input.fire)this.shoot(actor);
      }
    }
    for(const bullet of this.bullets){
      const target=advanceProjectile(this.world,bullet,dt,this.fighters.filter(f=>f.alive&&f.team!==bullet.owner.team));
      if(target)this.damage(target,bullet.damage,bullet.owner);
    }
    this.bullets=this.bullets.filter(b=>!b.dead);
    for(const grenade of this.grenades)if(this.elapsed>=grenade.at){
      for(const fighter of this.fighters)if(fighter.alive&&fighter.team!==grenade.owner.team&&distance(fighter,grenade)<112)this.damage(fighter,115*(1-distance(fighter,grenade)/180),grenade.owner);
      grenade.done=true;
    }
    this.grenades=this.grenades.filter(g=>!g.done);
    for(const entry of this.lootRespawns)if(this.elapsed>=entry.at){
      const previous=entry.item;
      const pool=(previous.room==='ARMORY'?LOOT_TABLE.filter(item=>item.type==='weapon'&&WEAPONS[item.weapon].kind==='gun'):
        previous.room==='WORKSHOP'?LOOT_TABLE.filter(item=>item.type==='weapon'&&WEAPONS[item.weapon].kind==='melee'):
        previous.room==='MEDICAL'?LOOT_TABLE.filter(item=>item.type==='health'||item.type==='armor'):
        ['POWER STATION','RESEARCH LAB'].includes(previous.room)?SUPPLY_LOOT:LOOT_TABLE)
        .filter(item=>item.type!==previous.type||item.weapon!==previous.weapon);
      const room=previous.room&&this.world.rooms.find(candidate=>candidate.name===previous.room);
      this.addLoot(this.weightedLoot(pool),this.openSpot(previous,5,Infinity,room)||this.openSpot(null,0,Infinity,room),previous.room,previous.spawnId);
      entry.done=true;
    }
    this.lootRespawns=this.lootRespawns.filter(entry=>!entry.done);
    this.lootSpawnTimer+=dt;
    if(this.lootSpawnTimer>=7){
      this.lootSpawnTimer-=7;
      if(this.loot.length<this.lootBaseCount+20)this.addLoot(this.weightedLoot(this.random()<.4?LOOT_TABLE:SUPPLY_LOOT),this.openSpot());
    }
    this.visionCache.clear();
  }
  snapshot(viewerId){
    const viewer=this.players.get(viewerId);
    if(!viewer)return null;
    let visible=this.visionCache.get(viewer.team);
    if(!visible){
      const allies=this.fighters.filter(f=>f.alive&&f.team===viewer.team);
      visible=revealTiles(this.world,allies.map(actor=>({actor,radius:actor.ai?9:Infinity})));
      this.visionCache.set(viewer.team,visible);
    }
    const seen=actor=>visible.has(`${Math.floor(actor.x/32)},${Math.floor(actor.y/32)}`);
    const unit=actor=>({id:actor.id,team:actor.team,ai:actor.ai,x:actor.x,y:actor.y,r:actor.r,angle:actor.angle,hp:actor.hp,maxHp:actor.maxHp,armor:actor.armor,alive:actor.alive,invuln:actor.invuln,inventory:actor.inventory,active:actor.active,kills:actor.kills});
    return{type:'snapshot',elapsed:this.elapsed,seed:this.seed,team:viewer.team,scoreBlue:this.scoreBlue,scoreRed:this.scoreRed,winner:this.winner,
      self:{...unit(viewer),inventory:viewer.inventory,ammo:viewer.ammo,active:viewer.active,reloadUntil:viewer.reloadUntil},
      units:this.fighters.filter(actor=>actor.id!==viewerId&&(actor.team===viewer.team||actor.alive&&seen(actor))).map(unit),
      bullets:this.bullets.filter(bullet=>seen(bullet)).map(bullet=>({x:bullet.x,y:bullet.y,vx:bullet.vx,vy:bullet.vy,color:bullet.color})),
      loot:this.loot.filter(seen).map(item=>({id:item.id,x:item.x,y:item.y,r:item.r,type:item.type,weapon:item.weapon,count:item.count,label:item.label,color:item.color})),
      doors:this.world.doors.map((door,index)=>({door,index})).filter(({door})=>visible.has(`${door.x},${door.y}`)||visible.has(`${door.x+1},${door.y}`)).map(({door,index})=>({index,open:door.open})),
    };
  }
}
