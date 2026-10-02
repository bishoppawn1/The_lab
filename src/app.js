import { createFacility } from './facility.js?v=20261001-1';
import { WEAPONS, LOOT_TABLE, SUPPLY_LOOT, createArenaStarterKit, createBotStarterKit, collectInventoryItem, consumeInventoryItem, healWithMedkit, isBlocked, hasLineOfSight, moveActor, changeDoorState, canSeeOpponent, canFireAt, scoreVisibleTarget, findPathStep, steerActor, updateArenaBot, revealTiles, createGunProjectiles, advanceProjectile, applyDamage, recordElimination, winningTeam, botWeaponScore as scoreBotWeapon, botWeaponPlan as planBotWeapon, botCanTakeLoot as botAcceptsLoot } from './arena-core.js?v=20261001-1';
const $ = (selector) => document.querySelector(selector);
const canvas = $('#world');
const ctx = canvas.getContext('2d');
const minimap = $('#minimap');
const mctx = minimap.getContext('2d');
const menu = $('#menu'), setup = $('#setup'), game = $('#game');
const COLORS = { floor:'#202a22', floor2:'#222d24', wall:'#414d42', wallEdge:'#60705e', grid:'#ffffff07', lime:'#c0ef75', red:'#f2745e', blue:'#72a9ed', pale:'#e8ede7' };
const PLAYER_SIGHT_RANGE = 320;
const BOT_SIGHT_RANGE = 9 * 32;
const LOOT_RESPAWN_SECONDS = 6;
const AMBIENT_LOOT_INTERVAL = 7;
const AMBIENT_LOOT_LIMIT = 20;
const GRENADE_THROW_DISTANCE = 210;
const MELEE_SWING_MS = 300;
function weightedLoot(table=LOOT_TABLE){let value=Math.random()*table.reduce((sum,item)=>sum+item.weight,0);for(const item of table){value-=item.weight;if(value<=0)return item;}return table.at(-1);}

const state = {running:false,paused:false,runId:0,mode:'survival',world:null,player:null,bots:[],enemies:[],bullets:[],loot:[],lootRespawns:[],lootBaseCount:0,lootSpawnTimer:0,ambientLootId:0,particles:[],decor:[],roomProps:[],keys:new Set(),mouse:{x:0,y:0,down:false},touchFire:false,camera:{x:0,y:0},lastTime:0,elapsed:0,fireAt:0,round:1,spawnTimer:0,scoreBlue:0,scoreRed:0,kills:0,found:0,skips:0,teamSize:5,feed:[],visibleMap:false,roundEnd:false,botFill:true,botSightRange:BOT_SIGHT_RANGE,pendingLoot:null,remote:null,lobby:null,roomAction:'create',settings:{team:'blue',target:50}};
let lastNotice=0, audioContext=null;
const rand=(a,b)=>a+Math.random()*(b-a), clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), choice=a=>a[Math.floor(Math.random()*a.length)];

