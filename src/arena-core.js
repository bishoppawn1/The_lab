// Browser-independent deathmatch rules shared with a future match server.
export const WEAPONS = [
  {name:'Pistol',kind:'gun',family:0,tier:0,damage:26,rate:280,magazine:12,speed:520,spread:0,color:'#eed27a',icon:'pistol'},
  {name:'SMG',kind:'gun',family:1,tier:0,damage:12,rate:92,magazine:30,speed:600,spread:0,color:'#eabf72',icon:'smg'},
  {name:'Shotgun',kind:'gun',family:2,tier:0,damage:18,rate:620,magazine:6,speed:465,spread:.25,pellets:7,maxRange:270,color:'#f2a875',icon:'shotgun'},
  {name:'Rifle',kind:'gun',family:3,tier:0,damage:34,rate:185,magazine:30,speed:760,spread:0,color:'#d9c786',icon:'rifle'},
  {name:'Knife',kind:'melee',family:4,damage:38,rate:350,ammo:Infinity,max:Infinity,range:58,color:'#c4d0c7',icon:'╱'},
  {name:'Bat',kind:'melee',family:5,damage:55,rate:580,ammo:Infinity,max:Infinity,range:72,color:'#c39165',icon:'╱'},
  {name:'Axe',kind:'melee',family:6,damage:75,rate:770,ammo:Infinity,max:Infinity,range:68,color:'#c2bcaa',icon:'⚒'},
  {name:'Heavy Pistol',kind:'gun',family:0,tier:2,damage:43,rate:410,magazine:8,speed:610,spread:0,color:'#ed9c72',icon:'heavy-pistol'},
  {name:'Tactical SMG',kind:'gun',family:1,tier:2,damage:17,rate:118,magazine:24,speed:680,spread:0,color:'#87c4a2',icon:'tactical-smg'},
  {name:'Precision Rifle',kind:'gun',family:3,tier:2,damage:52,rate:480,magazine:8,speed:960,spread:0,color:'#9cbbdf',icon:'precision-rifle'},
  {name:'Breach Shotgun',kind:'gun',family:2,tier:2,damage:22,rate:760,magazine:4,speed:510,spread:.23,pellets:8,maxRange:260,color:'#e59b8d',icon:'breach-shotgun'},
  {name:'Machine Pistol',kind:'gun',family:0,tier:1,damage:15,rate:115,magazine:24,speed:570,spread:0,color:'#d9a4dd',icon:'machine-pistol'},
  {name:'Drum SMG',kind:'gun',family:1,tier:1,damage:13,rate:97,magazine:50,speed:620,spread:0,color:'#9fb8d3',icon:'drum-smg'},
  {name:'Auto Shotgun',kind:'gun',family:2,tier:1,damage:14,rate:390,magazine:8,speed:500,spread:.23,pellets:6,maxRange:250,color:'#e2ab6b',icon:'auto-shotgun'},
  {name:'Slug Shotgun',kind:'gun',family:2,tier:2,damage:76,rate:720,magazine:5,speed:760,spread:0,maxRange:500,color:'#d8be91',icon:'slug-shotgun'},
  {name:'Scout Carbine',kind:'gun',family:3,tier:1,damage:27,rate:145,magazine:28,speed:800,spread:0,color:'#a9d7a2',icon:'scout-carbine'},
  {name:'Crowbar',kind:'melee',family:5,tier:1,damage:65,rate:500,ammo:Infinity,max:Infinity,range:77,color:'#a8c3ce',icon:'╱'},
];
export const LOOT_TABLE = [
  {type:'weapon',weapon:1,label:'SMG',color:'#eabf72',weight:1.2},{type:'weapon',weapon:2,label:'SHOTGUN',color:'#f2a875',weight:1.2},{type:'weapon',weapon:3,label:'RIFLE',color:'#d9c786',weight:1.15},
  {type:'weapon',weapon:4,label:'KNIFE',color:'#c4d0c7',weight:.65},{type:'weapon',weapon:5,label:'BAT',color:'#c39165',weight:.6},{type:'weapon',weapon:6,label:'AXE',color:'#c2bcaa',weight:.45},
  {type:'weapon',weapon:7,label:'HEAVY PISTOL · RARE',color:'#ed9c72',weight:.25},{type:'weapon',weapon:8,label:'TACTICAL SMG · RARE',color:'#87c4a2',weight:.23},{type:'weapon',weapon:9,label:'PRECISION RIFLE · RARE',color:'#9cbbdf',weight:.2},{type:'weapon',weapon:10,label:'BREACH SHOTGUN · RARE',color:'#e59b8d',weight:.18},
  {type:'weapon',weapon:11,label:'MACHINE PISTOL',color:'#d9a4dd',weight:.28},{type:'weapon',weapon:12,label:'DRUM SMG',color:'#9fb8d3',weight:.24},{type:'weapon',weapon:13,label:'AUTO SHOTGUN',color:'#e2ab6b',weight:.22},
  {type:'weapon',weapon:14,label:'SLUG SHOTGUN · RARE',color:'#d8be91',weight:.15},{type:'weapon',weapon:15,label:'SCOUT CARBINE',color:'#a9d7a2',weight:.25},{type:'weapon',weapon:16,label:'CROWBAR',color:'#a8c3ce',weight:.2},
  {type:'health',label:'MEDKIT',color:'#90d485',weight:13},{type:'armor',label:'ARMOR',color:'#78b5de',weight:10},{type:'grenade',label:'GRENADE',color:'#dd8e68',weight:8},
];
export const SUPPLY_LOOT = LOOT_TABLE.filter(item=>item.type!=='weapon');
export const ARENA_STARTERS=[null,null,null,null,1,1,2,2,3,3,4,5,6,11,12,13,15,16,7,8,9,10,14];

