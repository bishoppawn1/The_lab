import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { AuthoritativeMatch } from '../src/authoritative-match.js';

const TICK_MS=1000/30;
const SNAPSHOT_MS=100;

export async function startMatchServer({host='127.0.0.1',port=8787,seed,teamSize=5,target=50}={}){
  const match=new AuthoritativeMatch({seed,teamSize,target});
  const sockets=new Map();
  const http=createServer((request,response)=>{
    if(request.method!=='GET'||new URL(request.url,'http://localhost').pathname!=='/health'){
      response.writeHead(404).end('Not found');return;
    }
    response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    response.end(JSON.stringify({status:'ok',players:match.players.size,teamSize:match.teamSize,elapsed:match.elapsed,winner:match.winner}));
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  http.on('upgrade',(request,socket,head)=>{
    if(new URL(request.url,'http://localhost').pathname!=='/match'){
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');socket.destroy();return;
    }
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  });
  wss.on('connection',(socket,request)=>{
    const selected=new URL(request.url,'http://localhost').searchParams.get('team');
    const player=match.addPlayer(selected==='blue'||selected==='red'?selected:null);
    if(!player){socket.close(1013,'Match full or finished');return;}
    sockets.set(socket,player.id);
    socket.send(JSON.stringify({type:'welcome',id:player.id,team:player.team,seed:match.seed,teamSize:match.teamSize,target:match.target,tickRate:30}));
    socket.send(JSON.stringify(match.snapshot(player.id)));
    socket.on('message',data=>{
      let message;
      try{message=JSON.parse(data.toString());}catch{return;}
      if(message?.type==='input')match.submitInput(player.id,message);
    });
    socket.on('close',()=>{sockets.delete(socket);match.removePlayer(player.id);});
    socket.on('error',()=>{});
  });
  await new Promise((resolve,reject)=>{http.once('error',reject);http.listen(port,host,resolve);});
  const tick=setInterval(()=>{if(match.players.size)match.step(TICK_MS/1000);},TICK_MS);
  const broadcast=setInterval(()=>{
    for(const [socket,id] of sockets){
      if(socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>1_000_000)continue;
      const snapshot=match.snapshot(id);
      if(snapshot)socket.send(JSON.stringify(snapshot));
    }
  },SNAPSHOT_MS);
  return{
    match,http,wss,address:http.address(),
    async close(){
      clearInterval(tick);clearInterval(broadcast);
      for(const socket of sockets.keys())socket.terminate();
      await new Promise(resolve=>wss.close(resolve));
      await new Promise(resolve=>http.close(resolve));
    },
  };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const port=Number(process.env.MATCH_PORT)||8787;
  const host=process.env.MATCH_HOST||'127.0.0.1';
  const server=await startMatchServer({host,port});
  console.log(`The Lab match server listening on ws://${host}:${server.address.port}/match`);
  const shutdown=()=>server.close().then(()=>process.exit(0));
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}