function clearOperationUi(){for(const id of ['pause-overlay','end-overlay','round-banner','notice','inventory-prompt'])$(`#${id}`).classList.add('hidden');game.classList.remove('paused');state.keys.clear();state.mouse.down=false;state.touchFire=false;state.pendingLoot=null;}
function closeRemoteMatch(){
  state.lobby?.socket.close();
  state.remote?.socket.close();
  state.lobby=null;
  state.remote=null;
}
function usesLocalRooms(){
  if(typeof window==='undefined')return false;
  const {hostname,protocol}=window.location;
  return protocol==='http:'&&(/^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(hostname)||hostname.endsWith('.local'));
}
function roomServiceBase(){
  if(typeof window==='undefined')return null;
  if(usesLocalRooms())return window.location.origin;
  const configured=window.THE_LAB_ROOM_SERVER_URL?.trim();
  if(configured){
    try{
      const url=new URL(configured);
      if(url.protocol==='https:')return url.origin;
    }catch{}
  }
  return null;
}
function showMenu(){closeRemoteMatch();state.running=false;state.paused=false;state.runId++;clearOperationUi();menu.classList.remove('hidden');setup.classList.add('hidden');game.classList.add('hidden');}
function openSetup(mode){
  closeRemoteMatch();state.running=false;state.paused=false;state.runId++;clearOperationUi();
  state.mode=mode;state.teamSize=5;state.roomAction='create';
  state.settings={team:'blue',target:50,difficulty:'standard',loadout:'balanced'};
  menu.classList.add('hidden');game.classList.add('hidden');setup.classList.remove('hidden');
  $('#setup-title').innerHTML=mode==='survival'?'LAB<br><span>ESCAPE.</span>':'TEAM<br><span>DEATHMATCH.</span>';
  $('#setup-subtitle').textContent=mode==='survival'?'Explore the facility, gather supplies, and reach extraction.':'Choose a team size and take your squad into the arena.';
  const survivalOptions=`<div class="config-label">FACILITY CONDITIONS</div><div class="choice-row" id="difficulty-row"><button class="choice selected" data-value="standard">STANDARD</button><button class="choice" data-value="survival">HARDCORE</button><button class="choice" data-value="training">TRAINING</button></div><div class="config-label">FIELD KIT</div><div class="choice-row" id="loadout-row"><button class="choice selected" data-value="balanced">BALANCED</button><button class="choice" data-value="assault">ASSAULT</button><button class="choice" data-value="medic">MEDIC</button></div>`;
  const pvpOptions=`<div class="config-label">TEAM SIZE · AI FILL ${state.botFill?'ON':'OFF'}</div><div class="choice-row" id="size-row"><button class="choice selected" data-value="5">5 VS 5</button><button class="choice" data-value="10">10 VS 10</button></div><div class="config-label">YOUR TEAM</div><div class="choice-row" id="team-row"><button class="choice selected" data-value="blue">BLUE TEAM</button><button class="choice" data-value="red">RED TEAM</button></div><div class="config-label">MATCH TARGET</div><div class="choice-row" id="target-row"><button class="choice selected" data-value="50">FIRST TO 50</button><button class="choice" data-value="100">FIRST TO 100</button><button class="choice" data-value="250">FIRST TO 250</button></div>`;
  const roomBase=mode==='pvp'&&roomServiceBase();
  const roomOptions=`<div class="config-label">${usesLocalRooms()?'DEV MATCH ROOM':'ONLINE MATCH ROOM'}</div><div class="choice-row" id="room-row"><button class="choice selected" data-value="create">CREATE ROOM</button><button class="choice" data-value="join">JOIN WITH CODE</button></div><label class="config-label room-code-label hidden" for="room-code-input">ROOM CODE</label><input id="room-code-input" class="room-code-input hidden" maxlength="6" autocomplete="off" spellcheck="false" placeholder="ENTER 6-CHARACTER CODE"><p class="room-help">${usesLocalRooms()?'Share this preview address and room code with someone who can reach this computer.':'Share the room code with anyone playing at the GitHub Pages link.'}</p>`;
  $('#setup-options').innerHTML=mode==='survival'?survivalOptions:pvpOptions+(roomBase?roomOptions:'<p class="room-help">Online rooms are unavailable. You can still play against bots.</p>');
  $('#start-button').innerHTML=`${mode==='survival'?'BEGIN OPERATION':roomBase?'CREATE ROOM':'ENTER BOT MATCH'} <span>→</span>`;
  setup.querySelectorAll('.choice-row').forEach(row=>row.addEventListener('click',e=>{
    const button=e.target.closest('.choice');if(!button)return;
    row.querySelectorAll('.choice').forEach(choice=>choice.classList.remove('selected'));
    button.classList.add('selected');
    if(row.id==='size-row')state.teamSize=Number(button.dataset.value);
    if(row.id==='team-row')state.settings.team=button.dataset.value;
    if(row.id==='target-row')state.settings.target=Number(button.dataset.value);
    if(row.id==='difficulty-row')state.settings.difficulty=button.dataset.value;
    if(row.id==='loadout-row')state.settings.loadout=button.dataset.value;
    if(row.id==='room-row'){
      state.roomAction=button.dataset.value;
      const joining=state.roomAction==='join';
      $('#room-code-input').classList.toggle('hidden',!joining);
      $('.room-code-label').classList.toggle('hidden',!joining);
      $('#start-button').innerHTML=`${joining?'JOIN ROOM':'CREATE ROOM'} <span>→</span>`;
    }
  }));
}
function floorTile(x,y){return state.world.map[y]?.[x]===0;}
function generateWorld(mode,seed=Math.floor(Math.random()*0x100000000)){
  const generated=createFacility(mode,seed);
  state.world=generated.world;
  state.decor=generated.decor;
  state.roomProps=generated.roomProps;
}
function findOpen(nearX=31,nearY=24,minDistance=0,maxDistance=Infinity,accept=()=>true){for(let i=0;i<900;i++){const tx=Math.floor(rand(1,state.world.w-1)),ty=Math.floor(rand(1,state.world.h-1)),p={x:(tx+.5)*32,y:(ty+.5)*32},d=Math.hypot(tx-nearX,ty-nearY);if(floorTile(tx,ty)&&accept(tx,ty)&&d>=minDistance&&d<=maxDistance&&!blocked(p.x,p.y,9)&&!occupied(p,18))return p;}let fallback=null,best=Infinity;for(let y=1;y<state.world.h-1;y++)for(let x=1;x<state.world.w-1;x++){const p={x:(x+.5)*32,y:(y+.5)*32},d=(x+.5-nearX)**2+(y+.5-nearY)**2;if(d<best&&d>=minDistance**2&&d<=maxDistance**2&&accept(x,y)&&floorTile(x,y)&&!blocked(p.x,p.y,9)&&!occupied(p,18)){fallback=p;best=d;}}return fallback||{x:(nearX+.5)*32,y:(nearY+.5)*32};}
function occupied(p,r){return state.enemies.some(e=>e.alive&&dist(p,e)<r+e.r)||state.bots.some(b=>b.alive&&dist(p,b)<r+b.r)||state.player&&state.player.alive&&dist(p,state.player)<r+state.player.r;}
function inventoryItemLabel(item){return item?.item==='health'?'MEDKIT':item?.item==='grenade'?'GRENADE':'ITEM';}
function inventoryItemIcon(item){return item?.item==='health'?'<span class="inventory-item-icon medkit" aria-hidden="true">✚</span>':'<span class="inventory-item-icon grenade" aria-hidden="true">◉</span>';}
function inventoryGrenades(p=state.player){return p?.inventory.reduce((total,slot)=>total+(slot?.item==='grenade'?slot.count:0),0)||0;}
function dropInventorySlot(slot,actor=state.player,offset=0){
  if(slot==null)return null;
  let x=actor.x,y=actor.y;
  for(let i=0;i<12;i++){
    const angle=(i+offset)*Math.PI/6,nx=actor.x+Math.cos(angle)*27,ny=actor.y+Math.sin(angle)*27;
    if(!blocked(nx,ny,5)){x=nx;y=ny;break;}
  }
  const loot={x,y,r:10,bob:0,id:`drop-${Date.now()}-${Math.random()}`};
  if(typeof slot==='number'){const w=WEAPONS[slot];return{...loot,type:'weapon',weapon:slot,label:w.name.toUpperCase(),color:w.color};}
  const type=slot.item;
  return{...loot,type,label:type==='health'?'MEDKIT':type==='armor'?'ARMOR':'GRENADE',color:type==='health'?'#90d485':type==='armor'?'#78b5de':'#dd8e68',count:slot.count||1};
}
function dropPlayerLoadout(){const p=state.player;let retainedPistol=false;for(let i=0;i<p.inventory.length;i++){const slot=p.inventory[i];if(slot===0&&!retainedPistol){retainedPistol=true;continue;}if(i===1&&slot===p.starterWeapon&&p.starterWeapon!=null)continue;if(slot!=null)state.loot.push(dropInventorySlot(slot,p,i*2));}p.inventory=[0,null,null,null];p.active=0;p.starterWeapon=null;p.ammo[0]=WEAPONS[0].magazine;p.reloadUntil=0;p.reloadingWeapon=null;state.pendingLoot=null;$('#inventory-prompt').classList.add('hidden');renderWeapons();$('#grenade-count').textContent='0';}
function dropBotLoadout(bot){
  for(let i=0;i<bot.inventory.length;i++)if(bot.pickedSlots?.[i]&&bot.inventory[i]!=null)state.loot.push(dropInventorySlot(bot.inventory[i],bot,i*2));
  if(bot.pickedArmor&&bot.armor>0)state.loot.push(dropInventorySlot({item:'armor'},bot,9));
  bot.inventory=[0,null,null,null];bot.pickedSlots=[false,false,false,false];bot.pickedArmor=false;bot.active=0;
}
function equip(index){
  const p=state.player;
  if(index<0||index>3||!p)return;
  if(state.remote){queueRemoteAction('slot',index);if(nearbyInteraction()?.type==='loot'&&p.inventory.every(slot=>slot!=null))queueRemoteAction('interact');return;}
  if(state.pendingLoot){
    const item=state.pendingLoot;
    if(!state.loot.includes(item)){state.pendingLoot=null;$('#inventory-prompt').classList.add('hidden');announce('PICKUP NO LONGER AVAILABLE');renderWeapons();return;}
    const result=collectInventoryItem(p,item,index);
    if(!result.collected)return;
    if(result.replaced!=null)state.loot.push(dropInventorySlot(result.replaced));
    takeLoot(item);state.pendingLoot=null;$('#inventory-prompt').classList.add('hidden');state.found++;
    $('#loot-count').textContent=String(state.found);
    const label=item.type==='weapon'?WEAPONS[item.weapon].name:inventoryItemLabel(p.inventory[index]);
    log(`${label} assigned to slot ${index+1}.`,'good');announce(`${label.toUpperCase()} COLLECTED`);
    p.active=index;renderWeapons();$('#grenade-count').textContent=String(inventoryGrenades());return;
  }
  if(p.inventory[index]==null)return;
  p.active=index;renderWeapons();
}
const weaponShapes=[
  '<path d="M4 10h17l5 2v5H9L6 15H4z"/><path d="M13 16h5l2 6h-5z"/>',
  '<path d="M2 8h25l6 3v5H9l-4-2H2z"/><path d="M13 16h5l2 6h-5z"/><path d="M4 8V5h7v3"/>',
  '<path d="M1 9h31v5H8l-4-2H1z"/><path d="M3 9V6h7v3"/><path d="M14 14h5l2 8h-5z"/><path d="M25 8h7v2h-7z"/>',
  '<path d="M1 9h29l5 2v4H9l-4-2H1z"/><path d="M13 15h6l2 7h-5z"/><path d="M4 9V6h8v3M24 8h7v2h-7z"/>',
  '<path d="M4 15 25 5l2 2-17 13-4-2z"/><path d="m4 16-2 4 5 2 3-3z"/>',
  '<path d="m5 16 24-7 1 3-22 9-5-2z"/><path d="m27 8 4-2-1 7-4-1z"/>',
  '<path d="m5 17 16-6 1 3-16 7z"/><path d="M17 6h13v9H20z"/><path d="m19 9-4 5 5 1 2-4z"/>',
];
function weaponIcon(id){const weapon=WEAPONS[id],detail={11:'<path d="M14 21h4v4h-4z"/>',12:'<circle cx="17" cy="20" r="5"/>',13:'<path d="M18 17h5v7h-5z"/>',14:'<path d="M29 8h7v3h-7z"/>',15:'<path d="M29 10h7v3h-7z"/>',16:'<path d="m27 8 5-5 3 2-5 6z"/>'}[id]||'';return `<svg viewBox="0 0 36 26" aria-hidden="true" class="weapon-svg ${weapon.kind}"><g fill="${weapon.color}" stroke="#172019" stroke-width=".7" stroke-linejoin="round">${weaponShapes[weapon.family]}${detail}</g></svg>`;}
function buildPlayer(){const p={x:8.5*32,y:23.5*32,r:11,speed:176,hp:100,maxHp:100,armor:0,inventory:[0,{item:'grenade',count:1},null,null],active:0,ammo:Object.fromEntries(WEAPONS.map((w,i)=>[i,w.magazine||0])),team:state.settings.team||'blue',alive:true,angle:0,stun:0,invuln:0,hitFlash:0,fireTime:0,reloadUntil:0,respawn:0,ai:false,kills:0};if(state.settings.loadout==='assault'){p.inventory=[3,1,0,{item:'grenade',count:1}];p.active=0;}if(state.settings.loadout==='medic'){p.hp=125;p.maxHp=125;p.inventory=[0,4,{item:'health',count:2},{item:'grenade',count:1}];}if(state.mode==='pvp'){const kit=arenaStarterKit();p.armor=35;p.inventory=kit.inventory;p.ammo=kit.ammo;p.active=kit.active;p.starterWeapon=kit.inventory[1];}return p;}
function roomSpot(room,avoidLoot=false,previous=null){
  for(let attempt=0;attempt<100;attempt++){
    const tx=Math.floor(rand(room.x+2,room.x+room.w-2)),ty=Math.floor(rand(room.y+2,room.y+room.h-2));
    const spot={x:(tx+.5)*32,y:(ty+.5)*32};
    if(!blocked(spot.x,spot.y,10)&&!occupied(spot,17)&&(!previous||dist(previous,spot)>=48)&&(!avoidLoot||!state.loot.some(item=>dist(item,spot)<34)))return spot;
  }
  return{x:(room.x+Math.floor(room.w/2)+.5)*32,y:(room.y+Math.floor(room.h/2)+.5)*32};
}
function addRoomLoot(room,type,weapon=null){
  const spot=roomSpot(room,true),spec=type==='weapon'?LOOT_TABLE.find(item=>item.type==='weapon'&&item.weapon===weapon):LOOT_TABLE.find(item=>item.type===type);
  state.loot.push({...spot,...spec,r:10,bob:rand(0,Math.PI*2),id:`${room.name}-${state.loot.length}`,room:room.name});
}
function seedRoomLoot(){
  for(const room of state.world.rooms){
    if(room.name==='ARMORY')for(const family of [0,1,2,3])addRoomLoot(room,'weapon',weightedLoot(LOOT_TABLE.filter(item=>item.type==='weapon'&&WEAPONS[item.weapon].family===family)).weapon);
    else if(room.name==='MEDICAL'){for(let i=0;i<3;i++)addRoomLoot(room,'health');addRoomLoot(room,'armor');}
    else if(room.name==='SUPPLY HUB'){
      for(const weapon of [1,2,3,7,8,9])addRoomLoot(room,'weapon',weapon);
      for(let i=0;i<2;i++){addRoomLoot(room,'health');addRoomLoot(room,'armor');}
      addRoomLoot(room,'grenade');
    }
    else if(room.name==='WORKSHOP')addRoomLoot(room,'weapon',16);
    else if(room.name==='POWER STATION')addRoomLoot(room,'armor');
    else if(room.name==='RESEARCH LAB')addRoomLoot(room,'health');
  }
}
function spawnLoot(count){
  const start=state.world.spawnZones[0];
  state.loot=[];
  if(state.mode==='survival')for(let i=0;i<3;i++){
    const spot=findOpen(start.x/32,start.y/32,2,8,(x,y)=>!state.loot.some(item=>Math.hypot(item.x/32-x,item.y/32-y)<2));
    state.loot.push({...spot,...weightedLoot(SUPPLY_LOOT),r:10,bob:rand(0,Math.PI*2),id:`entry-${i}`});
  }
  if(state.mode==='pvp')for(let team=0;team<2&&state.loot.length<count;team++){
    const zone=state.world.spawnZones[team],spot=findOpen(zone.x/32,zone.y/32,4,7),weapon=choice([4,5,6]),spec=WEAPONS[weapon];
    state.loot.push({...spot,type:'weapon',weapon,label:spec.name.toUpperCase(),color:spec.color,r:10,bob:rand(0,Math.PI*2),id:team});
  }
  for(let i=state.loot.length;i<count;i++){
    const spot=findOpen(),item=weightedLoot(i<(state.mode==='survival'?22:18)?LOOT_TABLE:SUPPLY_LOOT);state.loot.push({...spot,...item,r:10,bob:rand(0,Math.PI*2),id:i});
  }
  seedRoomLoot();
  state.loot.forEach((item,index)=>item.spawnId=index);
  state.lootBaseCount=state.loot.length;
}
function takeLoot(item){if(!state.loot.includes(item))return false;state.loot=state.loot.filter(loot=>loot!==item);if(item.spawnId!=null)state.lootRespawns.push({item:{...item,bob:0},at:state.elapsed+LOOT_RESPAWN_SECONDS});return true;}
function respawnPool(item){
  if(item.room==='ARMORY')return LOOT_TABLE.filter(spec=>spec.type==='weapon'&&WEAPONS[spec.weapon].kind==='gun');
  if(item.room==='WORKSHOP')return LOOT_TABLE.filter(spec=>spec.type==='weapon'&&WEAPONS[spec.weapon].kind==='melee');
  if(item.room==='MEDICAL')return LOOT_TABLE.filter(spec=>spec.type==='health'||spec.type==='armor');
  if(item.room==='SUPPLY HUB')return LOOT_TABLE;
  if(['POWER STATION','RESEARCH LAB'].includes(item.room))return SUPPLY_LOOT;
  return LOOT_TABLE;
}
function respawnLoot(){for(let i=state.lootRespawns.length-1;i>=0;i--){
  const entry=state.lootRespawns[i];if(state.elapsed<entry.at)continue;
  const old=entry.item,pool=respawnPool(old).filter(spec=>spec.type!==old.type||spec.weapon!==old.weapon);
  const spec=weightedLoot(pool),room=old.room&&state.world.rooms.find(candidate=>candidate.name===old.room);
  const spot=room?roomSpot(room,true,old):findOpen(old.x/32,old.y/32,5,Infinity,(x,y)=>!state.loot.some(item=>Math.hypot(item.x/32-x,item.y/32-y)<2));
  const next={...old,...spot,...spec,bob:rand(0,Math.PI*2)};delete next.count;if(spec.count!=null)next.count=spec.count;
  state.loot.push(next);state.lootRespawns.splice(i,1);
}}
function spawnAmbientLoot(){
  if(state.loot.length>=state.lootBaseCount+AMBIENT_LOOT_LIMIT)return false;
  const p=state.player||{x:31*32,y:24*32};
  const spot=findOpen(p.x/32,p.y/32,6,Infinity,(x,y)=>!state.loot.some(item=>Math.hypot(item.x/32-x,item.y/32-y)<2));
  const spec=weightedLoot(Math.random()<.4?LOOT_TABLE:SUPPLY_LOOT);
  state.loot.push({...spot,...spec,r:10,bob:rand(0,Math.PI*2),id:`ambient-${state.ambientLootId++}`});
  return true;
}
function updateLootSpawns(dt){state.lootSpawnTimer+=dt;if(state.lootSpawnTimer>=AMBIENT_LOOT_INTERVAL){state.lootSpawnTimer-=AMBIENT_LOOT_INTERVAL;spawnAmbientLoot();}}
function startLocalGame(seed){clearOperationUi();state.runId++;setup.classList.add('hidden');menu.classList.add('hidden');game.classList.remove('hidden');state.elapsed=0;state.kills=0;state.found=0;state.feed=[];state.visibleMap=false;state.bullets=[];state.lootRespawns=[];state.lootSpawnTimer=0;state.ambientLootId=0;state.particles=[];state.round=1;state.roundEnd=false;state.scoreBlue=0;state.scoreRed=0;state.player=null;generateWorld(state.mode,seed);state.player=buildPlayer();state.bots=[];state.enemies=[];state.spawnTimer=0;
  if(state.mode==='survival'){state.player.x=state.world.spawnZones[0].x;state.player.y=state.world.spawnZones[0].y;state.player.invuln=2.5;if(state.settings.difficulty==='training'){state.player.hp=state.player.maxHp=150;state.player.armor=20;}else if(state.settings.difficulty==='survival'){state.player.hp=state.player.maxHp=80;}spawnLoot(46);spawnEnemy('guard',state.world.rooms[0]);const threatTotal=state.settings.difficulty==='training'?2:state.settings.difficulty==='survival'?5:3;for(let i=0;i<threatTotal;i++)spawnEnemy('monster');seedRoomThreats();$('#mode-label').textContent='LAB ESCAPE';$('#objective-label').textContent='REACH EXTRACTION';$('#objective-detail').textContent='Explore the lab';$('#objective-detail').classList.remove('blue-text');$('#score-panel').classList.add('hidden');$('#map-status').textContent='— EXPLORE';log('You entered Facility 07-C. Find a way out.','good');log('Supplies are marked by their silhouettes. Press E to collect.','good');}
  else {spawnLoot(40);const playerColor=state.settings.team==='blue'?'blue':'red',enemyColor=playerColor==='blue'?'red':'blue';state.player.team=playerColor;state.player.x=state.world.spawnZones[playerColor==='blue'?0:1].x;state.player.y=state.world.spawnZones[playerColor==='blue'?0:1].y;for(let i=0;i<state.teamSize-1;i++)spawnBot(playerColor,i);for(let i=0;i<state.teamSize;i++)spawnBot(enemyColor,i);$('#mode-label').textContent=`TEAM DEATHMATCH · ${state.teamSize}V${state.teamSize}`;$('#objective-label').textContent=`FIRST TEAM TO ${state.settings.target} WINS`;$('#objective-detail').textContent=`Win ${state.settings.target} eliminations`;$('#score-target').textContent=`FIRST TO ${state.settings.target}`;$('#score-panel').classList.remove('hidden');$('#teams-line').textContent=`${state.teamSize}V${state.teamSize} · BOTS ACTIVE`;$('#map-status').textContent='— TEAM VISION';log(`${state.teamSize}v${state.teamSize} match active. AI squads deployed.`,'good');log('Collect gear, then fight for your team.');}
  $('#threat-count').textContent=state.mode==='survival'?String(state.enemies.filter(e=>e.alive&&e.type==='monster').length):String(state.bots.length+1);$('#kill-count').textContent='0';$('#loot-count').textContent='0';$('#grenade-count').textContent=String(inventoryGrenades());$('#blue-score').textContent='0';$('#red-score').textContent='0';$('#health-value').textContent=String(state.player.hp);$('#health-bar').style.width='100%';$('#armor-value').textContent=`+ ${state.player.armor} ARM`;$('#armor-bar').style.width=`${state.player.armor}%`;renderWeapons();$('#event-log').innerHTML='';updateHUD();state.running=true;state.paused=false;state.lastTime=performance.now();resizeCanvas();const runId=state.runId;requestAnimationFrame(now=>frame(now,runId));}