export function createArenaStarterKit(random=Math.random){
  const second=ARENA_STARTERS[Math.floor(random()*ARENA_STARTERS.length)];
  const inventory=[0,second,null,null],ammo={0:WEAPONS[0].magazine};
  if(second!=null&&WEAPONS[second].kind==='gun')ammo[second]=WEAPONS[second].magazine;
  return{inventory,ammo,active:second==null?0:Math.floor(random()*2)};
}

export function collectInventoryItem(actor,item,slot=null){
  if(item.type==='armor'){
    actor.armor=Math.min(100,(actor.armor||0)+50);
    return{collected:true,slot:null,replaced:null,stacked:false};
  }
  if(!Array.isArray(actor.inventory))return{collected:false,slot:null,replaced:null};
  const stack=item.type==='health'||item.type==='grenade';
  let destination=slot;
  if(destination==null&&stack)destination=actor.inventory.findIndex(value=>value?.item===item.type);
  if(destination==null||destination<0)destination=actor.inventory.findIndex(value=>value==null);
  if(destination<0||destination>=4)return{collected:false,slot:null,replaced:null};
  const previous=actor.inventory[destination];
  if(stack&&previous?.item===item.type){
    previous.count+=item.count||1;
    return{collected:true,slot:destination,replaced:null,stacked:true};
  }
  const replacement=item.type==='weapon'?item.weapon:stack?{item:item.type,count:item.count||1}:null;
  if(replacement==null)return{collected:false,slot:null,replaced:null};
  actor.inventory[destination]=replacement;
  if(item.type==='weapon'){
    actor.ammo??={};
    actor.ammo[item.weapon]=WEAPONS[item.weapon].magazine||0;
  }
  return{collected:true,slot:destination,replaced:previous,stacked:false};
}

export function consumeInventoryItem(actor,type,slot=null){
  slot??=actor.inventory?.findIndex(value=>value?.item===type)??-1;
  if(slot<0||actor.inventory?.[slot]?.item!==type)return false;
  actor.inventory[slot].count--;
  if(actor.inventory[slot].count<=0){actor.inventory[slot]=null;if(actor.pickedSlots)actor.pickedSlots[slot]=false;}
  return true;
}

export function healWithMedkit(actor,slot=null){
  if(!actor.alive||actor.hp>=actor.maxHp||!consumeInventoryItem(actor,'health',slot))return false;
  actor.hp=Math.min(actor.maxHp,actor.hp+45);
  return true;
}

