const $ = (selector) => document.querySelector(selector);
const canvas = $('#world');
const ctx = canvas.getContext('2d');
const minimap = $('#minimap');
const mctx = minimap.getContext('2d');
const menu = $('#menu'), setup = $('#setup'), game = $('#game');
const COLORS = { floor:'#202a22', floor2:'#222d24', wall:'#414d42', wallEdge:'#60705e', grid:'#ffffff07', lime:'#c0ef75', red:'#f2745e', blue:'#72a9ed', pale:'#e8ede7' };
const WEAPONS = [
  {name:'Pistol',kind:'gun',family:0,damage:26,rate:280,magazine:12,speed:520,spread:.025,color:'#eed27a',icon:'pistol'},
  {name:'SMG',kind:'gun',family:1,damage:12,rate:92,magazine:30,speed:600,spread:.1,color:'#eabf72',icon:'smg'},
  {name:'Shotgun',kind:'gun',family:2,damage:13,rate:620,magazine:6,speed:465,spread:.32,pellets:6,color:'#f2a875',icon:'shotgun'},
  {name:'Rifle',kind:'gun',family:3,damage:34,rate:185,magazine:30,speed:760,spread:.03,color:'#d9c786',icon:'rifle'},
  {name:'Knife',kind:'melee',family:4,damage:38,rate:350,ammo:Infinity,max:Infinity,range:58,color:'#c4d0c7',icon:'╱'},
  {name:'Bat',kind:'melee',family:5,damage:55,rate:580,ammo:Infinity,max:Infinity,range:72,color:'#c39165',icon:'╱'},
  {name:'Axe',kind:'melee',family:6,damage:75,rate:770,ammo:Infinity,max:Infinity,range:68,color:'#c2bcaa',icon:'⚒'},
  {name:'Heavy Pistol',kind:'gun',family:0,damage:43,rate:410,magazine:8,speed:610,spread:.018,color:'#ed9c72',icon:'heavy-pistol'},
  {name:'Tactical SMG',kind:'gun',family:1,damage:15,rate:118,magazine:24,speed:680,spread:.055,color:'#87c4a2',icon:'tactical-smg'},
  {name:'Precision Rifle',kind:'gun',family:3,damage:52,rate:480,magazine:8,speed:960,spread:.008,color:'#9cbbdf',icon:'precision-rifle'},
  {name:'Breach Shotgun',kind:'gun',family:2,damage:17,rate:760,magazine:4,speed:510,spread:.28,pellets:8,color:'#e59b8d',icon:'breach-shotgun'},
];
const LOOT_TABLE = [
  {type:'weapon',weapon:1,label:'SMG',color:'#eabf72',weight:1.2},{type:'weapon',weapon:2,label:'SHOTGUN',color:'#f2a875',weight:1.2},{type:'weapon',weapon:3,label:'RIFLE',color:'#d9c786',weight:1.15},
  {type:'weapon',weapon:4,label:'KNIFE',color:'#c4d0c7',weight:.65},{type:'weapon',weapon:5,label:'BAT',color:'#c39165',weight:.6},{type:'weapon',weapon:6,label:'AXE',color:'#c2bcaa',weight:.45},
  {type:'weapon',weapon:7,label:'HEAVY PISTOL · RARE',color:'#ed9c72',weight:.25},{type:'weapon',weapon:8,label:'TACTICAL SMG · RARE',color:'#87c4a2',weight:.23},{type:'weapon',weapon:9,label:'PRECISION RIFLE · RARE',color:'#9cbbdf',weight:.2},{type:'weapon',weapon:10,label:'BREACH SHOTGUN · RARE',color:'#e59b8d',weight:.18},
  {type:'health',label:'MEDKIT',color:'#90d485',weight:13},{type:'armor',label:'ARMOR',color:'#78b5de',weight:10},{type:'grenade',label:'GRENADE',color:'#dd8e68',weight:8},
];
const PLAYER_SIGHT_RANGE = 320;
const LOOT_RESPAWN_SECONDS = 20;
const GRENADE_THROW_DISTANCE = 210;
const MELEE_SWING_MS = 300;
function weightedLoot(){let value=Math.random()*LOOT_TABLE.reduce((sum,item)=>sum+item.weight,0);for(const item of LOOT_TABLE){value-=item.weight;if(value<=0)return item;}return LOOT_TABLE.at(-1);}

const state = {running:false,paused:false,runId:0,mode:'survival',world:null,player:null,bots:[],enemies:[],bullets:[],loot:[],lootRespawns:[],particles:[],decor:[],keys:new Set(),mouse:{x:0,y:0,down:false},touchFire:false,camera:{x:0,y:0},lastTime:0,elapsed:0,fireAt:0,round:1,spawnTimer:0,scoreBlue:0,scoreRed:0,kills:0,found:0,skips:0,teamSize:5,feed:[],visibleMap:false,roundEnd:false,botFill:true,pendingLoot:null,settings:{team:'blue',target:50}};
let lastNotice=0, audioContext=null;
const rand=(a,b)=>a+Math.random()*(b-a), clamp=(n,a,b)=>Math.max(a,Math.min(b,n)), dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), choice=a=>a[Math.floor(Math.random()*a.length)];