function connectRoom(url){return new Promise((resolve,reject)=>{
  const socket=new WebSocket(url);
  const timeout=setTimeout(()=>{socket.close();fail('Room connection timed out');},5000);
  let welcome=null,lobby=null,settled=false;
  const fail=message=>{if(settled)return;settled=true;clearTimeout(timeout);reject(new Error(message));};
  socket.onerror=()=>fail('Room connection failed');
  socket.onclose=event=>fail(event.reason||'Room connection closed');
  socket.onmessage=event=>{
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message.type==='welcome')welcome=message;
    if(message.type==='lobby')lobby=message;
    if(welcome&&lobby&&!settled){settled=true;clearTimeout(timeout);resolve({socket,welcome,lobby});}
  };
});}
function renderRoomLobby(){
  const room=state.lobby;if(!room)return;
  const data=room.state,self=data.players.find(player=>player.id===room.welcome.id),isHost=data.hostId===room.welcome.id;
  const blue=data.players.filter(player=>player.team==='blue'),red=data.players.filter(player=>player.team==='red');
  const rows=(players,team)=>players.map(player=>`<div class="room-player"><span class="${team}-text">${team.toUpperCase()} ${player.id===room.welcome.id?'· YOU':''}${player.id===data.hostId?' · HOST':''}</span><b>${player.ready?'READY':'WAITING'}</b></div>`).join('');
  $('#setup-title').innerHTML='MATCH<br><span>LOBBY.</span>';
  $('#setup-subtitle').textContent=`Room ${data.code} · ${data.teamSize}v${data.teamSize} · first to ${data.target}. Share the code with another player.`;
  $('#setup-options').innerHTML=`<div class="config-label">ROOM CODE</div><div class="room-code-display" aria-label="Room code">${data.code}</div><div class="config-label">PLAYERS · BOTS FILL EMPTY SPOTS</div><div class="room-player-list">${rows(blue,'blue')}${rows(red,'red')}</div><button id="room-ready-button" class="choice room-ready-button ${self?.ready?'selected':''}" type="button">${self?.ready?'READY ✓':'READY UP'}</button><p class="room-help" id="room-lobby-message">${isHost?'When everyone is ready, start the match.':'Waiting for the host to start the match.'}</p>`;
  $('#room-ready-button').addEventListener('click',()=>room.socket.send(JSON.stringify({type:'lobby',action:'ready',ready:!self?.ready})));
  const canStart=isHost&&data.players.length>0&&data.players.every(player=>player.ready);
  const startButton=$('#start-button');
  startButton.disabled=!canStart;
  startButton.innerHTML=`${isHost?'START MATCH':'WAITING FOR HOST'} <span>→</span>`;
}
function startRoomMatch(snapshot){
  const room=state.lobby;if(!room)return;
  const {socket,welcome}=room;
  state.lobby=null;
  state.settings.team=welcome.team;
  state.teamSize=welcome.teamSize;
  state.settings.target=welcome.target;
  startLocalGame(welcome.seed);
  state.remote={socket,id:welcome.id,nextInputAt:0,actions:{}};
  applyRemoteSnapshot(snapshot);
  $('#mode-label').textContent=`${usesLocalRooms()?'DEV':'ONLINE'} MATCH · ${state.teamSize}V${state.teamSize}`;
  $('#teams-line').textContent=`ROOM ${welcome.code} · SERVER MATCH`;
  log(`Room ${welcome.code} is live.`, 'good');
}
async function startGame(){
  if(state.lobby){state.lobby.socket.send(JSON.stringify({type:'lobby',action:'start'}));return;}
  const roomBase=state.mode==='pvp'&&roomServiceBase();
  if(!roomBase){startLocalGame();return;}
  const runId=state.runId,button=$('#start-button'),original=button.innerHTML;
  button.disabled=true;button.textContent=state.roomAction==='join'?'JOINING ROOM…':'CREATING ROOM…';
  try{
    let code;
    if(state.roomAction==='create'){
      const response=await fetch(`${roomBase}/rooms`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamSize:state.teamSize,target:state.settings.target})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not create room');
      code=result.code;
    }else{
      code=$('#room-code-input').value.trim().toUpperCase();
      if(!/^[A-Z2-9]{6}$/.test(code))throw new Error('Enter a six-character room code.');
      const response=await fetch(`${roomBase}/rooms/${code}`);
      if(!response.ok)throw new Error('Room not found or already started.');
    }
    if(runId!==state.runId)return;
    const roomUrl=new URL(roomBase);
    roomUrl.protocol=roomUrl.protocol==='https:'?'wss:':'ws:';
    const connection=await connectRoom(`${roomUrl.origin}/rooms/${code}?team=${state.settings.team}`);
    if(runId!==state.runId){connection.socket.close();return;}
    state.lobby={...connection,state:connection.lobby};
    connection.socket.onmessage=event=>{
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='lobby'){if(state.lobby?.socket===connection.socket){state.lobby.state=message;renderRoomLobby();}}
      else if(message.type==='lobby-error')$('#room-lobby-message').textContent=message.message;
      else if(message.type==='snapshot'){
        if(state.lobby?.socket===connection.socket)startRoomMatch(message);
        else if(state.remote?.socket===connection.socket)applyRemoteSnapshot(message);
      }
    };
    connection.socket.onclose=()=>{
      if(state.lobby?.socket===connection.socket){openSetup('pvp');$('#setup-subtitle').textContent='Room connection lost. Create or join a room again.';}
      else if(state.remote?.socket===connection.socket&&state.running)finish(false,'CONNECTION LOST','The room server disconnected.');
    };
    renderRoomLobby();
  }catch(error){
    if(runId===state.runId)$('#setup-subtitle').textContent=error.message;
  }finally{
    if(runId===state.runId&&!state.lobby){button.disabled=false;button.innerHTML=original;}
  }
}
function applyRemoteSnapshot(snapshot){
  if(!state.remote||snapshot.seed!==state.world.seed)return;
  state.elapsed=snapshot.elapsed;
  state.scoreBlue=snapshot.scoreBlue;state.scoreRed=snapshot.scoreRed;
  Object.assign(state.player,snapshot.self,{reloadUntil:snapshot.self.reloadUntil>snapshot.elapsed?performance.now()+(snapshot.self.reloadUntil-snapshot.elapsed)*1000:0});
  state.bots=snapshot.units;
  state.bullets=snapshot.bullets;
  state.loot=snapshot.loot;
  for(const doorState of snapshot.doors)state.world.doors[doorState.index].open=doorState.open;
  state.kills=snapshot.self.kills;
  $('#kill-count').textContent=String(state.kills);
  $('#blue-score').textContent=String(state.scoreBlue);
  $('#red-score').textContent=String(state.scoreRed);
  renderWeapons();
  if(snapshot.winner&&state.running)finish(snapshot.winner===state.player.team,`${snapshot.winner.toUpperCase()} TEAM WINS`,`Final score ${state.scoreBlue} : ${state.scoreRed}`);
}
function queueRemoteAction(name,value=true){if(state.remote)state.remote.actions[name]=value;}
function updateRemote(now){
  const p=state.player;if(!p)return;
  const width=Number(canvas.dataset.cssWidth)||600,height=Number(canvas.dataset.cssHeight)||400;
  state.camera.x=clamp(p.x-width/2,0,state.world.w*32-width);state.camera.y=clamp(p.y-height/2,0,state.world.h*32-height);
  updateVision(now);
  const pointer=state.mouse;
  if(state.touchFire){const target=state.bots.filter(unit=>unit.alive&&unit.team!==p.team).sort((a,b)=>dist(p,a)-dist(p,b))[0];if(target)p.angle=Math.atan2(target.y-p.y,target.x-p.x);}
  else p.angle=Math.atan2(pointer.y+state.camera.y-p.y,pointer.x+state.camera.x-p.x);
  const remote=state.remote;if(!remote||remote.socket.readyState!==WebSocket.OPEN||now<remote.nextInputAt)return;
  const moveX=Number(state.keys.has('d')||state.keys.has('arrowright'))-Number(state.keys.has('a')||state.keys.has('arrowleft'));
  const moveY=Number(state.keys.has('s')||state.keys.has('arrowdown'))-Number(state.keys.has('w')||state.keys.has('arrowup'));
  remote.socket.send(JSON.stringify({type:'input',moveX,moveY,aim:p.angle,fire:pointer.down||state.keys.has(' '),...remote.actions}));
  remote.actions={};remote.nextInputAt=now+33;
}
function arenaStarterKit(){return createArenaStarterKit(Math.random);}
function spawnBot(team,i){const zone=state.world.spawnZones[team==='blue'?0:1],pos=findOpen(zone.x/32,zone.y/32,0,7);const b={...pos,team,ai:true,alive:true,r:10,hp:100,maxHp:100,speed:rand(85,115),...createBotStarterKit(Math.random),pickedSlots:[false,false,false,false],pickedArmor:false,angle:0,fireTime:rand(0,500),stun:0,invuln:0,respawn:0,id:`${team}${i}`,kills:0,target:null,think:rand(0,1)};state.bots.push(b);}
function spawnEnemy(type='monster',room=null,chosenVariant=null){
  const origin=state.player||{x:40*32,y:32*32};
  const corridor=(x,y)=>!state.world.rooms.some(candidate=>x>=candidate.x&&x<candidate.x+candidate.w&&y>=candidate.y&&y<candidate.y+candidate.h);
  const pos=room?roomSpot(room):findOpen(origin.x/32,origin.y/32,type==='guard'?5:15,40,corridor);
  const hard=state.settings.difficulty==='survival',training=state.settings.difficulty==='training';
  const variant=type==='guard'?null:chosenVariant||choice(['crawler','crawler','brute','spitter']);
  const specs=type==='guard'?{r:10,hp:76,speed:72,damage:10}:{crawler:{r:9,hp:40,speed:126,damage:7},brute:{r:16,hp:142,speed:48,damage:17},spitter:{r:12,hp:64,speed:83,damage:9}}[variant];
  const e={...pos,type,variant,room:room?.name||null,alive:true,r:specs.r,hp:specs.hp*(hard?1.2:1),maxHp:specs.hp*(hard?1.2:1),speed:specs.speed*(training?.8:hard?1.1:1),damage:specs.damage*(training?.55:hard?1.4:1),angle:0,fireTime:rand(200,900),stun:0,invuln:0,hitFlash:0,think:0,target:null,pathPoint:null,id:Math.random(),team:type==='guard'?(state.player?.team||'blue'):null};
  state.enemies.push(e);return e;
}
function seedRoomThreats(){
  const difficulty=state.settings.difficulty;
  const count=(training,standard,hardcore)=>difficulty==='training'?training:difficulty==='survival'?hardcore:standard;
  for(const room of state.world.rooms){
    if(room.name==='NEST CHAMBER')for(let i=0;i<count(3,5,7);i++)spawnEnemy('monster',room,i%4===3?'brute':'crawler');
    else if(room.name==='SPECIMEN HOLD')for(let i=0;i<count(1,3,4);i++)spawnEnemy('monster',room,i===0?'brute':'crawler');
    else if(room.name==='QUARANTINE')for(let i=0;i<count(1,2,3);i++)spawnEnemy('monster',room,'spitter');
    else if(room.name==='RESEARCH LAB')for(let i=0;i<count(0,1,2);i++)spawnEnemy('monster',room,'spitter');
  }
}
function renderWeapons(){const p=state.player;if(!p)return;const el=$('#weapon-list');el.innerHTML='';for(let i=0;i<4;i++){const slot=p.inventory[i],isItem=slot!==null&&typeof slot==='object',id=typeof slot==='number'?slot:null,w=id===null?null:WEAPONS[id],b=document.createElement('button');b.className=`weapon-slot ${i===p.active?'active':''} ${state.pendingLoot?'replace-target':''}`;b.dataset.slot=i;b.setAttribute('aria-label',w?`Slot ${i+1}, ${w.name}${w.kind==='gun'?`, ${p.ammo[id]||0} rounds loaded, infinite reserve`:''}`:isItem?`Slot ${i+1}, ${inventoryItemLabel(slot)}, count ${slot.count}, press fire to use`:`Slot ${i+1}, empty`);const name=w?w.name.toUpperCase():isItem?`${inventoryItemLabel(slot)} ×${slot.count}`:'EMPTY SLOT',detail=w?(w.kind==='gun'?w.family===2?(w.name==='Auto Shotgun'?'AUTO SHOTGUN':w.name==='Slug Shotgun'?'SLUG SHOTGUN':'PUMP SHOTGUN'):'FIREARM':`MELEE · ${w.name.toUpperCase()}`):isItem?slot.item==='health'?'SPACE · HEAL':'SPACE / G · THROW':'COLLECT A WEAPON';b.innerHTML=`<span class="weapon-key"><b>${i+1}</b></span><span class="slot-icon">${w?weaponIcon(id):isItem?inventoryItemIcon(slot):'<span class="empty-icon">＋</span>'}</span><span class="slot-details"><b class="weapon-name">${name}</b><small>${detail}</small></span><span class="weapon-ammo">${w?.kind==='gun'?`<b>${p.ammo[id]??w.magazine}</b><small> / ∞</small>`:isItem?`<b>×${slot.count}</b>`:w?'∞':'—'}</span>`;b.addEventListener('click',()=>equip(i));el.appendChild(b);}$('#reload-status').textContent=p.reloadUntil>performance.now()?'RELOADING…':'R RELOAD · ∞ RESERVE';}
function log(text,tone=''){const item=document.createElement('div');item.className=`log-entry ${tone}`;item.innerHTML='<i></i><span></span>';item.lastElementChild.textContent=text;const logEl=$('#event-log');logEl.prepend(item);while(logEl.children.length>6)logEl.lastElementChild.remove();}
function announce(text){const el=$('#notice');el.textContent=text;el.classList.remove('hidden');lastNotice=performance.now();}
function setBanner(text){const el=$('#round-banner'),runId=state.runId;el.textContent=text;el.classList.remove('hidden');setTimeout(()=>{if(runId===state.runId)el.classList.add('hidden');},2400);}
function sound(freq=180,type='square',duration=.045,volume=.025){try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch{}}