export function isBlocked(world,x,y,radius=7){
  const tile=world.tile||32;
  return [[x-radius,y-radius],[x+radius,y-radius],[x-radius,y+radius],[x+radius,y+radius]].some(([cx,cy])=>{
    const tx=Math.floor(cx/tile),ty=Math.floor(cy/tile);
    return world.map[ty]?.[tx]!==0||world.doorTiles?.get(`${tx},${ty}`)?.open===false;
  });
}

export function hasLineOfSight(world,a,b,radius=7){
  const distance=Math.hypot(a.x-b.x,a.y-b.y),steps=Math.ceil(distance/6);
  for(let i=1;i<steps;i++){
    const fraction=i/steps;
    if(isBlocked(world,a.x+(b.x-a.x)*fraction,a.y+(b.y-a.y)*fraction,radius))return false;
  }
  return true;
}

export function moveActor(world,actor,dx,dy){
  const nx=actor.x+dx,ny=actor.y+dy,radius=Math.max(5,(actor.r||10)-1);
  if(!isBlocked(world,nx,actor.y,radius))actor.x=nx;
  if(!isBlocked(world,actor.x,ny,radius))actor.y=ny;
}

export function changeDoorState(world,door,open,units){
  if(!door||door.open===open)return false;
  const tile=world.tile||32;
  if(!open&&units.some(unit=>unit?.alive&&unit.x+(unit.r||10)>door.x*tile&&unit.x-(unit.r||10)<(door.x+2)*tile&&unit.y+(unit.r||10)>door.y*tile&&unit.y-(unit.r||10)<(door.y+1)*tile))return false;
  door.open=open;
  world.visionAt=-Infinity;
  return true;
}

export function canSeeOpponent(world,observer,target,range){
  return !!target?.alive&&target!==observer&&target.team!==observer.team&&Math.hypot(target.x-observer.x,target.y-observer.y)<=range&&hasLineOfSight(world,observer,target);
}

export function canFireAt(world,actor,target){
  if(!hasLineOfSight(world,actor,target))return false;
  const angle=Math.atan2(target.y-actor.y,target.x-actor.x);
  const muzzle={x:actor.x+Math.cos(angle)*18,y:actor.y+Math.sin(angle)*18};
  return !isBlocked(world,muzzle.x,muzzle.y,2)&&hasLineOfSight(world,muzzle,target,2);
}

export function scoreVisibleTarget(world,bot,target,range,elapsed){
  if(!canSeeOpponent(world,bot,target,range))return-Infinity;
  const attacker=target===bot.recentAttacker&&elapsed-(bot.attackedAt??-Infinity)<3;
  const firing=canFireAt(world,bot,target),distance=Math.hypot(target.x-bot.x,target.y-bot.y);
  return(firing?850:0)+(attacker?(firing?1800:250):0)-distance;
}

export function findPathStep(world,actor,target){
  const w=world.w,h=world.h,tile=world.tile||32,toIndex=(x,y)=>y*w+x;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const floorTile=(x,y)=>world.map[y]?.[x]===0;
  const sx=clamp(Math.floor(actor.x/tile),1,w-2),sy=clamp(Math.floor(actor.y/tile),1,h-2);
  let gx=clamp(Math.floor(target.x/tile),1,w-2),gy=clamp(Math.floor(target.y/tile),1,h-2);
  if(!floorTile(gx,gy)){
    let found=false;
    for(let radius=1;radius<=3&&!found;radius++)for(let y=gy-radius;y<=gy+radius&&!found;y++)for(let x=gx-radius;x<=gx+radius;x++)if(floorTile(x,y)){gx=x;gy=y;found=true;break;}
    if(!found)return target;
  }
  const start=toIndex(sx,sy),goal=toIndex(gx,gy),parents=new Int32Array(w*h).fill(-2),queue=new Int32Array(w*h);
  let head=0,tail=0;queue[tail++]=start;parents[start]=start;
  for(;head<tail&&parents[goal]===-2;){
    const here=queue[head++],x=here%w,y=Math.floor(here/w);
    for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,next=toIndex(nx,ny);
      if(nx<1||ny<1||nx>=w-1||ny>=h-1||parents[next]!==-2||!floorTile(nx,ny))continue;
      parents[next]=here;queue[tail++]=next;
    }
  }
  if(parents[goal]===-2)return target;
  let step=goal;while(parents[step]!==start&&step!==start)step=parents[step];
  return{x:(step%w+.5)*tile,y:(Math.floor(step/w)+.5)*tile};
}

