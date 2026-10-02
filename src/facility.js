// Shared, browser-independent map generation for local and future hosted matches.
export function createSeededRandom(seed){
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Map seed must be a 32-bit unsigned integer');
  let value=seed>>>0;
  return()=>{
    value=(value+0x6D2B79F5)>>>0;
    let result=Math.imul(value^(value>>>15),1|value);
    result^=result+Math.imul(result^(result>>>7),61|result);
    return ((result^(result>>>14))>>>0)/0x100000000;
  };
}

function partitionFacility(w,h,carve,roomCount,choice){
  const gap=3,minSize=22,sections=[{x:6,y:6,w:w-12,h:h-12}],segments=[];
  const capacity=section=>Math.floor((section.w+gap)/(minSize+gap))*Math.floor((section.h+gap)/(minSize+gap));
  // A perimeter hall joins every split, so even deeply nested sections stay connected.
  carve(3,3,w-4,5);carve(3,h-6,w-4,h-4);
  carve(3,3,5,h-4);carve(w-6,3,w-4,h-4);
  while(sections.length<roomCount){
    const totalCapacity=sections.reduce((sum,section)=>sum+capacity(section),0),options=[];
    for(const section of sections)for(const vertical of [true,false]){
      const size=vertical?section.w:section.h;
      for(let cut=minSize;cut<=size-minSize-gap;cut++){
        const first={...section,[vertical?'w':'h']:cut};
        const second=vertical?{...section,x:section.x+cut+gap,w:section.w-cut-gap}:{...section,y:section.y+cut+gap,h:section.h-cut-gap};
        // Keep enough usable space for every themed room, even with extreme random rolls.
        if(totalCapacity-capacity(section)+capacity(first)+capacity(second)>=roomCount)options.push({section,vertical,cut,first,second});
      }
    }
    const {section,vertical,cut,first,second}=choice(options);
    const hall=vertical?{x1:section.x+cut,y1:section.y-gap,x2:section.x+cut+gap-1,y2:section.y+section.h+gap-1}:{x1:section.x-gap,y1:section.y+cut,x2:section.x+section.w+gap-1,y2:section.y+cut+gap-1};
    carve(hall.x1,hall.y1,hall.x2,hall.y2);segments.push(hall);
    sections.splice(sections.indexOf(section),1,first,second);
  }
  return{sections,corridors:{segments}};
}
export function createFacility(mode,seed){
  const random=createSeededRandom(seed);
  const rand=(a,b)=>a+random()*(b-a);
  const choice=items=>items[Math.floor(random()*items.length)];
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const w=160,h=116,map=Array.from({length:h},()=>Array(w).fill(1));
  const floorTile=(x,y)=>map[y]?.[x]===0;
  const carve=(x1,y1,x2,y2)=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(x>0&&y>0&&x<w-1&&y<h-1)map[y][x]=0;};
  const names=['WORKSHOP','ARMORY','RESEARCH LAB','SPECIMEN HOLD','MEDICAL','STORAGE','NEST CHAMBER','CONTROL ROOM','SERVER ROOM','POWER STATION','OBSERVATION','CHEMISTRY','MAINTENANCE','ARCHIVES','QUARANTINE','GENERATOR'];
  for(let i=names.length-1;i>0;i--){const j=Math.floor(rand(0,i+1));[names[i],names[j]]=[names[j],names[i]];}
  const {sections,corridors}=partitionFacility(w,h,carve,names.length+2,choice),doors=[];
  const roomSections=new Map(),center=room=>({x:(room.x+Math.floor(room.w/2)+.5)*32,y:(room.y+Math.floor(room.h/2)+.5)*32});
  const rooms=sections.map(section=>{
    const rw=Math.floor(rand(11,Math.min(21,section.w-4)+1)),rh=Math.floor(rand(11,Math.min(19,section.h-4)+1));
    const room={x:Math.floor(rand(section.x+2,section.x+section.w-rw-1)),y:Math.floor(rand(section.y+2,section.y+section.h-rh-1)),w:rw,h:rh};
    roomSections.set(room,section);return room;
  });
  // Reserve the section nearest the map center for an open cache before choosing distant spawns.
  const hub=rooms.slice().sort((a,b)=>dist(center(roomSections.get(a)),{x:w*16,y:h*16})-dist(center(roomSections.get(b)),{x:w*16,y:h*16}))[0];
  // Vary both starting sides while keeping entry and extraction well separated.
  const pairs=[];for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++)if(rooms[i]!==hub&&rooms[j]!==hub)pairs.push({a:rooms[i],b:rooms[j],distance:dist(center(rooms[i]),center(rooms[j]))});
  const longest=Math.max(...pairs.map(pair=>pair.distance)),pair=choice(pairs.filter(pair=>pair.distance>=longest*.85));
  const [entry,extraction]=random()<.5?[pair.a,pair.b]:[pair.b,pair.a];
  const hubSection=roomSections.get(hub);
  Object.assign(hub,{x:hubSection.x+1,y:hubSection.y+1,w:hubSection.w-2,h:hubSection.h-2});
  rooms.splice(0,rooms.length,entry,...rooms.filter(room=>room!==entry&&room!==extraction),extraction);
  let themeIndex=0;const otherNames=names.filter(name=>name!=='STORAGE');
  rooms.forEach((room,index)=>{
    room.name=index===0?'ENTRY BAY':index===rooms.length-1?'EXTRACTION BAY':room===hub?'SUPPLY HUB':otherNames[themeIndex++];
    carve(room.x+1,room.y+1,room.x+room.w-2,room.y+room.h-2);
    const section=roomSections.get(room),doorX=room.x+Math.floor(rand(3,room.w-4)),south=random()<.5;
    const boundaryY=south?room.y+room.h-1:room.y,corridorY=south?section.y+section.h+1:section.y-2;
    carve(doorX,Math.min(boundaryY,corridorY),doorX+1,Math.max(boundaryY,corridorY));
    doors.push({x:doorX,y:boundaryY,cx:(doorX+1)*32,cy:(boundaryY+.5)*32,room,open:index===0,approach:{x:(doorX+1)*32,y:(boundaryY+(south?1.5:-.5))*32}});
  });
  for(const room of rooms)if(room!==hub&&random()<.68){for(let attempt=0;attempt<8;attempt++){
    const x=Math.floor(rand(room.x+3,room.x+room.w-4)),y=Math.floor(rand(room.y+3,room.y+room.h-4));
    if(Math.hypot(x-(room.x+room.w/2),y-(room.y+room.h/2))<4)continue;
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++)map[y+oy][x+ox]=1;break;
  }}
  const start=center(entry),end=center(extraction);
  const doorTiles=new Map();for(const door of doors)for(let dx=0;dx<2;dx++)doorTiles.set(`${door.x+dx},${door.y}`,door);
  const world={w,h,map,tile:32,mode,seed,rooms,doors,doorTiles,corridors,exit:{...end,r:39},spawnZones:[start,end],explored:new Set(),visible:new Set(),visionAt:0,labels:rooms.map(room=>({...center(room),text:room.name}))};
  const decor=[];for(let i=0;i<650;i++){const x=rand(2,w-2),y=rand(2,h-2);if(floorTile(Math.floor(x),Math.floor(y)))decor.push({x:(x+.5)*32,y:(y+.5)*32,r:rand(1,4),alpha:rand(.04,.15),kind:random()>.5?'stain':'debris'});}
  const themes={'ARMORY':['rack',5],'MEDICAL':['bed',4],'NEST CHAMBER':['nest',6],'SPECIMEN HOLD':['tank',4],'QUARANTINE':['tank',3],'WORKSHOP':['bench',4],'RESEARCH LAB':['console',4],'CONTROL ROOM':['console',5],'SERVER ROOM':['server',5],'POWER STATION':['generator',3],'OBSERVATION':['console',3],'CHEMISTRY':['tank',3],'MAINTENANCE':['crate',3],'ARCHIVES':['shelf',5],'GENERATOR':['generator',4]};
  const roomProps=[];for(const room of rooms){const [kind,count]=themes[room.name]||[];if(!kind)continue;for(let i=0;i<count;i++)for(let attempt=0;attempt<40;attempt++){
    const tx=Math.floor(rand(room.x+2,room.x+room.w-2)),ty=Math.floor(rand(room.y+2,room.y+room.h-2)),x=(tx+.5)*32,y=(ty+.5)*32;
    if(!floorTile(tx,ty)||Math.hypot(x-center(room).x,y-center(room).y)<68||roomProps.some(prop=>dist(prop,{x,y})<56))continue;
    const dimensions=kind==='tank'?[12,14]:kind==='generator'?[14,14]:[14,11];
    roomProps.push({x,y,kind,solid:kind!=='nest',halfW:dimensions[0],halfH:dimensions[1]});break;
  }}
  const coverGrid=new Map();
  for(const prop of roomProps)if(prop.solid)coverGrid.set(`${Math.floor(prop.x/32)},${Math.floor(prop.y/32)}`,prop);
  world.coverGrid=coverGrid;
  return {world,decor,roomProps};
}