function resizeCanvas(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);canvas.dataset.cssWidth=rect.width;canvas.dataset.cssHeight=rect.height;}
function frame(now,runId){if(!state.running||runId!==state.runId)return;requestAnimationFrame(next=>frame(next,runId));if(state.paused)return;const dt=Math.min((now-state.lastTime)/1000,.045);state.lastTime=now;if(state.remote)updateRemote(now);else{state.elapsed+=dt;update(dt,now);}render(now);updateHUD();drawMinimap();if(!$('#notice').classList.contains('hidden')&&now-lastNotice>1600)$('#notice').classList.add('hidden');}
function update(dt,now){const p=state.player;if(!p)return;const cx=Number(canvas.dataset.cssWidth)||600,cy=Number(canvas.dataset.cssHeight)||400;state.camera.x=clamp(p.x-cx/2,0,state.world.w*32-cx);state.camera.y=clamp(p.y-cy/2,0,state.world.h*32-cy);updateVision(now);const pointer=state.mouse;const sx=pointer.x+state.camera.x,sy=pointer.y+state.camera.y;if(state.touchFire){const targets=state.mode==='pvp'?state.bots.filter(b=>b.alive&&b.team!==p.team):state.enemies.filter(e=>e.alive);const target=targets.sort((a,b)=>dist(p,a)-dist(p,b))[0];if(target)p.angle=Math.atan2(target.y-p.y,target.x-p.x);}else p.angle=Math.atan2(sy-p.y,sx-p.x);if(p.invuln>0)p.invuln=Math.max(0,p.invuln-dt);if(p.hitFlash>0)p.hitFlash=Math.max(0,p.hitFlash-dt);if(p.reloadUntil>0&&now>=p.reloadUntil){const id=p.reloadingWeapon,w=WEAPONS[id];if(w?.kind==='gun')p.ammo[id]=w.magazine;p.reloadUntil=0;p.reloadingWeapon=null;log(`${w?.name||'Weapon'} reloaded.`,'good');renderWeapons();}if(p.stun>0)p.stun-=dt;
  let mx=(state.keys.has('d')||state.keys.has('arrowright')?1:0)-(state.keys.has('a')||state.keys.has('arrowleft')?1:0);let my=(state.keys.has('s')||state.keys.has('arrowdown')?1:0)-(state.keys.has('w')||state.keys.has('arrowup')?1:0);const mag=Math.hypot(mx,my);if(p.alive&&mag){mx/=mag;my/=mag;move(p,mx*p.speed*dt,my*p.speed*dt);}
  if(p.alive&&(pointer.down||state.keys.has(' '))&&now>state.fireAt)shoot(p,p.angle,now);for(const bot of state.bots)if(bot.alive)updateBot(bot,dt,now);else{bot.respawn-=dt;if(bot.respawn<=0)respawnBot(bot);}
  for(const e of state.enemies)if(e.alive)updateEnemy(e,dt,now);for(const bullet of state.bullets)advanceBullet(bullet,dt);
  state.bullets=state.bullets.filter(b=>!b.dead);respawnLoot();updateLootSpawns(dt);for(const l of state.loot)l.bob+=dt*3;for(const part of state.particles){part.x+=part.vx*dt;part.y+=part.vy*dt;part.life-=dt;}state.particles=state.particles.filter(x=>x.life>0);
  if(state.mode==='survival'){state.spawnTimer+=dt;if(state.enemies.filter(e=>e.alive&&e.type==='monster').length<(state.settings.difficulty==='survival'?6:4)&&state.spawnTimer>14){spawnEnemy('monster');state.spawnTimer=0;}if(!p.alive)finish(false,'SIGNAL LOST','You were eliminated inside the facility.');}
  else{state.bots=state.bots.filter(b=>b.alive||b.respawn>0);if(!p.alive){p.respawn-=dt;if(p.respawn<=0)respawnPlayer();}$('#blue-score').textContent=String(state.scoreBlue);$('#red-score').textContent=String(state.scoreRed);const winner=winningTeam(state,state.settings.target);if(winner)finish(state.player.team===winner,`${winner.toUpperCase()} TEAM WINS`,`Final score ${state.scoreBlue} : ${state.scoreRed}`);}
}
function blocked(x,y,radius=7){return isBlocked(state.world,x,y,radius);}
function nearbyDoor(actor,radius=54,closedOnly=false){
  const t=state.world?.tile||32;
  return state.world?.doors?.filter(door=>{
    if(closedOnly&&door.open||dist(actor,{x:door.cx,y:door.cy})>=radius)return false;
    const edge={x:clamp(actor.x,door.x*t,(door.x+2)*t),y:clamp(actor.y,door.y*t,(door.y+1)*t)};
    return lineClear(actor,edge,0);
  }).sort((a,b)=>dist(actor,{x:a.cx,y:a.cy})-dist(actor,{x:b.cx,y:b.cy}))[0]||null;
}
function setDoorOpen(door,open,actor=null){
  if(!changeDoorState(state.world,door,open,[state.player,...state.bots,...state.enemies])){
    if(actor===state.player&&door&&!open&&door.open)announce('DOORWAY BLOCKED — STEP CLEAR');
    return false;
  }
  if(actor===state.player)announce(`${door.room.name} ${open?'OPENED':'CLOSED'}`);
  return true;
}
function nearbyInteraction(){
  const p=state.player;if(!p?.alive)return null;
  if(state.mode==='survival'&&dist(p,state.world.exit)<state.world.exit.r+15)return{type:'exit'};
  const door=nearbyDoor(p);
  if(door&&!door.open)return{type:'door',door};
  const item=state.loot.filter(item=>dist(p,item)<39&&visibleAt(item.x,item.y)&&lineClear(p,item)).sort((a,b)=>dist(p,a)-dist(p,b))[0];
  if(item)return{type:'loot',item};
  return door?{type:'door',door}:null;
}
function bulletTargets(bullet){
  const owner=bullet.owner,p=state.player;
  if(state.mode==='pvp'&&owner?.team)return[p,...state.bots].filter(target=>target&&target!==owner&&target.alive&&target.team!==owner.team);
  if(state.mode==='survival'&&(owner===p||owner?.type==='guard'))return state.enemies.filter(target=>target.alive&&target.type==='monster');
  if(state.mode==='survival'&&owner?.type==='monster')return[p,...state.enemies.filter(target=>target.type==='guard')].filter(target=>target?.alive);
  return[];
}
function advanceBullet(bullet,dt){
  const target=advanceProjectile(state.world,bullet,dt,bulletTargets(bullet));
  if(target)hit(target,bullet.damage,bullet.owner);
}
function updateVision(now){const world=state.world;if(now-world.visionAt<180)return;world.visionAt=now;const p=state.player,observers=p?.alive?[p]:[];if(state.mode==='pvp')observers.push(...state.bots.filter(b=>b.alive&&b.team===p.team));else observers.push(...state.enemies.filter(e=>e.alive&&e.type==='guard'&&e.team===p.team));world.visible=revealTiles(world,observers.map(actor=>({actor,radius:actor===p?Infinity:state.mode==='pvp'?9:8})));for(const key of world.visible)world.explored.add(key);}
function move(e,dx,dy){moveActor(state.world,e,dx,dy);}
function reloadWeapon(now=performance.now()){if(state.remote){queueRemoteAction('reload');return;}const p=state.player,id=p?.inventory[p.active],w=id==null?null:WEAPONS[id];if(!p||!w||w.kind!=='gun'||(p.ammo[id]??w.magazine)>=w.magazine||p.reloadUntil>now)return;p.reloadingWeapon=id;p.reloadUntil=now+(w.family===2&&w.name!=='Auto Shotgun'?1050:780);$('#reload-status').textContent='RELOADING…';log(`${w.name} reloading.`);}
function shoot(entity,angle,now){
  const slot=entity.inventory[entity.active];
  if(entity===state.player&&slot&&typeof slot==='object'){
    if(now<entity.fireAt)return;
    if(slot.item==='health'){
      if(entity.hp>=entity.maxHp){announce('HEALTH ALREADY FULL');entity.fireAt=now+300;return;}
      if(!healWithMedkit(entity,entity.active))return;
      entity.fireAt=now+350;log('Medkit used.','good');announce('MEDKIT USED');sound(560,'sine',.1,.025);renderWeapons();return;
    }
    if(slot.item==='grenade'){useGrenade(angle);return;}
  }
  const id=typeof slot==='number'?slot:0,w=WEAPONS[id];
  if(entity===state.player&&w.kind==='gun'){
    if(entity.reloadUntil>now)return;
    if((entity.ammo[id]??w.magazine)<=0){reloadWeapon(now);return;}
    entity.ammo[id]--;
  }
  entity.fireTime=now;
  if(entity===state.player)state.fireAt=now+w.rate;else entity.fireTime=now+w.rate*rand(.95,1.1);
  if(w.kind==='melee'){
    entity.swingStarted=now;entity.swingUntil=now+MELEE_SWING_MS;
    const targets=state.mode==='pvp'?[state.player,...state.bots]:state.enemies;
    for(const target of targets)if(target&&target!==entity&&target.alive&&target.team!==entity.team&&dist(entity,target)<w.range+entity.r&&lineClear(entity,target)){
      const targetAngle=Math.atan2(target.y-entity.y,target.x-entity.x);
      if(Math.abs(angleDiff(targetAngle,angle))<.85)hit(target,w.damage,entity);
    }
    if(state.mode==='survival'&&dist(entity,state.world.exit)<90)announce('EXTRACTION ZONE — PRESS E TO ESCAPE');
    sound(155,'triangle',.12,entity===state.player?.025:.012);
    return;
  }
  state.bullets.push(...createGunProjectiles(entity,w,angle,Math.random));
  if(state.mode==='pvp')for(const bot of state.bots){
    if(!bot.alive||bot===entity||bot.team===entity.team||dist(bot,entity)>BOT_SIGHT_RANGE)continue;
    const towardBot=Math.atan2(bot.y-entity.y,bot.x-entity.x);
    if(Math.abs(angleDiff(towardBot,angle))>.28||!botCanSeeTarget(bot,entity))continue;
    bot.recentAttacker=entity;bot.attackedAt=state.elapsed;bot.think=0;
  }
  muzzle(entity.x+Math.cos(angle)*28,entity.y+Math.sin(angle)*28,w.color);
  sound(entity===state.player?215:150,'square',.04,entity===state.player?.022:.008);
  if(entity===state.player)renderWeapons();
}
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function hit(target,damage,source){
  const result=applyDamage(target,damage);
  if(!result.applied)return;
  if(target.ai&&source?.alive&&source.team!==target.team){target.recentAttacker=source;target.attackedAt=state.elapsed;target.think=0;}
  burst(target.x,target.y,target.team==='red'||target.type==='monster'?'#f2745e':'#c0ef75',3);
  if(!result.killed)return;
  burst(target.x,target.y,target.type==='monster'?'#c25e48':target.team==='blue'?'#72a9ed':'#f2745e',15);
  sound(80,'triangle',.13,.025);
  if(target===state.player){
    log('Operator down.','danger');
    if(state.mode==='pvp'){
      dropPlayerLoadout();
      if(source?.team&&source.team!==target.team)recordElimination(state,target.team);
      target.respawn=2.1;setBanner('OPERATOR DOWN · RESPAWNING');
    }
    return;
  }
  if(state.mode==='pvp'&&target.ai){dropBotLoadout(target);target.respawn=2.4;}
  if(source===state.player){
    state.kills++;$('#kill-count').textContent=String(state.kills);state.player.kills++;
    if(state.mode==='pvp')recordElimination(state,target.team);
    const victim=target.type==='monster'?`${target.variant||'monster'} neutralized`:target.team?.toUpperCase()+' unit eliminated';
    log(`${victim}.`,'good');announce(target.type==='monster'?`${(target.variant||'MONSTER').toUpperCase()} NEUTRALIZED`:'ENEMY ELIMINATED');
  }else if(state.mode==='pvp')recordElimination(state,target.team);
}
function botCanSeeTarget(bot,target){
  return canSeeOpponent(state.world,bot,target,BOT_SIGHT_RANGE);
}
function botTargetScore(bot,target){return scoreVisibleTarget(state.world,bot,target,BOT_SIGHT_RANGE,state.elapsed);}
function botPatrolPoint(bot){
  const segments=state.world.corridors?.segments;
  if(segments?.length){const hall=choice(segments),x=Math.floor(rand(hall.x1,hall.x2+1)),y=Math.floor(rand(hall.y1,hall.y2+1));return{x:(x+.5)*32,y:(y+.5)*32};}
  return findOpen(bot.x/32,bot.y/32,3,12);
}
function botWeaponScore(id,target,d,clear){return scoreBotWeapon(id,target,d,clear);}
function botWeaponPlan(bot,weaponId){return planBotWeapon(bot,weaponId);}
function botCanTakeLoot(bot,item){return botAcceptsLoot(bot,item,Math.random);}
function botPickupLoot(bot){
  const item=state.loot.find(loot=>dist(bot,loot)<20&&botCanTakeLoot(bot,loot));
  if(!item)return;
  bot.pickedSlots??=[false,false,false,false];
  const slot=item.type==='weapon'?botWeaponPlan(bot,item.weapon)?.slot:null;
  const result=collectInventoryItem(bot,item,slot);
  if(!result.collected)return;
  if(result.replaced!=null)state.loot.push(dropInventorySlot(result.replaced,bot,result.slot*2));
  if(item.type==='armor')bot.pickedArmor=true;
  else bot.pickedSlots[result.slot]=true;
  takeLoot(item);
}
function botUseMedkit(bot){
  if(bot.hp>55)return;
  const slot=bot.inventory.findIndex(value=>value?.item==='health');
  if(slot<0||!healWithMedkit(bot,slot))return;
  burst(bot.x,bot.y,'#90d485',8);
}
function updateBot(bot,dt,now){
  updateArenaBot(state,bot,dt,now,{
    random:Math.random,
    openNearbyDoor:actor=>{if(state.mode==='pvp')setDoorOpen(nearbyDoor(actor,37,true),true,actor);},
    pickupLoot:botPickupLoot,
    useMedkit:botUseMedkit,
    canTakeLoot:botCanTakeLoot,
    findPatrolPoint:botPatrolPoint,
    shoot,
  });
}
function wanderEnemy(e,dt,now){if(!Number.isFinite(e.wanderAngle)||now>=(e.wanderUntil||0)){e.wanderAngle=rand(-Math.PI,Math.PI);e.wanderUntil=now+rand(800,1600);}move(e,Math.cos(e.wanderAngle)*e.speed*.35*dt,Math.sin(e.wanderAngle)*e.speed*.35*dt);}
function updateEnemy(e,dt,now){if(e.invuln>0)e.invuln=Math.max(0,e.invuln-dt);if(e.hitFlash>0)e.hitFlash-=dt;e.think-=dt;if(e.think<=0){e.think=rand(.24,.4);const friendlyGuard=e.type==='guard'&&e.team===state.player.team,range=friendlyGuard?BOT_SIGHT_RANGE:PLAYER_SIGHT_RANGE;let targets=e.type==='monster'?state.enemies.filter(x=>x.alive&&x.type==='guard'&&x.team===state.player.team):state.enemies.filter(x=>x.alive&&x.type==='monster');if(!friendlyGuard&&canSeePlayer(e))targets.push(state.player);if(state.mode==='pvp')targets.push(...state.bots.filter(b=>b.alive&&(!e.team||b.team!==e.team)));e.target=targets.filter(x=>x!==e&&dist(e,x)<=range&&lineClear(e,x)).sort((a,b)=>dist(e,a)-dist(e,b))[0]||null;e.pathPoint=e.target?nextPathStep(e,e.target):null;}if(e.target&&(dist(e,e.target)>(e.type==='guard'?BOT_SIGHT_RANGE:PLAYER_SIGHT_RANGE)||!lineClear(e,e.target)))e.target=null;if(!e.target?.alive){wanderEnemy(e,dt,now);return;}const d=dist(e,e.target),a=Math.atan2(e.target.y-e.y,e.target.x-e.x);e.angle=a;if(e.type==='guard'){if(d>210||!firingLaneClear(e,e.target))steerToward(e,e.target,e.pathPoint,e.speed,dt,true);else if(d<140)move(e,-Math.cos(a)*e.speed*.35*dt,-Math.sin(a)*e.speed*.35*dt);if(now>e.fireTime&&d<460&&firingLaneClear(e,e.target)){state.bullets.push({x:e.x+Math.cos(a)*14,y:e.y+Math.sin(a)*14,vx:Math.cos(a)*445,vy:Math.sin(a)*445,owner:e,damage:e.damage,life:1.25,color:'#f2745e'});e.fireTime=now+rand(700,1050);}}
  else if(e.variant==='spitter'){if(d>250||!firingLaneClear(e,e.target))steerToward(e,e.target,e.pathPoint,e.speed,dt);else if(d<155)move(e,-Math.cos(a)*e.speed*.35*dt,-Math.sin(a)*e.speed*.35*dt);if(now>e.fireTime&&d<390&&firingLaneClear(e,e.target)){state.bullets.push({x:e.x+Math.cos(a)*14,y:e.y+Math.sin(a)*14,vx:Math.cos(a)*310,vy:Math.sin(a)*310,owner:e,damage:e.damage,life:1.35,color:'#91d56e',acid:true});e.fireTime=now+1050;}}
  else if(d>e.r+e.target.r+6)steerToward(e,e.target,e.pathPoint,e.speed,dt);else if(now>e.fireTime){hit(e.target,e.damage,e);e.fireTime=now+(e.variant==='brute'?920:650);burst(e.target.x,e.target.y,e.variant==='spitter'?'#91d56e':'#f2745e',5);}}