export function steerActor(world,actor,target,pathPoint,speed,dt,requireLane=false){
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const clear=hasLineOfSight(world,actor,target,Math.max(7,(actor.r||8)-1))&&(!requireLane||canFireAt(world,actor,target));
  if(!clear&&pathPoint&&distance(actor,pathPoint)<12){
    actor.think=0;pathPoint=findPathStep(world,actor,target);
    if(target===actor.target)actor.pathPoint=pathPoint;
    else if(target===actor.pickupTarget)actor.pickupPath=pathPoint;
  }
  const point=clear?target:pathPoint||target,dx=point.x-actor.x,dy=point.y-actor.y,d=Math.hypot(dx,dy),beforeX=actor.x,beforeY=actor.y;
  if(d>5)moveActor(world,actor,dx/d*speed*dt,dy/d*speed*dt);
  if(!clear&&Math.hypot(actor.x-beforeX,actor.y-beforeY)<.15){
    actor.stuckTime=(actor.stuckTime||0)+dt;
    if(actor.stuckTime>.35){
      const side=actor.stuckSide||1,nx=-dy/(d||1)*speed*dt*1.8*side,ny=dx/(d||1)*speed*dt*1.8*side;
      moveActor(world,actor,nx,ny);
      if(Math.hypot(actor.x-beforeX,actor.y-beforeY)<.15){moveActor(world,actor,-nx,-ny);actor.stuckSide=-side;}
      actor.stuckTime=0;actor.think=0;
    }
  }else actor.stuckTime=0;
}

export function revealTiles(world,observers){
  const visible=new Set(),tile=world.tile||32;
  for(const {actor,radius} of observers){
    const tx=Math.floor(actor.x/tile),ty=Math.floor(actor.y/tile);
    for(let y=Math.max(1,ty-radius);y<=Math.min(world.h-2,ty+radius);y++)for(let x=Math.max(1,tx-radius);x<=Math.min(world.w-2,tx+radius);x++){
      if(Math.hypot(x-tx,y-ty)>radius||world.map[y]?.[x]!==0)continue;
      if(hasLineOfSight(world,actor,{x:(x+.5)*tile,y:(y+.5)*tile}))visible.add(`${x},${y}`);
    }
  }
  return visible;
}

export function createGunProjectiles(actor,weapon,angle,random=Math.random){
  const count=weapon.pellets||1,muzzleX=actor.x+Math.cos(angle)*18,muzzleY=actor.y+Math.sin(angle)*18,bullets=[];
  for(let i=0;i<count;i++){
    const direction=angle+(count>1?(random()*2-1)*weapon.spread:0);
    bullets.push({x:muzzleX,y:muzzleY,vx:Math.cos(direction)*weapon.speed,vy:Math.sin(direction)*weapon.speed,owner:actor,damage:weapon.damage,life:1.3,maxRange:weapon.maxRange,color:weapon.color});
  }
  return bullets;
}

export function advanceProjectile(world,bullet,dt,targets){
  const dx=bullet.vx*dt,dy=bullet.vy*dt,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5)),stepDistance=Math.hypot(dx,dy)/steps;
  let struck=null;
  for(let i=0;i<steps;i++){
    if((bullet.travelled||0)+stepDistance>(bullet.maxRange||Infinity)){bullet.dead=true;break;}
    bullet.x+=dx/steps;bullet.y+=dy/steps;bullet.travelled=(bullet.travelled||0)+stepDistance;
    if(isBlocked(world,bullet.x,bullet.y,2)){bullet.dead=true;break;}
    struck=targets.find(target=>target.alive&&Math.hypot(bullet.x-target.x,bullet.y-target.y)<target.r+2)||null;
    if(struck){bullet.dead=true;break;}
  }
  bullet.life-=dt;if(bullet.life<=0)bullet.dead=true;
  return struck;
}