function clearOperationUi(){for(const id of ['pause-overlay','end-overlay','round-banner','notice','inventory-prompt'])$(`#${id}`).classList.add('hidden');game.classList.remove('paused');state.keys.clear();state.mouse.down=false;state.touchFire=false;state.pendingLoot=null;}
function showMenu(){state.running=false;state.paused=false;state.runId++;clearOperationUi();menu.classList.remove('hidden');setup.classList.add('hidden');game.classList.add('hidden');}
function openSetup(mode){state.running=false;state.paused=false;state.runId++;clearOperationUi();state.mode=mode;state.teamSize=5;state.settings={team:'blue',target:50,difficulty:'standard',loadout:'balanced'};menu.classList.add('hidden');game.classList.add('hidden');setup.classList.remove('hidden');$('#setup-title').innerHTML=mode==='survival'?'LAB<br><span>ESCAPE.</span>':'TEAM<br><span>DEATHMATCH.</span>';$('#setup-subtitle').textContent=mode==='survival'?'Explore the facility, gather supplies, and reach extraction.':'Choose a team size and take your squad into the arena.';$('#setup-options').innerHTML=mode==='survival'?`<div class="config-label">FACILITY CONDITIONS</div><div class="choice-row" id="difficulty-row"><button class="choice selected" data-value="standard">STANDARD</button><button class="choice" data-value="survival">HARDCORE</button><button class="choice" data-value="training">TRAINING</button></div><div class="config-label">FIELD KIT</div><div class="choice-row" id="loadout-row"><button class="choice selected" data-value="balanced">BALANCED</button><button class="choice" data-value="assault">ASSAULT</button><button class="choice" data-value="medic">MEDIC</button></div>`:`<div class="config-label">TEAM SIZE · AI FILL ${state.botFill?'ON':'OFF'}</div><div class="choice-row" id="size-row"><button class="choice selected" data-value="5">5 VS 5</button><button class="choice" data-value="10">10 VS 10</button></div><div class="config-label">YOUR TEAM</div><div class="choice-row" id="team-row"><button class="choice selected" data-value="blue">BLUE TEAM</button><button class="choice" data-value="red">RED TEAM</button></div><div class="config-label">MATCH TARGET</div><div class="choice-row" id="target-row"><button class="choice selected" data-value="50">FIRST TO 50</button><button class="choice" data-value="100">FIRST TO 100</button><button class="choice" data-value="250">FIRST TO 250</button></div>`;$('#start-button').innerHTML=`${mode==='survival'?'BEGIN OPERATION':'ENTER ARENA'} <span>→</span>`;setup.querySelectorAll('.choice-row').forEach(row=>row.addEventListener('click',e=>{const b=e.target.closest('.choice');if(!b)return;row.querySelectorAll('.choice').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');if(row.id==='size-row')state.teamSize=Number(b.dataset.value);if(row.id==='team-row')state.settings.team=b.dataset.value;if(row.id==='target-row')state.settings.target=Number(b.dataset.value);if(row.id==='difficulty-row')state.settings.difficulty=b.dataset.value;if(row.id==='loadout-row')state.settings.loadout=b.dataset.value;}));}
function floorTile(x,y){return state.world.map[y]?.[x]===0;}
function generateWorld(mode){
  const w=110,h=83,map=Array.from({length:h},()=>Array(w).fill(1));
  const carve=(x1,y1,x2,y2)=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(x>0&&y>0&&x<w-1&&y<h-1)map[y][x]=0;};
  const names=['WORKSHOP','ARMORY','RESEARCH LAB','SPECIMEN HOLD','MEDICAL','STORAGE','NEST CHAMBER','CONTROL ROOM','SERVER ROOM','POWER STATION'];
  for(let i=names.length-1;i>0;i--){const j=Math.floor(rand(0,i+1));[names[i],names[j]]=[names[j],names[i]];}
  const columns=[14,41,68,95],rows=[14,41,68],rooms=[];
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const index=row*4+col,rw=Math.floor(rand(13,21)),rh=Math.floor(rand(13,19));
    const cx=columns[col]+Math.floor(rand(-3,4)),cy=rows[row]+Math.floor(rand(-3,4));
    const room={x:Math.floor(cx-rw/2),y:Math.floor(cy-rh/2),w:rw,h:rh,name:index===0?'ENTRY BAY':index===11?'EXTRACTION BAY':names[index-1]};
    rooms.push(room);carve(room.x+1,room.y+1,room.x+rw-2,room.y+rh-2);
  }
  const candidates=[];for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const a=row*4+col;if(col<3)candidates.push([a,a+1]);if(row<2)candidates.push([a,a+4]);
  }
  const degree=Array(rooms.length).fill(0),links=[];
  for(let attempt=0;attempt<100;attempt++){
    const parent=rooms.map((_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
    const shuffled=[...candidates];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(rand(0,i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    degree.fill(0);links.length=0;
    for(const [a,b] of shuffled){const rootA=find(a),rootB=find(b);if(rootA===rootB||degree[a]>=3||degree[b]>=3)continue;links.push([a,b]);degree[a]++;degree[b]++;parent[rootA]=rootB;}
    if(links.length===rooms.length-1)break;
  }
  if(links.length!==rooms.length-1){degree.fill(0);links.length=0;for(let row=0;row<3;row++)for(let col=0;col<3;col++)links.push([row*4+col,row*4+col+1]);links.push([3,7],[4,8]);for(const [a,b] of links){degree[a]++;degree[b]++;}}
  const extras=candidates.filter(([a,b])=>!links.some(([x,y])=>x===a&&y===b));
  for(let i=extras.length-1;i>0;i--){const j=Math.floor(rand(0,i+1));[extras[i],extras[j]]=[extras[j],extras[i]];}
  let added=0,extraTarget=Math.floor(rand(1,4));for(const [a,b] of extras)if(added<extraTarget&&degree[a]<3&&degree[b]<3){const leaves=degree.filter(count=>count===1).length,closedEnds=Number(degree[a]===1)+Number(degree[b]===1);if(leaves-closedEnds<1)continue;links.push([a,b]);degree[a]++;degree[b]++;added++;}
  for(const [a,b] of links){const first=rooms[a],second=rooms[b];if(Math.floor(a/4)===Math.floor(b/4)){
    const low=Math.max(first.y+2,second.y+2),high=Math.min(first.y+first.h-4,second.y+second.h-4);
    const door=clamp(Math.floor((low+high)/2+rand(-2,3)),low,high);carve(first.x+first.w-2,door,second.x+1,door+1);
  }else{
    const low=Math.max(first.x+2,second.x+2),high=Math.min(first.x+first.w-4,second.x+second.w-4);
    const door=clamp(Math.floor((low+high)/2+rand(-2,3)),low,high);carve(door,first.y+first.h-2,door+1,second.y+1);
  }}
  for(const room of rooms)if(Math.random()<.68){for(let attempt=0;attempt<8;attempt++){
    const x=Math.floor(rand(room.x+3,room.x+room.w-4)),y=Math.floor(rand(room.y+3,room.y+room.h-4));
    if(Math.hypot(x-(room.x+room.w/2),y-(room.y+room.h/2))<4)continue;
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++)map[y+oy][x+ox]=1;break;
  }}
  const center=room=>({x:(room.x+Math.floor(room.w/2)+.5)*32,y:(room.y+Math.floor(room.h/2)+.5)*32});
  const start=center(rooms[0]),end=center(rooms[11]);
  state.world={w,h,map,tile:32,mode,rooms,exit:{...end,r:39},spawnZones:[start,end],explored:new Set(),visible:new Set(),visionAt:0,labels:rooms.map(room=>({...center(room),text:room.name}))};
  state.decor=[];for(let i=0;i<420;i++){const x=rand(2,w-2),y=rand(2,h-2);if(floorTile(Math.floor(x),Math.floor(y)))state.decor.push({x:(x+.5)*32,y:(y+.5)*32,r:rand(1,4),alpha:rand(.04,.15),kind:Math.random()>.5?'stain':'debris'});}
}
function findOpen(nearX=31,nearY=24,minDistance=0,maxDistance=Infinity){for(let i=0;i<900;i++){const tx=Math.floor(rand(1,state.world.w-1)),ty=Math.floor(rand(1,state.world.h-1)),p={x:(tx+.5)*32,y:(ty+.5)*32},d=Math.hypot(tx-nearX,ty-nearY);if(floorTile(tx,ty)&&d>=minDistance&&d<=maxDistance&&!blocked(p.x,p.y,9)&&!occupied(p,18))return p;}let fallback=null,best=Infinity;for(let y=1;y<state.world.h-1;y++)for(let x=1;x<state.world.w-1;x++){const p={x:(x+.5)*32,y:(y+.5)*32},d=(x+.5-nearX)**2+(y+.5-nearY)**2;if(d<best&&floorTile(x,y)&&!blocked(p.x,p.y,9)&&!occupied(p,18)){fallback=p;best=d;}}return fallback||{x:(nearX+.5)*32,y:(nearY+.5)*32};}
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
function dropPlayerLoadout(){const p=state.player;let retainedPistol=false;for(let i=0;i<p.inventory.length;i++){const slot=p.inventory[i];if(slot===0&&!retainedPistol){retainedPistol=true;continue;}if(slot!=null)state.loot.push(dropInventorySlot(slot,p,i*2));}p.inventory=[0,null,null,null];p.active=0;p.ammo[0]=WEAPONS[0].magazine;p.reloadUntil=0;p.reloadingWeapon=null;renderWeapons();$('#grenade-count').textContent='0';}
function dropBotLoadout(bot){
  for(let i=0;i<bot.inventory.length;i++)if(bot.pickedSlots?.[i]&&bot.inventory[i]!=null)state.loot.push(dropInventorySlot(bot.inventory[i],bot,i*2));
  if(bot.pickedArmor&&bot.armor>0)state.loot.push(dropInventorySlot({item:'armor'},bot,9));
  bot.inventory=[0,1,null,null];bot.pickedSlots=[false,false,false,false];bot.pickedArmor=false;bot.active=0;
}
function equip(index){const p=state.player;if(index<0||index>3||!p)return;if(state.pendingLoot){const item=state.pendingLoot;if(!state.loot.includes(item)){state.pendingLoot=null;$('#inventory-prompt').classList.add('hidden');announce('PICKUP NO LONGER AVAILABLE');renderWeapons();return;}const old=p.inventory[index],replacement=item.type==='weapon'?item.weapon:{item:item.type==='health'?'health':item.type,count:item.count||1};if(old!=null)state.loot.push(dropInventorySlot(old));p.inventory[index]=replacement;if(typeof replacement==='number')p.ammo[replacement]=WEAPONS[replacement].magazine;takeLoot(item);state.pendingLoot=null;$('#inventory-prompt').classList.add('hidden');state.found++;$('#loot-count').textContent=String(state.found);const label=item.type==='weapon'?WEAPONS[item.weapon].name:inventoryItemLabel(replacement);log(`${label} assigned to slot ${index+1}.`,'good');announce(`${label.toUpperCase()} COLLECTED`);p.active=index;renderWeapons();$('#grenade-count').textContent=String(inventoryGrenades());return;}if(p.inventory[index]==null)return;p.active=index;renderWeapons();}

const weaponShapes=[
  '<path d="M4 10h17l5 2v5H9L6 15H4z"/><path d="M13 16h5l2 6h-5z"/>',
  '<path d="M2 8h25l6 3v5H9l-4-2H2z"/><path d="M13 16h5l2 6h-5z"/><path d="M4 8V5h7v3"/>',
  '<path d="M1 9h31v5H8l-4-2H1z"/><path d="M3 9V6h7v3"/><path d="M14 14h5l2 8h-5z"/><path d="M25 8h7v2h-7z"/>',
  '<path d="M1 9h29l5 2v4H9l-4-2H1z"/><path d="M13 15h6l2 7h-5z"/><path d="M4 9V6h8v3M24 8h7v2h-7z"/>',
  '<path d="M4 15 25 5l2 2-17 13-4-2z"/><path d="m4 16-2 4 5 2 3-3z"/>',
  '<path d="m5 16 24-7 1 3-22 9-5-2z"/><path d="m27 8 4-2-1 7-4-1z"/>',
  '<path d="m5 17 16-6 1 3-16 7z"/><path d="M17 6h13v9H20z"/><path d="m19 9-4 5 5 1 2-4z"/>',
];
function weaponIcon(id){const weapon=WEAPONS[id];return `<svg viewBox="0 0 36 26" aria-hidden="true" class="weapon-svg ${weapon.kind}"><g fill="${weapon.color}" stroke="#172019" stroke-width=".7" stroke-linejoin="round">${weaponShapes[weapon.family]}</g></svg>`;}
function buildPlayer(){const p={x:8.5*32,y:23.5*32,r:11,speed:176,hp:100,maxHp:100,armor:0,inventory:[0,{item:'grenade',count:1},null,null],active:0,ammo:Object.fromEntries(WEAPONS.map((w,i)=>[i,w.magazine||0])),team:state.settings.team||'blue',alive:true,angle:0,stun:0,invuln:0,hitFlash:0,fireTime:0,reloadUntil:0,respawn:0,ai:false,kills:0};if(state.settings.loadout==='assault'){p.inventory=[3,1,0,{item:'grenade',count:1}];p.active=0;}if(state.settings.loadout==='medic'){p.hp=125;p.maxHp=125;p.inventory=[0,4,{item:'health',count:2},{item:'grenade',count:1}];}if(state.mode==='pvp'){p.armor=35;p.inventory=[0,null,null,null];p.active=0;}return p;}
function spawnLoot(count){
  const start=state.world.spawnZones[0],near=(dx,dy)=>({x:start.x+dx*32,y:start.y+dy*32});
  state.loot=state.mode==='survival'?[{...near(2,-1),type:'health',label:'MEDKIT',color:'#90d485',r:10,bob:0,id:'medkit'},{...near(-2,1),type:'armor',label:'ARMOR',color:'#78b5de',r:10,bob:0,id:'armor'},{...near(3,2),type:'grenade',label:'GRENADE',color:'#dd8e68',r:10,bob:0,id:'grenade'}]:[];
  if(state.mode==='pvp')for(let team=0;team<2&&state.loot.length<count;team++){
    const zone=state.world.spawnZones[team],spot=findOpen(zone.x/32,zone.y/32,4,7),weapon=choice([4,5,6]),spec=WEAPONS[weapon];
    state.loot.push({...spot,type:'weapon',weapon,label:spec.name.toUpperCase(),color:spec.color,r:10,bob:rand(0,Math.PI*2),id:team});
  }
  for(let i=state.loot.length;i<count;i++){
    const spot=findOpen(),item=weightedLoot();state.loot.push({...spot,...item,r:10,bob:rand(0,Math.PI*2),id:i});
  }
  state.loot.forEach((item,index)=>item.spawnId=index);
}
function takeLoot(item){if(!state.loot.includes(item))return false;state.loot=state.loot.filter(loot=>loot!==item);if(item.spawnId!=null)state.lootRespawns.push({item:{...item,bob:0},at:state.elapsed+LOOT_RESPAWN_SECONDS});return true;}
function respawnLoot(){for(let i=state.lootRespawns.length-1;i>=0;i--){const entry=state.lootRespawns[i];if(state.elapsed<entry.at)continue;if(occupied(entry.item,12)){entry.at=state.elapsed+2;continue;}state.loot.push({...entry.item,bob:rand(0,Math.PI*2)});state.lootRespawns.splice(i,1);}}
function startGame(){clearOperationUi();state.runId++;setup.classList.add('hidden');menu.classList.add('hidden');game.classList.remove('hidden');state.elapsed=0;state.kills=0;state.found=0;state.feed=[];state.visibleMap=false;state.bullets=[];state.lootRespawns=[];state.particles=[];state.round=1;state.roundEnd=false;state.scoreBlue=0;state.scoreRed=0;state.player=null;generateWorld(state.mode);state.player=buildPlayer();state.bots=[];state.enemies=[];state.spawnTimer=0;
  if(state.mode==='survival'){state.player.x=state.world.spawnZones[0].x;state.player.y=state.world.spawnZones[0].y;state.player.invuln=2.5;if(state.settings.difficulty==='training'){state.player.hp=state.player.maxHp=150;state.player.armor=20;}else if(state.settings.difficulty==='survival'){state.player.hp=state.player.maxHp=80;}spawnLoot(22);spawnEnemy('guard');const threatTotal=state.settings.difficulty==='training'?3:state.settings.difficulty==='survival'?7:5;for(let i=0;i<threatTotal;i++)spawnEnemy('monster');$('#mode-label').textContent='LAB ESCAPE';$('#objective-label').textContent='REACH EXTRACTION';$('#objective-detail').textContent='Explore the lab';$('#objective-detail').classList.remove('blue-text');$('#score-panel').classList.add('hidden');$('#map-status').textContent='— EXPLORE';log('You entered Facility 07-C. Find a way out.','good');log('Supplies are marked by their silhouettes. Press E to collect.','good');}
  else {spawnLoot(18);const playerColor=state.settings.team==='blue'?'blue':'red',enemyColor=playerColor==='blue'?'red':'blue';state.player.team=playerColor;state.player.x=state.world.spawnZones[playerColor==='blue'?0:1].x;state.player.y=state.world.spawnZones[playerColor==='blue'?0:1].y;for(let i=0;i<state.teamSize-1;i++)spawnBot(playerColor,i);for(let i=0;i<state.teamSize;i++)spawnBot(enemyColor,i);$('#mode-label').textContent=`TEAM DEATHMATCH · ${state.teamSize}V${state.teamSize}`;$('#objective-label').textContent=`FIRST TEAM TO ${state.settings.target} WINS`;$('#objective-detail').textContent=`Win ${state.settings.target} eliminations`;$('#score-target').textContent=`FIRST TO ${state.settings.target}`;$('#score-panel').classList.remove('hidden');$('#teams-line').textContent=`${state.teamSize}V${state.teamSize} · BOTS ACTIVE`;$('#map-status').textContent='— TEAM VISION';log(`${state.teamSize}v${state.teamSize} match active. AI squads deployed.`,'good');log('Collect gear, then fight for your team.');}
  $('#threat-count').textContent=state.mode==='survival'?String(state.enemies.filter(e=>e.alive&&e.type==='monster').length):String(state.bots.length+1);$('#kill-count').textContent='0';$('#loot-count').textContent='0';$('#grenade-count').textContent=String(inventoryGrenades());$('#blue-score').textContent='0';$('#red-score').textContent='0';$('#health-value').textContent=String(state.player.hp);$('#health-bar').style.width='100%';$('#armor-value').textContent=`+ ${state.player.armor} ARM`;$('#armor-bar').style.width=`${state.player.armor}%`;renderWeapons();$('#event-log').innerHTML='';updateHUD();state.running=true;state.paused=false;state.lastTime=performance.now();resizeCanvas();const runId=state.runId;requestAnimationFrame(now=>frame(now,runId));}
function spawnBot(team,i){const zone=state.world.spawnZones[team==='blue'?0:1],pos=findOpen(zone.x/32,zone.y/32,0,7);const b={...pos,team,ai:true,alive:true,r:10,hp:100,maxHp:100,speed:rand(85,115),inventory:[0,1,null,null],pickedSlots:[false,false,false,false],pickedArmor:false,active:Math.random()<.5?0:1,ammo:{1:30},angle:0,fireTime:rand(0,500),stun:0,invuln:0,respawn:0,id:`${team}${i}`,kills:0,target:null,think:rand(0,1)};state.bots.push(b);}
function spawnEnemy(type='monster'){const origin=state.player||{x:40*32,y:32*32},pos=findOpen(origin.x/32,origin.y/32,type==='guard'?5:15,40),hard=state.settings.difficulty==='survival',training=state.settings.difficulty==='training',variant=type==='guard'?null:choice(['crawler','crawler','brute','spitter']);const specs=type==='guard'?{r:10,hp:76,speed:72,damage:10}:{crawler:{r:9,hp:40,speed:126,damage:7},brute:{r:16,hp:142,speed:48,damage:17},spitter:{r:12,hp:64,speed:83,damage:9}}[variant];const e={...pos,type,variant,alive:true,r:specs.r,hp:specs.hp*(hard?1.2:1),maxHp:specs.hp*(hard?1.2:1),speed:specs.speed*(training?.8:hard?1.1:1),damage:specs.damage*(training?.55:hard?1.4:1),angle:0,fireTime:rand(200,900),stun:0,invuln:0,hitFlash:0,think:0,target:null,pathPoint:null,id:Math.random(),team:type==='guard'?(state.player?.team||'blue'):null};state.enemies.push(e);}
function renderWeapons(){const p=state.player;if(!p)return;const el=$('#weapon-list');el.innerHTML='';for(let i=0;i<4;i++){const slot=p.inventory[i],isItem=slot!==null&&typeof slot==='object',id=typeof slot==='number'?slot:null,w=id===null?null:WEAPONS[id],b=document.createElement('button');b.className=`weapon-slot ${i===p.active?'active':''} ${state.pendingLoot?'replace-target':''}`;b.dataset.slot=i;b.setAttribute('aria-label',w?`Slot ${i+1}, ${w.name}${w.kind==='gun'?`, ${p.ammo[id]||0} rounds loaded, infinite reserve`:''}`:isItem?`Slot ${i+1}, ${inventoryItemLabel(slot)}, count ${slot.count}, press fire to use`:`Slot ${i+1}, empty`);const name=w?w.name.toUpperCase():isItem?`${inventoryItemLabel(slot)} ×${slot.count}`:'EMPTY SLOT',detail=w?(w.kind==='gun'?w.name==='Shotgun'||w.name==='Breach Shotgun'?'PUMP SHOTGUN':'FIREARM':`MELEE · ${w.name.toUpperCase()}`):isItem?slot.item==='health'?'SPACE · HEAL':'SPACE / G · THROW':'COLLECT A WEAPON';b.innerHTML=`<span class="weapon-key"><b>${i+1}</b></span><span class="slot-icon">${w?weaponIcon(id):isItem?inventoryItemIcon(slot):'<span class="empty-icon">＋</span>'}</span><span class="slot-details"><b class="weapon-name">${name}</b><small>${detail}</small></span><span class="weapon-ammo">${w?.kind==='gun'?`<b>${p.ammo[id]??w.magazine}</b><small> / ∞</small>`:isItem?`<b>×${slot.count}</b>`:w?'∞':'—'}</span>`;b.addEventListener('click',()=>equip(i));el.appendChild(b);}$('#reload-status').textContent=p.reloadUntil>performance.now()?'RELOADING…':'R RELOAD · ∞ RESERVE';}
function log(text,tone=''){const item=document.createElement('div');item.className=`log-entry ${tone}`;item.innerHTML='<i></i><span></span>';item.lastElementChild.textContent=text;const logEl=$('#event-log');logEl.prepend(item);while(logEl.children.length>6)logEl.lastElementChild.remove();}
function announce(text){const el=$('#notice');el.textContent=text;el.classList.remove('hidden');lastNotice=performance.now();}
function setBanner(text){const el=$('#round-banner'),runId=state.runId;el.textContent=text;el.classList.remove('hidden');setTimeout(()=>{if(runId===state.runId)el.classList.add('hidden');},2400);}
function sound(freq=180,type='square',duration=.045,volume=.025){try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch{}}

function resizeCanvas(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);canvas.dataset.cssWidth=rect.width;canvas.dataset.cssHeight=rect.height;}
function frame(now,runId){if(!state.running||runId!==state.runId)return;requestAnimationFrame(next=>frame(next,runId));if(state.paused)return;const dt=Math.min((now-state.lastTime)/1000,.045);state.lastTime=now;state.elapsed+=dt;update(dt,now);render(now);updateHUD();drawMinimap();if(!$('#notice').classList.contains('hidden')&&now-lastNotice>1600)$('#notice').classList.add('hidden');}
function update(dt,now){const p=state.player;if(!p)return;const cx=Number(canvas.dataset.cssWidth)||600,cy=Number(canvas.dataset.cssHeight)||400;state.camera.x=clamp(p.x-cx/2,0,state.world.w*32-cx);state.camera.y=clamp(p.y-cy/2,0,state.world.h*32-cy);updateVision(now);const pointer=state.mouse;const sx=pointer.x+state.camera.x,sy=pointer.y+state.camera.y;if(state.touchFire){const targets=state.mode==='pvp'?state.bots.filter(b=>b.alive&&b.team!==p.team):state.enemies.filter(e=>e.alive);const target=targets.sort((a,b)=>dist(p,a)-dist(p,b))[0];if(target)p.angle=Math.atan2(target.y-p.y,target.x-p.x);}else p.angle=Math.atan2(sy-p.y,sx-p.x);if(p.invuln>0)p.invuln=Math.max(0,p.invuln-dt);if(p.hitFlash>0)p.hitFlash=Math.max(0,p.hitFlash-dt);if(p.reloadUntil>0&&now>=p.reloadUntil){const id=p.reloadingWeapon,w=WEAPONS[id];if(w?.kind==='gun')p.ammo[id]=w.magazine;p.reloadUntil=0;p.reloadingWeapon=null;log(`${w?.name||'Weapon'} reloaded.`,'good');renderWeapons();}if(p.stun>0)p.stun-=dt;
  let mx=(state.keys.has('d')||state.keys.has('arrowright')?1:0)-(state.keys.has('a')||state.keys.has('arrowleft')?1:0);let my=(state.keys.has('s')||state.keys.has('arrowdown')?1:0)-(state.keys.has('w')||state.keys.has('arrowup')?1:0);const mag=Math.hypot(mx,my);if(p.alive&&mag){mx/=mag;my/=mag;move(p,mx*p.speed*dt,my*p.speed*dt);}
  if(p.alive&&(pointer.down||state.keys.has(' '))&&now>state.fireAt)shoot(p,p.angle,now);for(const bot of state.bots)if(bot.alive)updateBot(bot,dt,now);else{bot.respawn-=dt;if(bot.respawn<=0)respawnBot(bot);}
  for(const e of state.enemies)if(e.alive)updateEnemy(e,dt,now);for(const bullet of state.bullets){bullet.x+=bullet.vx*dt;bullet.y+=bullet.vy*dt;bullet.life-=dt;if(bullet.life<=0||blocked(bullet.x,bullet.y)){bullet.dead=true;continue;}if(state.mode==='pvp'&&bullet.owner?.team){for(const target of [p,...state.bots])if(target!==bullet.owner&&target.alive&&target.team!==bullet.owner.team&&dist(bullet,target)<target.r+2){hit(target,bullet.damage,bullet.owner);bullet.dead=true;break;}}
    else if(state.mode==='survival'&&bullet.owner===p){for(const target of state.enemies)if(target.alive&&target.type==='monster'&&dist(bullet,target)<target.r+2){hit(target,bullet.damage,p);bullet.dead=true;break;}}else if(state.mode==='survival'&&bullet.owner?.type==='guard'){for(const target of state.enemies)if(target.alive&&target.type==='monster'&&dist(bullet,target)<target.r+2){hit(target,bullet.damage,bullet.owner);bullet.dead=true;break;}}else if(state.mode==='survival'&&bullet.owner?.type==='monster'){if(p.alive&&dist(bullet,p)<p.r+2){hit(p,bullet.damage,bullet.owner);bullet.dead=true;}else for(const target of state.enemies)if(target.alive&&target.type==='guard'&&dist(bullet,target)<target.r+2){hit(target,bullet.damage,bullet.owner);bullet.dead=true;break;}}
    else if(bullet.owner===p){for(const target of state.enemies)if(target.alive&&dist(bullet,target)<target.r+2){hit(target,bullet.damage,p);bullet.dead=true;break;}}}
  state.bullets=state.bullets.filter(b=>!b.dead);respawnLoot();for(const l of state.loot)l.bob+=dt*3;for(const part of state.particles){part.x+=part.vx*dt;part.y+=part.vy*dt;part.life-=dt;}state.particles=state.particles.filter(x=>x.life>0);
  if(state.mode==='survival'){state.spawnTimer+=dt;if(state.enemies.filter(e=>e.alive&&e.type==='monster').length<(state.settings.difficulty==='survival'?6:4)&&state.spawnTimer>14){spawnEnemy('monster');state.spawnTimer=0;}if(!p.alive)finish(false,'SIGNAL LOST','You were eliminated inside the facility.');}
  else{state.bots=state.bots.filter(b=>b.alive||b.respawn>0);if(!p.alive){p.respawn-=dt;if(p.respawn<=0)respawnPlayer();}$('#blue-score').textContent=String(state.scoreBlue);$('#red-score').textContent=String(state.scoreRed);if(state.scoreBlue>=state.settings.target)finish(state.player.team==='blue','BLUE TEAM WINS',`Final score ${state.scoreBlue} : ${state.scoreRed}`);else if(state.scoreRed>=state.settings.target)finish(state.player.team==='red','RED TEAM WINS',`Final score ${state.scoreBlue} : ${state.scoreRed}`);}
}
function blocked(x,y,radius=7){const t=state.world.tile,checks=[[x-radius,y-radius],[x+radius,y-radius],[x-radius,y+radius],[x+radius,y+radius]];return checks.some(([cx,cy])=>!floorTile(Math.floor(cx/t),Math.floor(cy/t)));}
function updateVision(now){const world=state.world;if(now-world.visionAt<180)return;world.visionAt=now;world.visible.clear();const p=state.player,observers=p?.alive?[p]:[];if(state.mode==='pvp')observers.push(...state.bots.filter(b=>b.alive&&b.team===p.team));else observers.push(...state.enemies.filter(e=>e.alive&&e.type==='guard'&&e.team===p.team));const radius=state.mode==='pvp'?9:8;for(const actor of observers){const tx=Math.floor(actor.x/32),ty=Math.floor(actor.y/32);for(let y=Math.max(1,ty-radius);y<=Math.min(world.h-2,ty+radius);y++)for(let x=Math.max(1,tx-radius);x<=Math.min(world.w-2,tx+radius);x++){if(Math.hypot(x-tx,y-ty)>radius||!floorTile(x,y))continue;const center={x:(x+.5)*32,y:(y+.5)*32};if(lineClear(actor,center)){const key=`${x},${y}`;world.visible.add(key);world.explored.add(key);}}}}
function move(e,dx,dy){const nx=e.x+dx,ny=e.y+dy,r=Math.max(5,(e.r||10)-1);if(!blocked(nx,e.y,r))e.x=nx;if(!blocked(e.x,ny,r))e.y=ny;}
function reloadWeapon(now=performance.now()){const p=state.player,id=p?.inventory[p.active],w=id==null?null:WEAPONS[id];if(!p||!w||w.kind!=='gun'||(p.ammo[id]??w.magazine)>=w.magazine||p.reloadUntil>now)return;p.reloadingWeapon=id;p.reloadUntil=now+(w.name==='Shotgun'?1050:780);$('#reload-status').textContent='RELOADING…';log(`${w.name} reloading.`);}
function shoot(entity,angle,now){
  const slot=entity.inventory[entity.active];
  if(entity===state.player&&slot&&typeof slot==='object'){
    if(now<entity.fireAt)return;
    if(slot.item==='health'){
      if(entity.hp>=entity.maxHp){announce('HEALTH ALREADY FULL');entity.fireAt=now+300;return;}
      entity.hp=Math.min(entity.maxHp,entity.hp+45);slot.count--;
      if(slot.count<=0)entity.inventory[entity.active]=null;
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
  const n=w.pellets||1;
  for(let i=0;i<n;i++){
    const a=angle+rand(-w.spread,w.spread);
    state.bullets.push({x:entity.x+Math.cos(a)*15,y:entity.y+Math.sin(a)*15,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,owner:entity,damage:w.damage,life:1.3,color:w.color});
  }
  muzzle(entity.x+Math.cos(angle)*16,entity.y+Math.sin(angle)*16,w.color);
  sound(entity===state.player?215:150,'square',.04,entity===state.player?.022:.008);
  if(entity===state.player)renderWeapons();
}
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function hit(target,damage,source){if(!target.alive||target.invuln>0)return;target.hitFlash=.12;let rest=damage;if(target.armor){const absorb=Math.min(target.armor,rest*.64);target.armor-=absorb;rest-=absorb;}target.hp-=rest;burst(target.x,target.y,target.team==='red'||target.type==='monster'?'#f2745e':'#c0ef75',3);if(target.hp<=0){target.hp=0;target.alive=false;burst(target.x,target.y,target.type==='monster'?'#c25e48':target.team==='blue'?'#72a9ed':'#f2745e',15);sound(80,'triangle',.13,.025);if(target===state.player){log('Operator down.','danger');if(state.mode==='pvp'){dropPlayerLoadout();if(source?.team&&source.team!==target.team){if(target.team==='blue')state.scoreRed++;else state.scoreBlue++;}target.respawn=2.1;setBanner('OPERATOR DOWN · RESPAWNING');}return;}if(state.mode==='pvp'&&target.ai){dropBotLoadout(target);target.respawn=2.4;}if(source===state.player){state.kills++;$('#kill-count').textContent=String(state.kills);state.player.kills++;if(state.mode==='pvp'){if(target.team==='blue')state.scoreRed++;else state.scoreBlue++;}const victim=target.type==='monster'?`${target.variant||'monster'} neutralized`:target.team?.toUpperCase()+' unit eliminated';log(`${victim}.`,'good');announce(target.type==='monster'?`${(target.variant||'MONSTER').toUpperCase()} NEUTRALIZED`:'ENEMY ELIMINATED');}else if(state.mode==='pvp'){if(target.team==='blue')state.scoreRed++;else state.scoreBlue++;}}}
function botWeaponScore(id,target,d,clear){const w=WEAPONS[id];if(!w)return-100;if(w.kind==='melee')return clear&&d<145?105+w.damage/10:-35;if(!clear)return 2;let score=35+w.damage/8;if(w.family===2)score+=d<175?40:-25;if(w.family===1)score+=d<300?24:-10;if(w.family===3)score+=d>190?28:-8;if(w.family===0)score+=d>260?8:-3;return score;}
function botWeaponSlot(bot,weaponId){
  const free=bot.inventory.findIndex(value=>value==null);
  if(free>=0)return free;
  const weakest=bot.inventory.map((id,index)=>({id,index,damage:typeof id==='number'?WEAPONS[id].damage:Infinity})).sort((a,b)=>a.damage-b.damage)[0];
  return weakest&&WEAPONS[weaponId].damage>=weakest.damage*1.12?weakest.index:-1;
}
function botCanTakeLoot(bot,item){
  if(item.type==='armor')return (bot.armor||0)<100;
  if(item.type==='weapon')return botWeaponSlot(bot,item.weapon)>=0;
  if(item.type==='health'||item.type==='grenade')return bot.inventory.some(slot=>slot?.item===item.type||slot==null);
  return false;
}
function botPickupLoot(bot){
  const item=state.loot.find(l=>dist(bot,l)<20&&botCanTakeLoot(bot,l));
  if(!item)return;
  bot.pickedSlots??=[false,false,false,false];
  if(item.type==='armor'){bot.armor=Math.min(100,(bot.armor||0)+50);bot.pickedArmor=true;takeLoot(item);return;}
  if(item.type==='health'||item.type==='grenade'){
    const existing=bot.inventory.findIndex(slot=>slot?.item===item.type),slot=existing>=0?existing:bot.inventory.findIndex(value=>value==null);
    if(existing>=0)bot.inventory[slot].count+=item.count||1;else bot.inventory[slot]={item:item.type,count:item.count||1};
    bot.pickedSlots[slot]=true;takeLoot(item);return;
  }
  const slot=botWeaponSlot(bot,item.weapon),old=bot.inventory[slot];
  if(old!=null)state.loot.push(dropInventorySlot(old,bot,slot*2));
  bot.inventory[slot]=item.weapon;bot.ammo[item.weapon]=WEAPONS[item.weapon].magazine||0;bot.pickedSlots[slot]=true;takeLoot(item);
}
function botUseMedkit(bot){
  if(bot.hp>55)return;
  const slot=bot.inventory.findIndex(value=>value?.item==='health');
  if(slot<0)return;
  bot.hp=Math.min(bot.maxHp,bot.hp+45);bot.inventory[slot].count--;
  if(bot.inventory[slot].count<=0){bot.inventory[slot]=null;bot.pickedSlots[slot]=false;}
  burst(bot.x,bot.y,'#90d485',8);
}
function updateBot(bot,dt,now){
  if(bot.invuln>0)bot.invuln=Math.max(0,bot.invuln-dt);
  if(bot.hitFlash>0)bot.hitFlash-=dt;
  bot.think-=dt;botPickupLoot(bot);botUseMedkit(bot);
  if(bot.think<=0){
    bot.think=rand(.24,.4);
    const enemies=state.bots.filter(other=>other.alive&&other.team!==bot.team);
    if(state.player.team!==bot.team&&canSeePlayer(bot))enemies.push(state.player);
    bot.target=enemies.sort((a,b)=>dist(bot,a)-dist(bot,b))[0]||null;
    bot.pathPoint=bot.target?nextPathStep(bot,bot.target):null;
    const nearest=state.loot.filter(item=>botCanTakeLoot(bot,item)).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
    const targetDistance=bot.target?dist(bot,bot.target):Infinity;
    bot.pickupTarget=nearest&&dist(bot,nearest)<145&&targetDistance>185?nearest:null;
    bot.pickupPath=bot.pickupTarget?nextPathStep(bot,bot.pickupTarget):null;
    bot.wanderAngle=rand(-Math.PI,Math.PI);bot.wanderUntil=now+rand(500,1600);
  }
  if(bot.target===state.player&&!canSeePlayer(bot))bot.target=null;
  if(bot.target?.alive){
    const d=dist(bot,bot.target),angle=Math.atan2(bot.target.y-bot.y,bot.target.x-bot.x),clear=lineClear(bot,bot.target);
    bot.angle=angle;
    const available=bot.inventory.map((id,index)=>({id,index,score:typeof id==='number'?botWeaponScore(id,bot.target,d,clear):-100})).sort((a,b)=>b.score-a.score);
    if(available.length&&available[0].score>-20)bot.active=available[0].index;
    const weapon=WEAPONS[bot.inventory[bot.active]],melee=weapon?.kind==='melee',reach=melee?weapon.range+bot.r:470;
    if(bot.pickupTarget&&state.loot.includes(bot.pickupTarget))steerToward(bot,bot.pickupTarget,bot.pickupPath,bot.speed,dt);
    else if(melee&&(d>reach-4||!clear))steerToward(bot,bot.target,bot.pathPoint,bot.speed,dt);
    else if(!melee&&(d>145||!firingLaneClear(bot,bot.target)))steerToward(bot,bot.target,bot.pathPoint,bot.speed,dt);
    else if(!melee&&d<95)move(bot,-Math.cos(angle)*bot.speed*.4*dt,-Math.sin(angle)*bot.speed*.4*dt);
    if(now>bot.fireTime&&d<reach&&(melee?clear:firingLaneClear(bot,bot.target))){
      if(Math.random()<.78)shoot(bot,angle,now);else bot.fireTime=now+rand(200,450);
    }
  }else if(now<(bot.wanderUntil||0))move(bot,Math.cos(bot.wanderAngle)*bot.speed*.35*dt,Math.sin(bot.wanderAngle)*bot.speed*.35*dt);
}
function wanderEnemy(e,dt,now){if(!Number.isFinite(e.wanderAngle)||now>=(e.wanderUntil||0)){e.wanderAngle=rand(-Math.PI,Math.PI);e.wanderUntil=now+rand(800,1600);}move(e,Math.cos(e.wanderAngle)*e.speed*.35*dt,Math.sin(e.wanderAngle)*e.speed*.35*dt);}
function updateEnemy(e,dt,now){if(e.invuln>0)e.invuln=Math.max(0,e.invuln-dt);if(e.hitFlash>0)e.hitFlash-=dt;e.think-=dt;if(e.think<=0){e.think=rand(.24,.4);const friendlyGuard=e.type==='guard'&&e.team===state.player.team;let targets=e.type==='monster'?state.enemies.filter(x=>x.alive&&x.type==='guard'&&x.team===state.player.team):state.enemies.filter(x=>x.alive&&x.type==='monster');if(!friendlyGuard&&canSeePlayer(e))targets.push(state.player);if(state.mode==='pvp')targets.push(...state.bots.filter(b=>b.alive&&(!e.team||b.team!==e.team)));e.target=targets.filter(x=>x!==e).sort((a,b)=>dist(e,a)-dist(e,b))[0]||null;e.pathPoint=e.target?nextPathStep(e,e.target):null;}if(e.target===state.player&&!canSeePlayer(e))e.target=null;if(!e.target?.alive){wanderEnemy(e,dt,now);return;}const d=dist(e,e.target),a=Math.atan2(e.target.y-e.y,e.target.x-e.x);e.angle=a;if(e.type==='guard'){if(d>210||!firingLaneClear(e,e.target))steerToward(e,e.target,e.pathPoint,e.speed,dt);else if(d<140)move(e,-Math.cos(a)*e.speed*.35*dt,-Math.sin(a)*e.speed*.35*dt);if(now>e.fireTime&&d<460&&firingLaneClear(e,e.target)){state.bullets.push({x:e.x+Math.cos(a)*14,y:e.y+Math.sin(a)*14,vx:Math.cos(a)*445,vy:Math.sin(a)*445,owner:e,damage:e.damage,life:1.25,color:'#f2745e'});e.fireTime=now+rand(700,1050);}}
  else if(e.variant==='spitter'){if(d>250||!firingLaneClear(e,e.target))steerToward(e,e.target,e.pathPoint,e.speed,dt);else if(d<155)move(e,-Math.cos(a)*e.speed*.35*dt,-Math.sin(a)*e.speed*.35*dt);if(now>e.fireTime&&d<390&&firingLaneClear(e,e.target)){state.bullets.push({x:e.x+Math.cos(a)*14,y:e.y+Math.sin(a)*14,vx:Math.cos(a)*310,vy:Math.sin(a)*310,owner:e,damage:e.damage,life:1.35,color:'#91d56e',acid:true});e.fireTime=now+1050;}}
  else if(d>e.r+e.target.r+6)steerToward(e,e.target,e.pathPoint,e.speed,dt);else if(now>e.fireTime){hit(e.target,e.damage,e);e.fireTime=now+(e.variant==='brute'?920:650);burst(e.target.x,e.target.y,e.variant==='spitter'?'#91d56e':'#f2745e',5);}}
function lineClear(a,b,radius=7){const d=dist(a,b),steps=Math.ceil(d/6);for(let i=1;i<steps;i++){const t=i/steps;if(blocked(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,radius))return false;}return true;}
function canSeePlayer(actor){return state.player?.alive&&dist(actor,state.player)<=PLAYER_SIGHT_RANGE&&lineClear(actor,state.player);}
function firingLaneClear(actor,target){if(!lineClear(actor,target))return false;const angle=Math.atan2(target.y-actor.y,target.x-actor.x),muzzle={x:actor.x+Math.cos(angle)*15,y:actor.y+Math.sin(angle)*15};return !blocked(muzzle.x,muzzle.y)&&lineClear(muzzle,target);}
function nextPathStep(actor,target){const w=state.world.w,h=state.world.h,toIndex=(x,y)=>y*w+x;let sx=clamp(Math.floor(actor.x/32),1,w-2),sy=clamp(Math.floor(actor.y/32),1,h-2),gx=clamp(Math.floor(target.x/32),1,w-2),gy=clamp(Math.floor(target.y/32),1,h-2);if(!floorTile(gx,gy)){let found=false;for(let radius=1;radius<=3&&!found;radius++)for(let y=gy-radius;y<=gy+radius&&!found;y++)for(let x=gx-radius;x<=gx+radius;x++)if(floorTile(x,y)){gx=x;gy=y;found=true;break;}if(!found)return target;}const start=toIndex(sx,sy),goal=toIndex(gx,gy),parents=new Int32Array(w*h).fill(-2),queue=new Int32Array(w*h);let head=0,tail=0;queue[tail++]=start;parents[start]=start;const dirs=[[1,0],[-1,0],[0,1],[0,-1]];while(head<tail&&parents[goal]===-2){const here=queue[head++],x=here%w,y=Math.floor(here/w);for(const[dx,dy]of dirs){const nx=x+dx,ny=y+dy,next=toIndex(nx,ny);if(nx<1||ny<1||nx>=w-1||ny>=h-1||parents[next]!==-2||!floorTile(nx,ny))continue;parents[next]=here;queue[tail++]=next;}}if(parents[goal]===-2)return target;let step=goal;while(parents[step]!==start&&step!==start)step=parents[step];return{x:(step%w+.5)*32,y:(Math.floor(step/w)+.5)*32};}
function steerToward(actor,target,pathPoint,speed,dt){const clear=lineClear(actor,target,Math.max(7,(actor.r||8)-1)),point=clear?target:pathPoint||target,dx=point.x-actor.x,dy=point.y-actor.y,d=Math.hypot(dx,dy),beforeX=actor.x,beforeY=actor.y;if(d>5)move(actor,dx/d*speed*dt,dy/d*speed*dt);if(!clear&&Math.hypot(actor.x-beforeX,actor.y-beforeY)<.15){actor.stuckTime=(actor.stuckTime||0)+dt;if(actor.stuckTime>.35){const side=actor.stuckSide||1,nx=-dy/(d||1)*speed*dt*1.8*side,ny=dx/(d||1)*speed*dt*1.8*side;move(actor,nx,ny);if(Math.hypot(actor.x-beforeX,actor.y-beforeY)<.15){move(actor,-nx,-ny);actor.stuckSide=-side;}actor.stuckTime=0;actor.think=0;}}else actor.stuckTime=0;}
function respawnBot(b){const zone=state.world.spawnZones[b.team==='blue'?0:1],p=findOpen(zone.x/32,zone.y/32,0,5);b.x=p.x;b.y=p.y;b.hp=100;b.armor=25;b.alive=true;b.invuln=.55;b.respawn=0;b.inventory=[0,1,null,null];b.pickedSlots=[false,false,false,false];b.pickedArmor=false;b.active=0;b.ammo[1]=30;b.fireTime=performance.now()+500;}
function respawnPlayer(){const p=state.player,zone=state.world.spawnZones[p.team==='blue'?0:1],pos=findOpen(zone.x/32,zone.y/32,0,5);p.x=pos.x;p.y=pos.y;p.hp=100;p.armor=25;p.alive=true;p.invuln=.65;p.respawn=0;announce('OPERATOR BACK IN THE FIGHT');renderWeapons();}
function burst(x,y,color,n){for(let i=0;i<n;i++)state.particles.push({x,y,vx:rand(-95,95),vy:rand(-95,95),life:rand(.12,.42),max:.42,color,r:rand(1,3)});}
function muzzle(x,y,color){for(let i=0;i<3;i++)state.particles.push({x,y,vx:rand(-30,30),vy:rand(-30,30),life:.07,max:.07,color,r:rand(2,4)});}
function useGrenade(aimAngle=null){const p=state.player;if(!p?.alive){announce('NO GRENADES');return;}const index=p.inventory.findIndex(slot=>slot?.item==='grenade');if(index<0){announce('NO GRENADES');return;}const stack=p.inventory[index];stack.count--;if(stack.count<=0)p.inventory[index]=null;p.fireAt=performance.now()+360;$('#grenade-count').textContent=String(inventoryGrenades());renderWeapons();const tx=state.mouse.x+state.camera.x,ty=state.mouse.y+state.camera.y,angle=aimAngle??Math.atan2(ty-p.y,tx-p.x);const x=p.x+Math.cos(angle)*GRENADE_THROW_DISTANCE,y=p.y+Math.sin(angle)*GRENADE_THROW_DISTANCE;state.particles.push({x,y,vx:0,vy:0,life:.45,max:.45,color:'#dd8e68',r:9,grenade:true});const runId=state.runId;setTimeout(()=>{if(!state.running||runId!==state.runId)return;burst(x,y,'#e78e62',23);for(const t of state.mode==='pvp'?state.bots:state.enemies)if(t.alive&&dist({x,y},t)<112)hit(t,115*(1-dist({x,y},t)/180),p);sound(80,'sawtooth',.25,.065);},450);sound(110,'triangle',.09,.02);}
function interact(){const p=state.player;if(!p?.alive)return;if(state.mode==='survival'&&dist(p,state.world.exit)<state.world.exit.r+15){finish(true,'EXTRACTION CONFIRMED','You reached the extraction zone.');return;}const item=state.loot.find(x=>dist(p,x)<39);if(!item){announce('NOTHING IN REACH');return;}if(item.type==='weapon'){const slot=p.inventory.findIndex(value=>value==null);if(slot>=0){p.inventory[slot]=item.weapon;p.ammo[item.weapon]=WEAPONS[item.weapon].magazine;takeLoot(item);p.active=slot;log(`${item.label} added to slot ${slot+1}.`,'good');announce(`${item.label} COLLECTED`);}else{state.pendingLoot=item;$('#inventory-prompt').textContent=`${item.label} FOUND — SELECT A SLOT BELOW TO SWAP`;$('#inventory-prompt').classList.remove('hidden');announce(`${item.label} READY TO EQUIP`);renderWeapons();return;}}else if(item.type==='health'||item.type==='grenade'){const slotType=item.type==='health'?'health':'grenade',existing=p.inventory.findIndex(value=>value?.item===slotType),free=p.inventory.findIndex(value=>value==null);if(existing>=0){p.inventory[existing].count+=(item.count||1);}else if(free>=0){p.inventory[free]={item:slotType,count:item.count||1};p.active=free;}else{state.pendingLoot=item;$('#inventory-prompt').textContent=`${item.label} FOUND — SELECT A SLOT BELOW TO SWAP`;$('#inventory-prompt').classList.remove('hidden');announce(`${item.label} NEEDS AN INVENTORY SLOT`);renderWeapons();return;}takeLoot(item);announce(`${item.label} ADDED TO INVENTORY`);log(`${inventoryItemLabel({item:slotType})} stored in inventory.`,'good');}else if(item.type==='armor'){p.armor=Math.min(100,p.armor+50);log('Armor equipped.','good');}takeLoot(item);state.found++;$('#loot-count').textContent=String(state.found);if(item.type==='armor')announce(`${item.label} COLLECTED`);sound(500,'sine',.08,.018);$('#grenade-count').textContent=String(inventoryGrenades());renderWeapons();}
function finish(won,title,copy){if(state.roundEnd)return;state.roundEnd=true;state.running=false;$('#result-title').innerHTML=title.replace(' ','<br>');$('#result-copy').textContent=copy;$('#result-eyebrow').textContent=won?'OPERATION COMPLETE':'OPERATION FAILED';$('#end-overlay').classList.remove('hidden');}
function togglePause(){if(!state.running)return;state.paused=!state.paused;$('#pause-overlay').classList.toggle('hidden',!state.paused);game.classList.toggle('paused',state.paused);if(!state.paused)state.lastTime=performance.now();}
function updateHUD(){const p=state.player;if(!p)return;$('#health-value').textContent=String(Math.ceil(p.hp));$('#health-bar').style.width=`${clamp(p.hp/p.maxHp*100,0,100)}%`;$('#armor-value').textContent=`+ ${Math.ceil(p.armor||0)} ARM`;$('#armor-bar').style.width=`${clamp(p.armor||0,0,100)}%`;$('#grenade-count').textContent=String(inventoryGrenades(p));const minutes=Math.floor(state.elapsed/60),seconds=Math.floor(state.elapsed%60);$('#clock').textContent=`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;const alive=state.mode==='survival'?state.enemies.filter(e=>e.alive&&e.type==='monster').length:state.bots.filter(b=>b.alive&&b.team!==p.team).length;$('#threat-count').textContent=String(alive);const closest=state.mode==='survival'?state.loot.filter(l=>dist(p,l)<100).sort((a,b)=>dist(p,a)-dist(p,b))[0]:null;$('#context-prompt').classList.toggle('hidden',!closest&&!(state.mode==='survival'&&dist(p,state.world.exit)<state.world.exit.r+20));if(closest)$('#context-prompt').textContent=`[ E ] PICK UP ${closest.label}`;else if(state.mode==='survival'&&dist(p,state.world.exit)<state.world.exit.r+20)$('#context-prompt').textContent='[ E ] EXTRACT';if(state.mode==='survival')$('#objective-detail').textContent=dist(p,state.world.exit)<220?'Extraction zone nearby':`${Math.max(0,Math.round(dist(p,state.world.exit)/32))} m to extraction`;}

function render(now){const W=Number(canvas.dataset.cssWidth)||600,H=Number(canvas.dataset.cssHeight)||400;ctx.clearRect(0,0,W,H);ctx.fillStyle=COLORS.floor;ctx.fillRect(0,0,W,H);const t=state.world.tile,sx=Math.floor(state.camera.x/t),sy=Math.floor(state.camera.y/t),ex=Math.ceil((state.camera.x+W)/t)+1,ey=Math.ceil((state.camera.y+H)/t)+1;for(let y=sy;y<ey;y++)for(let x=sx;x<ex;x++){const px=x*t-state.camera.x,py=y*t-state.camera.y;if(!floorTile(x,y)){ctx.fillStyle='#364137';ctx.fillRect(px,py,t,t);ctx.fillStyle='#465248';ctx.fillRect(px,py,t,3);ctx.fillStyle='#303a31';ctx.fillRect(px,py+t-3,t,3);ctx.fillStyle='#63715e2e';ctx.fillRect(px+3,py+4,t-6,t-8);ctx.strokeStyle='#232c25';ctx.strokeRect(px+.5,py+.5,t-1,t-1);}else{const parity=(x*17+y*23)%7;ctx.fillStyle=parity===0?'#222d24':parity===1?'#1e2820':'#202a22';ctx.fillRect(px,py,t,t);ctx.strokeStyle=COLORS.grid;ctx.strokeRect(px+.5,py+.5,t,t);}}
  for(const d of state.decor){if(d.x<state.camera.x-15||d.x>state.camera.x+W+15||d.y<state.camera.y-15||d.y>state.camera.y+H+15)continue;ctx.globalAlpha=d.alpha;ctx.fillStyle=d.kind==='stain'?'#a58e7155':'#aab6a7';ctx.beginPath();ctx.ellipse(d.x-state.camera.x,d.y-state.camera.y,d.r*1.8,d.r,rand(0,3),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;if(state.world.labels){ctx.save();ctx.font='7px "IBM Plex Mono"';ctx.fillStyle='#b0bfa263';ctx.textAlign='center';for(const label of state.world.labels)ctx.fillText(label.text,label.x-state.camera.x,label.y-state.camera.y);ctx.restore();}
  if(state.mode==='survival'){const e=state.world.exit;ctx.save();ctx.globalAlpha=.44+.16*Math.sin(now/350);ctx.strokeStyle=COLORS.lime;ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x-state.camera.x,e.y-state.camera.y,e.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#c0ef7513';ctx.fill();ctx.restore();const exx=e.x-state.camera.x,exy=e.y-state.camera.y;ctx.fillStyle='#c0ef75';ctx.font='8px "IBM Plex Mono"';ctx.textAlign='center';ctx.fillText('EXTRACTION',exx,exy-39);}
  for(const item of state.loot)drawLoot(item);
  for(const b of state.bullets){const x=b.x-state.camera.x,y=b.y-state.camera.y,speed=Math.hypot(b.vx,b.vy)||1,tailX=x-b.vx/speed*18,tailY=y-b.vy/speed*18,glow=ctx.createLinearGradient(tailX,tailY,x,y);glow.addColorStop(0,`${b.color}00`);glow.addColorStop(.72,b.color);glow.addColorStop(1,'#fff5d8');ctx.save();ctx.strokeStyle=glow;ctx.lineWidth=3;ctx.lineCap='round';ctx.shadowColor=b.color;ctx.shadowBlur=10;ctx.beginPath();ctx.moveTo(tailX,tailY);ctx.lineTo(x,y);ctx.stroke();ctx.restore();ctx.fillStyle='#fff4d2';ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();}
  for(const e of state.enemies)if(e.alive)drawEntity(e,e.type==='monster'?'#cf6350':e.team===state.player.team?COLORS.blue:'#bb7459',now,e.type==='guard'?(e.team===state.player.team?'ALLY GUARD':'GUARD'):e.variant?.toUpperCase()||'');for(const b of state.bots)if(b.alive)drawEntity(b,b.team==='blue'?COLORS.blue:COLORS.red,now,b.team===state.player.team?'ALLY':'HOSTILE');if(state.player?.alive)drawEntity(state.player,COLORS.lime,now,'YOU');for(const part of state.particles){const x=part.x-state.camera.x,y=part.y-state.camera.y;ctx.globalAlpha=clamp(part.life/part.max,0,1);ctx.fillStyle=part.color;if(part.grenade){ctx.beginPath();ctx.arc(x,y,part.r,0,Math.PI*2);ctx.fill();}else{ctx.beginPath();ctx.arc(x,y,part.r,0,Math.PI*2);ctx.fill();}}ctx.globalAlpha=1;
  if(state.mode==='survival'&&!state.visibleMap){const px=state.player.x-state.camera.x,py=state.player.y-state.camera.y;const gradient=ctx.createRadialGradient(px,py,80,px,py,330);gradient.addColorStop(0,'#0000');gradient.addColorStop(.65,'#0002');gradient.addColorStop(1,'#060907c9');ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);}
  if(state.visibleMap)drawFullMap(W,H);}
function drawHeldWeapon(id){const w=WEAPONS[id]||WEAPONS[0];ctx.save();ctx.lineCap='round';ctx.lineJoin='round';if(w.kind==='gun'){ctx.fillStyle='#131a16';ctx.strokeStyle='#c8d0c3';ctx.lineWidth=.8;ctx.beginPath();ctx.roundRect(2,-3.7,20,7.4,1);ctx.fill();ctx.stroke();ctx.fillStyle=w.color;if(w.family===0){ctx.fillRect(6,-4,12,2);ctx.fillRect(21,-1.7,7,3.4);ctx.fillStyle='#343c35';ctx.beginPath();ctx.moveTo(11,3);ctx.lineTo(17,3);ctx.lineTo(19,9);ctx.lineTo(14,9);ctx.closePath();ctx.fill();}
    else if(w.family===1){ctx.fillRect(3,-2,5,2);ctx.fillRect(6,-5,14,2);ctx.fillRect(21,-1.6,8,3.2);ctx.fillStyle='#343c35';ctx.fillRect(11,3,4,6);ctx.fillRect(1,1,4,4);}
    else if(w.family===2){ctx.fillRect(4,-3.2,22,1.5);ctx.fillRect(5,.2,22,1.4);ctx.fillRect(26,-1.5,7,3);ctx.fillStyle='#343c35';ctx.fillRect(8,-6,5,3);ctx.fillRect(11,3,5,6);ctx.fillRect(2,1,4,4);}
    else{ctx.fillRect(2,-5,6,3);ctx.fillRect(5,-6.5,9,1.5);ctx.fillRect(21,-1.5,11,3);ctx.fillStyle='#343c35';ctx.fillRect(12,3,4,7);ctx.fillRect(1,1,4,4);ctx.fillStyle='#d9c786';ctx.fillRect(15,-5,3,1.5);}}
  else{ctx.strokeStyle=w.color;ctx.fillStyle=w.color;ctx.lineWidth=2.4;ctx.beginPath();if(w.family===4){ctx.moveTo(3,5);ctx.lineTo(22,-5);ctx.stroke();ctx.fillStyle='#515a50';ctx.fillRect(1,4,7,3);}else if(w.family===5){ctx.moveTo(2,5);ctx.lineTo(25,-2);ctx.stroke();ctx.fillStyle='#c39165';ctx.fillRect(24,-5,7,5);}else{ctx.moveTo(3,5);ctx.lineTo(22,-2);ctx.stroke();ctx.fillStyle='#d5d0bd';ctx.beginPath();ctx.moveTo(18,-2);ctx.lineTo(24,-11);ctx.lineTo(32,-9);ctx.lineTo(29,1);ctx.closePath();ctx.fill();}}
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
function drawMinimap(){
  const W=minimap.width,H=minimap.height,w=state.world.w,h=state.world.h,tw=W/w,th=H/h; mctx.clearRect(0,0,W,H);mctx.fillStyle='#101612';mctx.fillRect(0,0,W,H);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const key=`${x},${y}`,px=x*tw,py=y*th;if(!floorTile(x,y)){mctx.fillStyle='#465346';mctx.fillRect(px,py,tw+.4,th+.4);}else if(state.world.explored.has(key)){mctx.fillStyle=state.world.visible.has(key)?'#526b4d':'#202a22';mctx.fillRect(px,py,tw+.4,th+.4);}}
  const p=state.player;if(state.mode==='survival'&&state.world.explored.has(`${Math.floor(state.world.exit.x/32)},${Math.floor(state.world.exit.y/32)}`)){mctx.fillStyle=COLORS.lime;mctx.beginPath();mctx.arc(state.world.exit.x/32*tw,state.world.exit.y/32*th,3,0,Math.PI*2);mctx.fill();}
  const units=state.mode==='pvp'?state.bots:state.enemies;for(const unit of units)if(unit.alive&&visibleAt(unit.x,unit.y)){mctx.fillStyle=unit.team===p.team?COLORS.lime:COLORS.red;mctx.fillRect(unit.x/32*tw-1.5,unit.y/32*th-1.5,3,3);}
  mctx.fillStyle=COLORS.lime;mctx.beginPath();mctx.arc(p.x/32*tw,p.y/32*th,3,0,Math.PI*2);mctx.fill();mctx.strokeStyle='#bbc7ae77';mctx.lineWidth=1;mctx.strokeRect(state.camera.x/(w*32)*W,state.camera.y/(h*32)*H,(Number(canvas.dataset.cssWidth)||600)/(w*32)*W,(Number(canvas.dataset.cssHeight)||400)/(h*32)*H);
}
function drawFullMap(W,H){
  ctx.save();ctx.fillStyle='#090d0bf7';ctx.fillRect(0,0,W,H);const pad=24,scale=Math.min((W-pad*2)/(state.world.w*32),(H-pad*2)/(state.world.h*32)),mw=state.world.w*32*scale,mh=state.world.h*32*scale,ox=(W-mw)/2,oy=(H-mh)/2;
  for(let y=0;y<state.world.h;y++)for(let x=0;x<state.world.w;x++){const key=`${x},${y}`,px=ox+x*32*scale,py=oy+y*32*scale;if(!floorTile(x,y)){ctx.fillStyle='#465346';ctx.fillRect(px,py,32*scale+.5,32*scale+.5);}else if(state.world.explored.has(key)){ctx.fillStyle=state.world.visible.has(key)?'#526b4d':'#202a22';ctx.fillRect(px,py,32*scale+.5,32*scale+.5);}}
  ctx.save();ctx.font=`${Math.max(5,Math.min(8,scale*48))}px "IBM Plex Mono"`;ctx.textAlign='center';ctx.fillStyle='#d5dec588';for(const label of state.world.labels||[])if(state.world.explored.has(`${Math.floor(label.x/32)},${Math.floor(label.y/32)}`))ctx.fillText(label.text,ox+label.x*scale,oy+label.y*scale);ctx.restore();
  if(state.mode==='survival'&&state.world.explored.has(`${Math.floor(state.world.exit.x/32)},${Math.floor(state.world.exit.y/32)}`)){ctx.fillStyle=COLORS.lime;ctx.beginPath();ctx.arc(ox+state.world.exit.x*scale,oy+state.world.exit.y*scale,4,0,Math.PI*2);ctx.fill();}
  const units=state.mode==='pvp'?state.bots:state.enemies;for(const unit of units)if(unit.alive&&visibleAt(unit.x,unit.y)){ctx.fillStyle=unit.team===state.player.team?COLORS.lime:COLORS.red;ctx.beginPath();ctx.arc(ox+unit.x*scale,oy+unit.y*scale,3,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#f0f4e8';ctx.beginPath();ctx.arc(ox+state.player.x*scale,oy+state.player.y*scale,4,0,Math.PI*2);ctx.fill();ctx.font='8px "IBM Plex Mono"';ctx.textAlign='left';ctx.fillStyle='#c0ef75';ctx.fillText(state.mode==='survival'?'FACILITY 07-C · EXPLORED AREAS':'ARENA A-01 · TEAM VISION',ox,oy-9);ctx.restore();
}

function onKeyDown(e){const key=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();if(key==='escape'||key==='p'){togglePause();return;}if(key==='m'&&state.running){state.visibleMap=!state.visibleMap;$('#map-status').textContent=state.visibleMap?'— FULL MAP':state.mode==='pvp'?'— TEAM VISION':'— EXPLORE';return;}if(key==='e'){interact();return;}if(key==='g'){useGrenade();return;}if(key==='r'){reloadWeapon();return;}if(key>='1'&&key<='4'){equip(Number(key)-1);return;}state.keys.add(key);}
function onKeyUp(e){state.keys.delete(e.key.toLowerCase());}
function pointerPosition(e){const r=canvas.getBoundingClientRect();state.mouse.x=e.clientX-r.left;state.mouse.y=e.clientY-r.top;}
$('#select-survival').addEventListener('click',()=>openSetup('survival'));$('#select-pvp').addEventListener('click',()=>openSetup('pvp'));$('#setup-back').addEventListener('click',showMenu);$('#back-menu').addEventListener('click',showMenu);$('#start-button').addEventListener('click',startGame);$('#pause-button').addEventListener('click',togglePause);$('#resume-button').addEventListener('click',togglePause);$('#pause-quit').addEventListener('click',showMenu);$('#restart-button').addEventListener('click',()=>openSetup(state.mode));$('#end-menu').addEventListener('click',showMenu);$('#map-toggle').addEventListener('click',()=>{state.visibleMap=!state.visibleMap;$('#map-status').textContent=state.visibleMap?'— FULL MAP':state.mode==='pvp'?'— TEAM VISION':'— EXPLORE';});
canvas.addEventListener('pointermove',pointerPosition);canvas.addEventListener('pointerdown',e=>{if(e.button===0){pointerPosition(e);state.mouse.down=true;canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointerup',()=>state.mouse.down=false);canvas.addEventListener('pointercancel',()=>state.mouse.down=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',()=>{state.keys.clear();state.mouse.down=false;});window.addEventListener('resize',resizeCanvas);
// Touch movement uses a compact relative joystick when available.
const joystick=$('#joystick');let touchOrigin=null;joystick?.addEventListener('pointerdown',e=>{touchOrigin={x:e.clientX,y:e.clientY};joystick.setPointerCapture(e.pointerId);});joystick?.addEventListener('pointermove',e=>{if(!touchOrigin)return;const dx=clamp(e.clientX-touchOrigin.x,-35,35),dy=clamp(e.clientY-touchOrigin.y,-35,35);for(const k of ['w','a','s','d'])state.keys.delete(k);if(dy<-7)state.keys.add('w');if(dy>7)state.keys.add('s');if(dx<-7)state.keys.add('a');if(dx>7)state.keys.add('d');const thumb=joystick.querySelector('span');thumb.style.transform=`translate(${dx}px,${dy}px)`;});joystick?.addEventListener('pointerup',()=>{touchOrigin=null;for(const k of ['w','a','s','d'])state.keys.delete(k);joystick.querySelector('span').style.transform=''});$('#mobile-fire')?.addEventListener('pointerdown',()=>{state.touchFire=true;state.mouse.down=true;});$('#mobile-fire')?.addEventListener('pointerup',()=>{state.touchFire=false;state.mouse.down=false;});$('#mobile-fire')?.addEventListener('pointercancel',()=>{state.touchFire=false;state.mouse.down=false;});$('#mobile-interact')?.addEventListener('pointerdown',interact);$('#mobile-grenade')?.addEventListener('pointerdown',useGrenade);
