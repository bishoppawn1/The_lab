import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthoritativeMatch } from '../src/authoritative-match.js';

const TICK_MS=1000/30;
const SNAPSHOT_MS=100;
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS=16;
const PAGE_ORIGIN='https://bishoppawn1.github.io';
const localOrigin=origin=>/^http:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)(?::\d+)?$/.test(origin);
const allowedOrigin=origin=>!origin||origin===PAGE_ORIGIN||localOrigin(origin)||process.env.ROOM_ALLOWED_ORIGINS?.split(',').map(value=>value.trim()).includes(origin);
const json=(response,status,value)=>{
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify(value));
};

export function createRoomHub(server){
  const rooms=new Map();
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  const roomCode=()=>{
    let code;
    do{code=Array.from({length:6},()=>CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');}while(rooms.has(code));
    return code;
  };
  const lobbyState=room=>({type:'lobby',code:room.code,teamSize:room.match.teamSize,target:room.match.target,hostId:room.hostId,
    players:[...room.match.players.values()].map(player=>({id:player.id,team:player.team,ready:room.ready.has(player.id)}))});
  const broadcast=(room,message)=>{
    const packet=JSON.stringify(message);
    for(const socket of room.clients.keys())if(socket.readyState===WebSocket.OPEN)socket.send(packet);
  };
  const publishLobby=room=>broadcast(room,lobbyState(room));

  server.on('upgrade',(request,socket,head)=>{
    if(!allowedOrigin(request.headers.origin)){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    const path=new URL(request.url,'http://localhost').pathname;
    const code=/^\/rooms\/([A-Z2-9]{6})$/.exec(path)?.[1];
    const room=rooms.get(code);
    if(!room||room.started){socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request,room));
  });
  wss.on('connection',(socket,request,room)=>{
    const selected=new URL(request.url,'http://localhost').searchParams.get('team');
    const player=room.match.addPlayer(selected==='blue'||selected==='red'?selected:null);
    if(!player){socket.close(1013,'Selected team is full');return;}
    room.hadPlayers=true;
    room.clients.set(socket,player.id);
    room.hostId??=player.id;
    socket.send(JSON.stringify({type:'welcome',id:player.id,team:player.team,code:room.code,seed:room.match.seed,teamSize:room.match.teamSize,target:room.match.target,tickRate:30}));
    publishLobby(room);
    socket.on('message',data=>{
      let message;
      try{message=JSON.parse(data.toString());}catch{return;}
      if(message?.type==='input'){
        if(room.started)room.match.submitInput(player.id,message);
        return;
      }
      if(message?.type!=='lobby'||room.started)return;
      if(message.action==='ready'){
        if(message.ready===true)room.ready.add(player.id);
        else room.ready.delete(player.id);
        publishLobby(room);
      }else if(message.action==='start'&&player.id===room.hostId){
        if(room.match.players.size===room.ready.size&&room.ready.size>0){
          room.started=true;
          broadcast(room,{type:'started',code:room.code});
          for(const [client,id] of room.clients)if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(room.match.snapshot(id)));
        }else socket.send(JSON.stringify({type:'lobby-error',message:'Every player must be ready before the host can start.'}));
      }
    });
    socket.on('close',()=>{
      room.clients.delete(socket);room.ready.delete(player.id);room.match.removePlayer(player.id);
      if(room.hostId===player.id)room.hostId=room.match.players.keys().next().value??null;
      if(room.match.players.size){if(!room.started)publishLobby(room);}
      else rooms.delete(room.code);
    });
    socket.on('error',()=>{});
  });

  const tick=setInterval(()=>{
    for(const room of rooms.values())if(room.started&&room.match.players.size)room.match.step(TICK_MS/1000);
  },TICK_MS);
  const snapshots=setInterval(()=>{
    for(const room of rooms.values())if(room.started)for(const [socket,id] of room.clients){
      if(socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>1_000_000)continue;
      const snapshot=room.match.snapshot(id);
      if(snapshot)socket.send(JSON.stringify(snapshot));
    }
  },SNAPSHOT_MS);
  const cleanup=setInterval(()=>{
    const now=Date.now();
    for(const room of rooms.values())if(!room.hadPlayers&&now-room.createdAt>10*60_000)rooms.delete(room.code);
  },60_000);

  return{
    rooms,
    async handleRequest(request,response){
      const path=new URL(request.url,'http://localhost').pathname;
      if(path==='/health'&&request.method==='GET'){
        json(response,200,{status:'ok',rooms:rooms.size,players:[...rooms.values()].reduce((count,room)=>count+room.match.players.size,0)});
        return true;
      }
      if(path==='/rooms'||path.startsWith('/rooms/')){
        const origin=request.headers.origin;
        if(!allowedOrigin(origin)){json(response,403,{error:'Origin not allowed'});return true;}
        if(origin){
          response.setHeader('Access-Control-Allow-Origin',origin);
          response.setHeader('Vary','Origin');
          response.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
          response.setHeader('Access-Control-Allow-Headers','Content-Type');
        }
        if(request.method==='OPTIONS'){response.writeHead(204).end();return true;}
      }
      if(path==='/rooms'&&request.method==='POST'){
        try{
          if(rooms.size>=MAX_ROOMS){json(response,503,{error:'Room server is full. Try again later.'});return true;}
          let body='';
          for await(const chunk of request){body+=chunk;if(body.length>1024)throw new Error('Request too large');}
          const {teamSize,target}=JSON.parse(body);
          if(![5,10].includes(teamSize)||![50,100,250].includes(target))throw new Error('Invalid match settings');
          const code=roomCode(),match=new AuthoritativeMatch({teamSize,target});
          rooms.set(code,{code,match,clients:new Map(),ready:new Set(),hostId:null,started:false,hadPlayers:false,createdAt:Date.now()});
          json(response,201,{code,teamSize,target});
        }catch(error){json(response,400,{error:error.message});}
        return true;
      }
      const code=/^\/rooms\/([A-Z2-9]{6})$/.exec(path)?.[1];
      if(code&&request.method==='GET'){
        const room=rooms.get(code);
        if(!room||room.started){json(response,404,{error:'Room not found or already started'});return true;}
        json(response,200,lobbyState(room));return true;
      }
      if(path==='/rooms'||path.startsWith('/rooms/')){json(response,404,{error:'Room not found'});return true;}
      return false;
    },
    async close(){
      clearInterval(tick);clearInterval(snapshots);clearInterval(cleanup);
      for(const room of rooms.values())for(const socket of room.clients.keys())socket.terminate();
      await new Promise(done=>wss.close(done));
      rooms.clear();
    },
  };
}

export async function startRoomServer({host='127.0.0.1',port=8787}={}){
  let hub;
  const server=createServer(async(request,response)=>{
    if(!await hub.handleRequest(request,response))json(response,404,{error:'Not found'});
  });
  hub=createRoomHub(server);
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,host,done);});
  return{server,hub,address:server.address(),async close(){await hub.close();await new Promise(done=>server.close(done));}};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const service=await startRoomServer({host:process.env.MATCH_HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1'),port:Number(process.env.PORT||process.env.MATCH_PORT)||8787});
  console.log(`The Lab room server listening at http://${service.address.address}:${service.address.port}`);
  const shutdown=()=>service.close().then(()=>process.exit(0));
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}