export function applyDamage(target,damage){
  if(!target.alive||target.invuln>0)return{applied:false,killed:false};
  target.hitFlash=.12;
  let remaining=damage;
  if(target.armor){const absorbed=Math.min(target.armor,remaining*.64);target.armor-=absorbed;remaining-=absorbed;}
  target.hp-=remaining;
  const killed=target.hp<=0;
  if(killed){target.hp=0;target.alive=false;}
  return{applied:true,killed};
}

export function recordElimination(match,victimTeam){
  if(victimTeam==='blue')match.scoreRed++;
  else if(victimTeam==='red')match.scoreBlue++;
}

export function winningTeam(match,target){
  if(match.scoreBlue>=target)return'blue';
  if(match.scoreRed>=target)return'red';
  return null;
}
export function weaponUtility(id,d){
  const w=WEAPONS[id];if(!w)return 0;
  if(w.kind==='melee')return d<w.range+32?120+w.damage*.45-w.rate*.025:0;
  const effectiveRange=w.maxRange||[310,270,0,520][w.family];
  if(w.maxRange&&d>w.maxRange)return 0;
  const rangeFactor=d>effectiveRange?Math.max(.28,effectiveRange/d):1;
  return w.damage*(w.pellets||1)*1000/w.rate*.55*rangeFactor+(w.tier||0)*14+w.magazine*.12;
}
export function botWeaponScore(id,target,d,clear){const w=WEAPONS[id];if(!w)return-100;if(w.kind==='melee')return clear&&d<145?125+w.damage*.25:-35;if(!clear)return 2;return weaponUtility(id,d);}
function botLoadoutValue(ids,engagementDistance){
  const bestAt=d=>Math.max(0,...ids.map(id=>weaponUtility(id,d)));
  return [70,145,280,430].reduce((sum,d)=>sum+bestAt(d),0)+(Number.isFinite(engagementDistance)?bestAt(engagementDistance)*.7:0);
}
export function botWeaponPlan(bot,weaponId){
  const candidate=WEAPONS[weaponId];if(!candidate||bot.inventory.includes(weaponId))return null;
  if(bot.inventory.some(id=>typeof id==='number'&&WEAPONS[id].family===candidate.family&&(WEAPONS[id].tier||0)>(candidate.tier||0)))return null;
  const owned=bot.inventory.filter(id=>typeof id==='number'),engagement=bot.target?.alive?Math.hypot(bot.x-bot.target.x,bot.y-bot.target.y):Infinity;
  const baseline=botLoadoutValue(owned,engagement);let best=null;
  const free=bot.inventory.findIndex(slot=>slot==null),slots=free>=0?[free]:bot.inventory.map((_,index)=>index);
  for(const slot of slots){
    const replaced=bot.inventory[slot];if(replaced!=null&&typeof replaced!=='number')continue;
    const next=bot.inventory.map((id,index)=>index===slot?weaponId:id).filter(id=>typeof id==='number');
    const gain=botLoadoutValue(next,engagement)-baseline;
    if(gain>12&&(!best||gain>best.gain))best={slot,gain};
  }
  return best;
}
export function botCanTakeLoot(bot,item,random=Math.random){
  if(item.type==='armor')return (bot.armor||0)<100;
  if(item.type==='weapon'){
    const plan=botWeaponPlan(bot,item.weapon);if(!plan)return false;
    bot.lootJudgments??=new WeakMap();
    const loadout=bot.inventory.map(slot=>typeof slot==='number'?slot:slot?.item||'-').join(',');
    let judgment=bot.lootJudgments.get(item);
    if(!judgment||judgment.loadout!==loadout){
      const chance=plan.gain>=110?1:plan.gain>=45?.87:.68;
      judgment={loadout,accept:(bot.pickupRoll?.()??random())<chance};bot.lootJudgments.set(item,judgment);
    }
    return judgment.accept;
  }
  if(item.type==='health'||item.type==='grenade')return bot.inventory.some(slot=>slot?.item===item.type||slot==null);
  return false;
}