function lineClear(a,b,radius=7){return hasLineOfSight(state.world,a,b,radius);}
function canSeePlayer(actor){return state.player?.alive&&dist(actor,state.player)<=PLAYER_SIGHT_RANGE&&lineClear(actor,state.player);}
function firingLaneClear(actor,target){return canFireAt(state.world,actor,target);}
function nextPathStep(actor,target){return findPathStep(state.world,actor,target);}
function steerToward(actor,target,pathPoint,speed,dt,requireLane=false){steerActor(state.world,actor,target,pathPoint,speed,dt,requireLane);}
function respawnBot(b){const zone=state.world.spawnZones[b.team==='blue'?0:1],p=findOpen(zone.x/32,zone.y/32,0,5),kit=createBotStarterKit(Math.random);b.x=p.x;b.y=p.y;b.hp=100;b.armor=25;b.alive=true;b.invuln=.55;b.respawn=0;b.inventory=kit.inventory;b.ammo=kit.ammo;b.pickedSlots=[false,false,false,false];b.pickedArmor=false;b.active=kit.active;b.target=null;b.recentAttacker=null;b.pathPoint=null;b.patrolTarget=null;b.patrolRoom=null;b.exploredRooms=new Set();b.lootJudgments=new WeakMap();b.think=0;b.fireTime=performance.now()+500;}
function respawnPlayer(){const p=state.player,zone=state.world.spawnZones[p.team==='blue'?0:1],pos=findOpen(zone.x/32,zone.y/32,0,5),kit=arenaStarterKit();p.x=pos.x;p.y=pos.y;p.hp=100;p.armor=25;p.alive=true;p.invuln=.65;p.respawn=0;p.inventory=kit.inventory;p.ammo=kit.ammo;p.active=kit.active;p.starterWeapon=kit.inventory[1];announce('OPERATOR BACK IN THE FIGHT');renderWeapons();}
function burst(x,y,color,n){for(let i=0;i<n;i++)state.particles.push({x,y,vx:rand(-95,95),vy:rand(-95,95),life:rand(.12,.42),max:.42,color,r:rand(1,3)});}
function muzzle(x,y,color){for(let i=0;i<3;i++)state.particles.push({x,y,vx:rand(-30,30),vy:rand(-30,30),life:.07,max:.07,color,r:rand(2,4)});}
function useGrenade(aimAngle=null){if(state.remote){queueRemoteAction('grenade');return;}const p=state.player;if(!p?.alive){announce('NO GRENADES');return;}const index=p.inventory.findIndex(slot=>slot?.item==='grenade');if(index<0){announce('NO GRENADES');return;}consumeInventoryItem(p,'grenade',index);p.fireAt=performance.now()+360;$('#grenade-count').textContent=String(inventoryGrenades());renderWeapons();const tx=state.mouse.x+state.camera.x,ty=state.mouse.y+state.camera.y,angle=aimAngle??Math.atan2(ty-p.y,tx-p.x);const x=p.x+Math.cos(angle)*GRENADE_THROW_DISTANCE,y=p.y+Math.sin(angle)*GRENADE_THROW_DISTANCE;state.particles.push({x,y,vx:0,vy:0,life:.45,max:.45,color:'#dd8e68',r:9,grenade:true});const runId=state.runId;setTimeout(()=>{if(!state.running||runId!==state.runId)return;burst(x,y,'#e78e62',23);for(const t of state.mode==='pvp'?state.bots:state.enemies)if(t.alive&&dist({x,y},t)<112)hit(t,115*(1-dist({x,y},t)/180),p);sound(80,'sawtooth',.25,.065);},450);sound(110,'triangle',.09,.02);}
function interact(){
  if(state.remote){queueRemoteAction('interact');return;}
  const p=state.player;
  if(!state.running||state.paused||!p?.alive)return;
  const action=nearbyInteraction();
  if(!action){announce('NOTHING IN REACH');return;}
  if(action.type==='exit'){finish(true,'EXTRACTION CONFIRMED','You reached the extraction zone.');return;}
  if(action.type==='door'){setDoorOpen(action.door,!action.door.open,p);return;}
  const item=action.item,result=collectInventoryItem(p,item);
  if(!result.collected){
    state.pendingLoot=item;
    $('#inventory-prompt').textContent=`${item.label} FOUND — SELECT A SLOT BELOW TO SWAP`;
    $('#inventory-prompt').classList.remove('hidden');
    announce(item.type==='weapon'?`${item.label} READY TO EQUIP`:`${item.label} NEEDS AN INVENTORY SLOT`);
    renderWeapons();return;
  }
  takeLoot(item);
  if(item.type==='weapon'){
    p.active=result.slot;log(`${item.label} added to slot ${result.slot+1}.`,'good');announce(`${item.label} COLLECTED`);
  }else if(item.type==='health'||item.type==='grenade'){
    if(!result.stacked)p.active=result.slot;
    announce(`${item.label} ADDED TO INVENTORY`);log(`${inventoryItemLabel({item:item.type})} stored in inventory.`,'good');
  }else if(item.type==='armor'){
    log('Armor equipped.','good');announce(`${item.label} COLLECTED`);
  }
  state.found++;$('#loot-count').textContent=String(state.found);
  sound(500,'sine',.08,.018);$('#grenade-count').textContent=String(inventoryGrenades());renderWeapons();
}
function finish(won,title,copy){if(state.roundEnd)return;state.roundEnd=true;state.running=false;$('#result-title').innerHTML=title.replace(' ','<br>');$('#result-copy').textContent=copy;$('#result-eyebrow').textContent=won?'OPERATION COMPLETE':'OPERATION FAILED';$('#end-overlay').classList.remove('hidden');}
function togglePause(){if(!state.running)return;if(state.remote){announce('LIVE MATCH CANNOT PAUSE');return;}state.paused=!state.paused;$('#pause-overlay').classList.toggle('hidden',!state.paused);game.classList.toggle('paused',state.paused);if(!state.paused)state.lastTime=performance.now();}
function updateHUD(){
  const p=state.player;if(!p)return;
  $('#health-value').textContent=String(Math.ceil(p.hp));$('#health-bar').style.width=`${clamp(p.hp/p.maxHp*100,0,100)}%`;
  $('#armor-value').textContent=`+ ${Math.ceil(p.armor||0)} ARM`;$('#armor-bar').style.width=`${clamp(p.armor||0,0,100)}%`;
  $('#grenade-count').textContent=String(inventoryGrenades(p));
  const minutes=Math.floor(state.elapsed/60),seconds=Math.floor(state.elapsed%60);
  $('#clock').textContent=`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  const alive=state.mode==='survival'?state.enemies.filter(e=>e.alive&&e.type==='monster').length:state.bots.filter(b=>b.alive&&b.team!==p.team).length;
  $('#threat-count').textContent=String(alive);
  const action=nearbyInteraction();
  const prompt=action?.type==='door'?`[ E ] ${action.door.open?'CLOSE':'OPEN'} ${action.door.room.name}`:action?.type==='exit'?'[ E ] EXTRACT':action?.type==='loot'?`[ E ] PICK UP ${action.item.label}`:'';
  $('#context-prompt').classList.toggle('hidden',!prompt);if(prompt)$('#context-prompt').textContent=prompt;
  if(state.mode==='survival')$('#objective-detail').textContent=dist(p,state.world.exit)<220?'Extraction zone nearby':`${Math.max(0,Math.round(dist(p,state.world.exit)/32))} m to extraction`;
}

function drawRoomProps(){
  for(const prop of state.roomProps){
    const x=prop.x-state.camera.x,y=prop.y-state.camera.y;
    if(x<-32||y<-32||x>Number(canvas.dataset.cssWidth)+32||y>Number(canvas.dataset.cssHeight)+32)continue;
    ctx.save();ctx.translate(x,y);ctx.lineWidth=1;
    if(prop.kind==='nest'){ctx.fillStyle='#542c29';ctx.strokeStyle='#a46251';ctx.beginPath();ctx.ellipse(0,0,16,12,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#c47861';for(const [dx,dy] of [[-7,-2],[5,-5],[2,5]]){ctx.beginPath();ctx.arc(dx,dy,3,0,Math.PI*2);ctx.fill();}}
    else if(prop.kind==='bed'){ctx.fillStyle='#899b87';ctx.fillRect(-15,-10,30,20);ctx.fillStyle='#d6e1d4';ctx.fillRect(-12,-8,10,16);ctx.fillStyle='#71b87b';ctx.fillRect(3,-4,4,9);ctx.fillRect(0,-1,10,3);}
    else if(prop.kind==='rack'){ctx.fillStyle='#45554a';ctx.fillRect(-15,-12,30,24);ctx.fillStyle='#d4bd81';for(const offset of [-7,0,7]){ctx.fillRect(-11,offset-1,20,2);ctx.fillRect(-4,offset+1,4,3);}}
    else if(prop.kind==='tank'){ctx.fillStyle='#294744';ctx.strokeStyle='#7dc5a5';ctx.beginPath();ctx.roundRect(-12,-14,24,28,5);ctx.fill();ctx.stroke();ctx.fillStyle='#7bc2a477';ctx.beginPath();ctx.ellipse(0,0,6,9,0,0,Math.PI*2);ctx.fill();}
    else if(prop.kind==='crate'||prop.kind==='bench'||prop.kind==='shelf'){ctx.fillStyle=prop.kind==='crate'?'#735b3e':prop.kind==='bench'?'#5c6c58':'#67716a';ctx.fillRect(-14,-11,28,22);ctx.strokeStyle='#c3b48b';ctx.strokeRect(-14,-11,28,22);ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(12,8);ctx.moveTo(12,-8);ctx.lineTo(-12,8);ctx.stroke();}
    else if(prop.kind==='generator'){ctx.fillStyle='#665d3b';ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d3bf6d';ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#e0ca71';ctx.fillRect(-2,-10,4,7);}
    else{ctx.fillStyle='#344943';ctx.fillRect(-15,-11,30,22);ctx.fillStyle=prop.kind==='server'?'#78bea3':'#80b7c9';ctx.fillRect(-11,-7,22,11);ctx.fillStyle='#b7e3c1';ctx.fillRect(-10,7,4,2);ctx.fillRect(-3,7,4,2);}
    ctx.restore();
  }
}
function drawDoors(){
  for(const door of state.world.doors){
    if(!visibleAt(door.approach.x,door.approach.y)&&!visibleAt(door.cx,2*door.cy-door.approach.y)&&!visibleAt(door.cx,door.cy))continue;
    const x=door.x*32-state.camera.x,y=door.y*32-state.camera.y;
    ctx.save();ctx.fillStyle=door.open?'#91bd8d55':'#302e22';ctx.strokeStyle=door.open?'#a4d59a':'#d9bd72';ctx.lineWidth=2;
    if(door.open){for(const offset of [2,54]){ctx.fillRect(x+offset,y+8,8,16);ctx.strokeRect(x+offset,y+8,8,16);}}
    else{ctx.fillRect(x+2,y+8,60,16);ctx.strokeRect(x+2,y+8,60,16);ctx.fillStyle='#e6cf83';ctx.font='bold 8px "IBM Plex Mono"';ctx.textAlign='center';ctx.fillText('CLOSED',x+32,y+19);}
    ctx.restore();
  }
}
function drawVisionFog(sx,sy,ex,ey){
  const t=state.world.tile;for(let y=sy;y<ey;y++)for(let x=sx;x<ex;x++){
    if(state.world.visible.has(`${x},${y}`))continue;
    ctx.fillStyle=floorTile(x,y)?'#090e0bf2':'#0d140edb';ctx.fillRect(x*t-state.camera.x,y*t-state.camera.y,t+.5,t+.5);
  }
}
function render(now){const W=Number(canvas.dataset.cssWidth)||600,H=Number(canvas.dataset.cssHeight)||400;ctx.clearRect(0,0,W,H);ctx.fillStyle=COLORS.floor;ctx.fillRect(0,0,W,H);const t=state.world.tile,sx=Math.floor(state.camera.x/t),sy=Math.floor(state.camera.y/t),ex=Math.ceil((state.camera.x+W)/t)+1,ey=Math.ceil((state.camera.y+H)/t)+1;for(let y=sy;y<ey;y++)for(let x=sx;x<ex;x++){const px=x*t-state.camera.x,py=y*t-state.camera.y;if(!floorTile(x,y)){ctx.fillStyle='#364137';ctx.fillRect(px,py,t,t);ctx.fillStyle='#465248';ctx.fillRect(px,py,t,3);ctx.fillStyle='#303a31';ctx.fillRect(px,py+t-3,t,3);ctx.fillStyle='#63715e2e';ctx.fillRect(px+3,py+4,t-6,t-8);ctx.strokeStyle='#232c25';ctx.strokeRect(px+.5,py+.5,t-1,t-1);}else{const parity=(x*17+y*23)%7;ctx.fillStyle=parity===0?'#222d24':parity===1?'#1e2820':'#202a22';ctx.fillRect(px,py,t,t);ctx.strokeStyle=COLORS.grid;ctx.strokeRect(px+.5,py+.5,t,t);}}
  for(const d of state.decor){if(d.x<state.camera.x-15||d.x>state.camera.x+W+15||d.y<state.camera.y-15||d.y>state.camera.y+H+15)continue;ctx.globalAlpha=d.alpha;ctx.fillStyle=d.kind==='stain'?'#a58e7155':'#aab6a7';ctx.beginPath();ctx.ellipse(d.x-state.camera.x,d.y-state.camera.y,d.r*1.8,d.r,rand(0,3),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;if(state.world.labels){ctx.save();ctx.font='7px "IBM Plex Mono"';ctx.fillStyle='#b0bfa263';ctx.textAlign='center';for(const label of state.world.labels)ctx.fillText(label.text,label.x-state.camera.x,label.y-state.camera.y);ctx.restore();}
  drawRoomProps();
  if(state.mode==='survival'){const e=state.world.exit;ctx.save();ctx.globalAlpha=.44+.16*Math.sin(now/350);ctx.strokeStyle=COLORS.lime;ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x-state.camera.x,e.y-state.camera.y,e.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#c0ef7513';ctx.fill();ctx.restore();const exx=e.x-state.camera.x,exy=e.y-state.camera.y;ctx.fillStyle='#c0ef75';ctx.font='8px "IBM Plex Mono"';ctx.textAlign='center';ctx.fillText('EXTRACTION',exx,exy-39);}
  for(const item of state.loot)drawLoot(item);
  for(const b of state.bullets){const x=b.x-state.camera.x,y=b.y-state.camera.y;ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.shadowColor=b.color;ctx.shadowBlur=9;ctx.strokeStyle=b.color;ctx.lineWidth=b.acid?3:2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(-3,0);ctx.stroke();ctx.fillStyle=b.acid?'#b5f28a':'#fff5d8';ctx.beginPath();ctx.ellipse(0,0,b.acid?3.3:3,b.acid?2.3:1.6,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  for(const e of state.enemies)if(e.alive&&unitVisibleToTeam(e))drawEntity(e,e.type==='monster'?'#cf6350':e.team===state.player.team?COLORS.blue:'#bb7459',now,e.type==='guard'?(e.team===state.player.team?'ALLY GUARD':'GUARD'):e.variant?.toUpperCase()||'');for(const b of state.bots)if(b.alive&&unitVisibleToTeam(b))drawEntity(b,b.team==='blue'?COLORS.blue:COLORS.red,now,b.team===state.player.team?'ALLY':'HOSTILE');if(state.player?.alive)drawEntity(state.player,COLORS.lime,now,'YOU');for(const part of state.particles){const x=part.x-state.camera.x,y=part.y-state.camera.y;ctx.globalAlpha=clamp(part.life/part.max,0,1);ctx.fillStyle=part.color;if(part.grenade){ctx.beginPath();ctx.arc(x,y,part.r,0,Math.PI*2);ctx.fill();}else{ctx.beginPath();ctx.arc(x,y,part.r,0,Math.PI*2);ctx.fill();}}ctx.globalAlpha=1;
  drawVisionFog(sx,sy,ex,ey);drawDoors();
  if(state.visibleMap)drawFullMap(W,H);}
function drawHeldWeapon(id){const w=WEAPONS[id]||WEAPONS[0];ctx.save();ctx.lineCap='round';ctx.lineJoin='round';if(w.kind==='gun'){ctx.fillStyle='#131a16';ctx.strokeStyle='#c8d0c3';ctx.lineWidth=.8;ctx.beginPath();ctx.roundRect(2,-3.7,20,7.4,1);ctx.fill();ctx.stroke();ctx.fillStyle=w.color;if(w.family===0){ctx.fillRect(6,-4,12,2);ctx.fillRect(21,-1.7,7,3.4);ctx.fillStyle='#343c35';ctx.beginPath();ctx.moveTo(11,3);ctx.lineTo(17,3);ctx.lineTo(19,9);ctx.lineTo(14,9);ctx.closePath();ctx.fill();}
    else if(w.family===1){ctx.fillRect(3,-2,5,2);ctx.fillRect(6,-5,14,2);ctx.fillRect(21,-1.6,8,3.2);ctx.fillStyle='#343c35';ctx.fillRect(11,3,4,6);ctx.fillRect(1,1,4,4);if(id===12){ctx.fillStyle=w.color;ctx.beginPath();ctx.arc(15,6,5,0,Math.PI*2);ctx.fill();}}
    else if(w.family===2){ctx.fillRect(4,-3.2,22,1.5);ctx.fillRect(5,.2,22,1.4);ctx.fillRect(26,-1.5,7,3);ctx.fillStyle='#343c35';ctx.fillRect(8,-6,5,3);ctx.fillRect(11,3,5,6);ctx.fillRect(2,1,4,4);if(id===13){ctx.fillStyle=w.color;ctx.fillRect(18,3,5,6);}if(id===14){ctx.fillStyle=w.color;ctx.fillRect(27,-2,8,2);}}
    else{ctx.fillRect(2,-5,6,3);ctx.fillRect(5,-6.5,9,1.5);ctx.fillRect(21,-1.5,11,3);ctx.fillStyle='#343c35';ctx.fillRect(12,3,4,7);ctx.fillRect(1,1,4,4);ctx.fillStyle=w.color;ctx.fillRect(15,-5,3,1.5);if(id===15)ctx.fillRect(31,-1.5,5,3);}}
  else{ctx.strokeStyle=w.color;ctx.fillStyle=w.color;ctx.lineWidth=2.4;ctx.beginPath();if(w.family===4){ctx.moveTo(3,5);ctx.lineTo(22,-5);ctx.stroke();ctx.fillStyle='#515a50';ctx.fillRect(1,4,7,3);}else if(w.family===5){ctx.moveTo(2,5);ctx.lineTo(25,-2);ctx.stroke();ctx.fillStyle=w.color;ctx.fillRect(24,-5,7,5);if(id===16){ctx.beginPath();ctx.moveTo(27,-4);ctx.lineTo(32,-9);ctx.lineTo(34,-7);ctx.stroke();}}else{ctx.moveTo(3,5);ctx.lineTo(22,-2);ctx.stroke();ctx.fillStyle='#d5d0bd';ctx.beginPath();ctx.moveTo(18,-2);ctx.lineTo(24,-11);ctx.lineTo(32,-9);ctx.lineTo(29,1);ctx.closePath();ctx.fill();}}
  ctx.restore();}
function drawEntity(e,color,now,label){const x=e.x-state.camera.x,y=e.y-state.camera.y;ctx.save();if(e.invuln>0&&Math.floor(now/70)%2===0)ctx.globalAlpha=.38;ctx.fillStyle='#080b09aa';ctx.beginPath();ctx.ellipse(x,y+8,e.r*1.18,e.r*.67,0,0,Math.PI*2);ctx.fill();ctx.translate(x,y);ctx.rotate(e.angle||0);if(e.type==='monster'){
    const monsterColor=e.variant==='spitter'?'#719f59':e.variant==='brute'?'#924d43':'#bd6250';ctx.fillStyle=e.hitFlash>0?'#fff0d7':monsterColor;
    if(e.variant==='crawler'){ctx.beginPath();ctx.ellipse(-1,0,10,6,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#633d34';ctx.lineWidth=2;for(const side of [-1,1])for(let n=0;n<3;n++){const yy=(n-1)*3;ctx.beginPath();ctx.moveTo(-4+n*4,yy);ctx.lineTo(-8+n*3,yy+side*8);ctx.lineTo(-10+n*3,yy+side*9);ctx.stroke();}}
    else if(e.variant==='brute'){ctx.beginPath();ctx.ellipse(-1,0,15,13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#683c36';ctx.beginPath();ctx.moveTo(-9,-7);ctx.lineTo(-15,-15);ctx.lineTo(-3,-10);ctx.fill();ctx.beginPath();ctx.moveTo(7,-7);ctx.lineTo(14,-14);ctx.lineTo(11,-4);ctx.fill();ctx.fillStyle='#ecb489';ctx.fillRect(7,-4,4,3);ctx.fillRect(7,2,4,3);}
    else{ctx.beginPath();ctx.ellipse(-2,0,11,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#91d56e';ctx.beginPath();ctx.arc(-6,-8,4,0,Math.PI*2);ctx.arc(1,-10,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#172017';ctx.beginPath();ctx.arc(4,-3,2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#bfce89';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(12,0);ctx.stroke();}}
  else{ctx.fillStyle=e.hitFlash>0?'#fff':color;ctx.beginPath();ctx.ellipse(-1,0,8,10,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e0e8dc88';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#303932';ctx.fillRect(-9,-3,4,8);ctx.fillStyle='#d2c9ae';ctx.beginPath();ctx.arc(3,-5,4.5,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.arc(3,-5,3.2,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle='#3d493e';ctx.fillRect(-7,7,5,3);ctx.fillRect(2,7,5,3);}
  if(e.type==='monster'){ctx.fillStyle=e.variant==='spitter'?'#e7f2b4':'#f6e4c9';ctx.beginPath();ctx.arc(5,-3,1.3,0,Math.PI*2);ctx.arc(5,3,1.3,0,Math.PI*2);ctx.fill();}
  else{const selected=e.inventory?.[e.active],weaponId=typeof selected==='number'?selected:0,active=WEAPONS[weaponId];
    if(active.kind==='melee'&&e.swingUntil>now){
      const progress=clamp((now-e.swingStarted)/MELEE_SWING_MS,0,1),sweep=-1.3+progress*2.6;
      ctx.save();ctx.strokeStyle=active.color;ctx.lineWidth=4;ctx.globalAlpha*=.85;ctx.shadowColor=active.color;ctx.shadowBlur=10;
      ctx.beginPath();ctx.arc(4,0,Math.min(active.range*.55,42),sweep-.38,sweep+.24);ctx.stroke();ctx.restore();
      ctx.save();ctx.translate(3,0);ctx.rotate(sweep);drawHeldWeapon(weaponId);ctx.restore();
    }else drawHeldWeapon(weaponId);
    if(active.kind==='gun'&&e===state.player&&state.reloadUntil>now){ctx.fillStyle='#f2d27e';ctx.fillRect(6,4,4,3);}}
  if(e.invuln>0){ctx.strokeStyle='#e9f0d4aa';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,e.r+3,0,Math.PI*2);ctx.stroke();}ctx.restore();
  if(e.hp<e.maxHp){ctx.fillStyle='#161d18';ctx.fillRect(x-13,y-e.r-9,26,3);ctx.fillStyle=e.team==='blue'?COLORS.blue:color;ctx.fillRect(x-13,y-e.r-9,26*clamp(e.hp/e.maxHp,0,1),3);}if(label){ctx.textAlign='center';ctx.font='7px "IBM Plex Mono"';ctx.fillStyle=e.type==='monster'&&e.variant==='spitter'?'#a9d982':color;ctx.fillText(label,x,y-e.r-13);}}
function drawLoot(item){const x=item.x-state.camera.x,y=item.y-state.camera.y+Math.sin(item.bob||0)*1.5;if(x<-30||x>Number(canvas.dataset.cssWidth)+30||y<-30||y>Number(canvas.dataset.cssHeight)+30)return;ctx.save();ctx.translate(x,y);ctx.fillStyle='#06090799';ctx.beginPath();ctx.ellipse(0,9,14,7,0,0,Math.PI*2);ctx.fill();if(item.type==='weapon'){ctx.rotate(-.22);drawHeldWeapon(item.weapon);}
  else if(item.type==='health'){ctx.fillStyle='#d8e4d1';ctx.strokeStyle='#8fd17e';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(-11,-9,22,19,3);ctx.fill();ctx.stroke();ctx.fillStyle='#4eaa61';ctx.fillRect(-2.5,-6,5,13);ctx.fillRect(-7,-2,14,5);ctx.fillStyle='#f6fff0';ctx.fillRect(6,-6,2,3);}
  else if(item.type==='armor'){ctx.fillStyle='#28465a';ctx.strokeStyle='#83c0e6';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-9,-8);ctx.lineTo(-3,-11);ctx.lineTo(0,-8);ctx.lineTo(4,-11);ctx.lineTo(10,-8);ctx.lineTo(8,5);ctx.lineTo(0,11);ctx.lineTo(-8,5);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#acd7ee';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(0,7);ctx.stroke();}
  else if(item.type==='grenade'){ctx.fillStyle='#435243';ctx.strokeStyle='#c6d09e';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(0,1,7,9,.1,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#89966d';ctx.fillRect(-3,-11,6,3);ctx.strokeStyle='#d4d9b0';ctx.beginPath();ctx.arc(3,-11,4,-.8,.7);ctx.stroke();ctx.fillStyle='#a7b587';ctx.fillRect(-2,-5,4,4);}
  else{ctx.fillStyle='#5a4b2b';ctx.strokeStyle='#e5c767';ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(-10,-9,20,18,2);ctx.fill();ctx.stroke();for(let i=-1;i<=1;i++){ctx.fillStyle='#e8cc77';ctx.beginPath();ctx.moveTo(i*5-2,-6);ctx.lineTo(i*5,-9);ctx.lineTo(i*5+2,-6);ctx.lineTo(i*5+2,5);ctx.lineTo(i*5-2,5);ctx.closePath();ctx.fill();}}
  ctx.restore();if(dist(item,state.player)<230){ctx.font='7px "IBM Plex Mono"';ctx.textAlign='center';ctx.fillStyle=item.color;ctx.fillText(item.label,x,y+24);}}
function visibleAt(x,y){return state.world.visible.has(`${Math.floor(x/32)},${Math.floor(y/32)}`);}
function unitVisibleToTeam(unit){return unit===state.player||visibleAt(unit.x,unit.y);}
function enemySpawnZone(){return state.world.spawnZones[state.player.team==='blue'?1:0];}
function drawMinimap(){
  const W=minimap.width,H=minimap.height,w=state.world.w,h=state.world.h,tw=W/w,th=H/h; mctx.clearRect(0,0,W,H);mctx.fillStyle='#101612';mctx.fillRect(0,0,W,H);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const key=`${x},${y}`,px=x*tw,py=y*th;if(!floorTile(x,y)){mctx.fillStyle='#465346';mctx.fillRect(px,py,tw+.4,th+.4);}else if(state.world.explored.has(key)){mctx.fillStyle=state.world.visible.has(key)?'#526b4d':'#202a22';mctx.fillRect(px,py,tw+.4,th+.4);}}
  for(const door of state.world.doors)if(visibleAt(door.approach.x,door.approach.y)||state.world.explored.has(`${Math.floor(door.approach.x/32)},${Math.floor(door.approach.y/32)}`)){mctx.fillStyle=door.open?'#91bd8d':'#e2bf6d';mctx.fillRect(door.x*tw,door.y*th,Math.max(2,tw*2),Math.max(2,th));}
  if(state.mode==='pvp'){const zone=enemySpawnZone(),x=zone.x/32*tw,y=zone.y/32*th;mctx.fillStyle='#f2745e88';mctx.fillRect(x-7,y-7,14,14);mctx.strokeStyle='#ff493d';mctx.lineWidth=2;mctx.strokeRect(x-7,y-7,14,14);}
  const p=state.player;if(state.mode==='survival'&&state.world.explored.has(`${Math.floor(state.world.exit.x/32)},${Math.floor(state.world.exit.y/32)}`)){mctx.fillStyle=COLORS.lime;mctx.beginPath();mctx.arc(state.world.exit.x/32*tw,state.world.exit.y/32*th,3,0,Math.PI*2);mctx.fill();}
  const units=state.mode==='pvp'?state.bots:state.enemies;for(const unit of units)if(unit.alive&&visibleAt(unit.x,unit.y)){mctx.fillStyle=unit.team===p.team?COLORS.lime:COLORS.red;mctx.fillRect(unit.x/32*tw-1.5,unit.y/32*th-1.5,3,3);}
  mctx.fillStyle=COLORS.lime;mctx.beginPath();mctx.arc(p.x/32*tw,p.y/32*th,3,0,Math.PI*2);mctx.fill();mctx.strokeStyle='#bbc7ae77';mctx.lineWidth=1;mctx.strokeRect(state.camera.x/(w*32)*W,state.camera.y/(h*32)*H,(Number(canvas.dataset.cssWidth)||600)/(w*32)*W,(Number(canvas.dataset.cssHeight)||400)/(h*32)*H);
}
function drawFullMap(W,H){
  ctx.save();ctx.fillStyle='#090d0bf7';ctx.fillRect(0,0,W,H);const pad=24,scale=Math.min((W-pad*2)/(state.world.w*32),(H-pad*2)/(state.world.h*32)),mw=state.world.w*32*scale,mh=state.world.h*32*scale,ox=(W-mw)/2,oy=(H-mh)/2;
  for(let y=0;y<state.world.h;y++)for(let x=0;x<state.world.w;x++){const key=`${x},${y}`,px=ox+x*32*scale,py=oy+y*32*scale;if(!floorTile(x,y)){ctx.fillStyle='#465346';ctx.fillRect(px,py,32*scale+.5,32*scale+.5);}else if(state.world.explored.has(key)){ctx.fillStyle=state.world.visible.has(key)?'#526b4d':'#202a22';ctx.fillRect(px,py,32*scale+.5,32*scale+.5);}}
  for(const door of state.world.doors)if(visibleAt(door.approach.x,door.approach.y)||state.world.explored.has(`${Math.floor(door.approach.x/32)},${Math.floor(door.approach.y/32)}`)){ctx.fillStyle=door.open?'#91bd8d':'#e2bf6d';ctx.fillRect(ox+door.x*32*scale,oy+door.y*32*scale,Math.max(2,64*scale),Math.max(2,32*scale));}
  if(state.mode==='pvp'){const zone=enemySpawnZone(),x=ox+zone.x*scale,y=oy+zone.y*scale;ctx.fillStyle='#f2745e88';ctx.fillRect(x-9,y-9,18,18);ctx.strokeStyle='#ff493d';ctx.lineWidth=2;ctx.strokeRect(x-9,y-9,18,18);}
  ctx.save();ctx.font=`${Math.max(5,Math.min(8,scale*48))}px "IBM Plex Mono"`;ctx.textAlign='center';ctx.fillStyle='#d5dec588';for(const label of state.world.labels||[])if(state.world.explored.has(`${Math.floor(label.x/32)},${Math.floor(label.y/32)}`))ctx.fillText(label.text,ox+label.x*scale,oy+label.y*scale);ctx.restore();
  if(state.mode==='survival'&&state.world.explored.has(`${Math.floor(state.world.exit.x/32)},${Math.floor(state.world.exit.y/32)}`)){ctx.fillStyle=COLORS.lime;ctx.beginPath();ctx.arc(ox+state.world.exit.x*scale,oy+state.world.exit.y*scale,4,0,Math.PI*2);ctx.fill();}
  const units=state.mode==='pvp'?state.bots:state.enemies;for(const unit of units)if(unit.alive&&visibleAt(unit.x,unit.y)){ctx.fillStyle=unit.team===state.player.team?COLORS.lime:COLORS.red;ctx.beginPath();ctx.arc(ox+unit.x*scale,oy+unit.y*scale,3,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#f0f4e8';ctx.beginPath();ctx.arc(ox+state.player.x*scale,oy+state.player.y*scale,4,0,Math.PI*2);ctx.fill();ctx.font='8px "IBM Plex Mono"';ctx.textAlign='left';ctx.fillStyle='#c0ef75';ctx.fillText(state.mode==='survival'?'FACILITY 07-C · EXPLORED AREAS':'ARENA A-01 · TEAM VISION',ox,oy-9);ctx.restore();
}

function onKeyDown(e){const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();if(key==='escape'||key==='p'){togglePause();return;}if(key==='m'&&state.running){state.visibleMap=!state.visibleMap;$('#map-status').textContent=state.visibleMap?'— FULL MAP':state.mode==='pvp'?'— TEAM VISION':'— EXPLORE';return;}if(key==='e'){if(!e.repeat)interact();return;}if(key==='g'){useGrenade();return;}if(key==='r'){reloadWeapon();return;}if(key>='1'&&key<='4'){equip(Number(key)-1);return;}state.keys.add(key);}
function onKeyUp(e){state.keys.delete(e.key.toLowerCase());}
function pointerPosition(e){const r=canvas.getBoundingClientRect();state.mouse.x=e.clientX-r.left;state.mouse.y=e.clientY-r.top;}
$('#select-survival').addEventListener('click',()=>openSetup('survival'));$('#select-pvp').addEventListener('click',()=>openSetup('pvp'));$('#setup-back').addEventListener('click',showMenu);$('#back-menu').addEventListener('click',showMenu);$('#start-button').addEventListener('click',startGame);$('#pause-button').addEventListener('click',togglePause);$('#resume-button').addEventListener('click',togglePause);$('#pause-quit').addEventListener('click',showMenu);$('#restart-button').addEventListener('click',()=>openSetup(state.mode));$('#end-menu').addEventListener('click',showMenu);$('#map-toggle').addEventListener('click',()=>{state.visibleMap=!state.visibleMap;$('#map-status').textContent=state.visibleMap?'— FULL MAP':state.mode==='pvp'?'— TEAM VISION':'— EXPLORE';});
canvas.addEventListener('pointermove',pointerPosition);canvas.addEventListener('pointerdown',e=>{if(e.button===0){pointerPosition(e);state.mouse.down=true;canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointerup',()=>state.mouse.down=false);canvas.addEventListener('pointercancel',()=>state.mouse.down=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',()=>{state.keys.clear();state.mouse.down=false;});window.addEventListener('resize',resizeCanvas);
// Touch movement uses a compact relative joystick when available.
const joystick=$('#joystick');let touchOrigin=null;joystick?.addEventListener('pointerdown',e=>{touchOrigin={x:e.clientX,y:e.clientY};joystick.setPointerCapture(e.pointerId);});joystick?.addEventListener('pointermove',e=>{if(!touchOrigin)return;const dx=clamp(e.clientX-touchOrigin.x,-35,35),dy=clamp(e.clientY-touchOrigin.y,-35,35);for(const k of ['w','a','s','d'])state.keys.delete(k);if(dy<-7)state.keys.add('w');if(dy>7)state.keys.add('s');if(dx<-7)state.keys.add('a');if(dx>7)state.keys.add('d');const thumb=joystick.querySelector('span');thumb.style.transform=`translate(${dx}px,${dy}px)`;});joystick?.addEventListener('pointerup',()=>{touchOrigin=null;for(const k of ['w','a','s','d'])state.keys.delete(k);joystick.querySelector('span').style.transform=''});$('#mobile-fire')?.addEventListener('pointerdown',()=>{state.touchFire=true;state.mouse.down=true;});$('#mobile-fire')?.addEventListener('pointerup',()=>{state.touchFire=false;state.mouse.down=false;});$('#mobile-fire')?.addEventListener('pointercancel',()=>{state.touchFire=false;state.mouse.down=false;});$('#mobile-interact')?.addEventListener('pointerdown',interact);$('#mobile-grenade')?.addEventListener('pointerdown',useGrenade);