// The caller supplies effects such as shooting and pickup drops; targeting and
// movement stay identical in the browser and a future match process.
export function updateArenaBot(match,bot,dt,now,effects={}){
  const random=effects.random||Math.random;
  const rand=(low,high)=>low+random()*(high-low);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const visible=target=>canSeeOpponent(match.world,bot,target,match.botSightRange||448);
  const canTake=item=>effects.canTakeLoot?effects.canTakeLoot(bot,item):botCanTakeLoot(bot,item,random);
  const seek=(target,path,speed,requireLane=false)=>steerActor(match.world,bot,target,path,speed,dt,requireLane);
  if(bot.invuln>0)bot.invuln=Math.max(0,bot.invuln-dt);
  if(bot.hitFlash>0)bot.hitFlash-=dt;
  effects.openNearbyDoor?.(bot);
  bot.think-=dt;
  effects.pickupLoot?.(bot);
  effects.useMedkit?.(bot);
  if(bot.think<=0){
    bot.think=rand(.24,.4);
    const enemies=[...match.bots,match.player].filter(visible);
    bot.target=enemies.sort((a,b)=>scoreVisibleTarget(match.world,bot,b,match.botSightRange||448,match.elapsed)-scoreVisibleTarget(match.world,bot,a,match.botSightRange||448,match.elapsed))[0]||null;
    bot.pathPoint=bot.target?findPathStep(match.world,bot,bot.target):null;
    const nearest=match.loot.filter(item=>distance(bot,item)<145&&hasLineOfSight(match.world,bot,item)&&canTake(item)).sort((a,b)=>distance(bot,a)-distance(bot,b))[0];
    const targetDistance=bot.target?distance(bot,bot.target):Infinity;
    const underFire=bot.recentAttacker?.alive&&match.elapsed-(bot.attackedAt??-Infinity)<3;
    bot.pickupTarget=!underFire&&nearest&&targetDistance>185?nearest:null;
    bot.pickupPath=bot.pickupTarget?findPathStep(match.world,bot,bot.pickupTarget):null;
    if(!bot.target&&!bot.pickupTarget&&(!bot.patrolTarget||distance(bot,bot.patrolTarget)<28||now>=(bot.patrolUntil||0))){
      bot.patrolTarget=effects.findPatrolPoint?.(bot)||null;
      bot.patrolUntil=now+rand(20000,32000);
    }
    bot.patrolPath=bot.patrolTarget&&!bot.target&&!bot.pickupTarget?findPathStep(match.world,bot,bot.patrolTarget):null;
  }
  if(bot.target&&!visible(bot.target)){bot.target=null;bot.pathPoint=null;bot.think=0;}
  if(bot.target?.alive){
    const d=distance(bot,bot.target),angle=Math.atan2(bot.target.y-bot.y,bot.target.x-bot.x),clear=hasLineOfSight(match.world,bot,bot.target);
    bot.angle=angle;
    const available=bot.inventory.map((id,index)=>({id,index,score:typeof id==='number'?botWeaponScore(id,bot.target,d,clear):-100})).sort((a,b)=>b.score-a.score);
    if(available.length&&available[0].score>-20)bot.active=available[0].index;
    const weapon=WEAPONS[bot.inventory[bot.active]],melee=weapon?.kind==='melee',reach=melee?weapon.range+bot.r:weapon?.maxRange||470;
    if(bot.pickupTarget&&match.loot.includes(bot.pickupTarget))seek(bot.pickupTarget,bot.pickupPath,bot.speed);
    else if(melee&&(d>reach-4||!clear))seek(bot.target,bot.pathPoint,bot.speed);
    else if(!melee&&(d>145||!canFireAt(match.world,bot,bot.target)))seek(bot.target,bot.pathPoint,bot.speed,true);
    else if(!melee&&d<95)moveActor(match.world,bot,-Math.cos(angle)*bot.speed*.4*dt,-Math.sin(angle)*bot.speed*.4*dt);
    if(now>bot.fireTime&&d<reach&&(melee?clear:canFireAt(match.world,bot,bot.target))){
      if(random()<.78)effects.shoot?.(bot,angle,now);
      else bot.fireTime=now+rand(200,450);
    }
  }else if(bot.pickupTarget&&match.loot.includes(bot.pickupTarget))seek(bot.pickupTarget,bot.pickupPath,bot.speed);
  else if(bot.patrolTarget)seek(bot.patrolTarget,bot.patrolPath,bot.speed*.75);
}
