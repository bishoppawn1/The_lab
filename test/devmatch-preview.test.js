import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';
import { startPreviewServer } from '../scripts/server.js';
import { startRoomServer } from '../scripts/room-server.js';

function connect(url){
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(url),messages=[];
    socket.on('message',data=>messages.push(JSON.parse(data.toString())));
    socket.once('open',()=>resolve({socket,messages}));
    socket.once('error',reject);
  });
}
async function until(client,predicate){
  for(let i=0;i<80;i++){
    const message=client.messages.find(predicate);
    if(message)return message;
    await new Promise(done=>setTimeout(done,20));
  }
  assert.fail('Expected room message did not arrive');
}

for(const [name,start] of [['local preview',startPreviewServer],['standalone room server',startRoomServer]]){
  test(`${name} creates separate code-based lobbies and starts only when ready`,async()=>{
    const service=await start({port:0});
    const base=`http://127.0.0.1:${service.address.port}`;
    const clients=[];
    try{
      const create=async(teamSize,target)=>{
        const response=await fetch(`${base}/rooms`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamSize,target})});
        assert.equal(response.status,201);
        return response.json();
      };
      const first=await create(5,50),second=await create(10,100);
      assert.match(first.code,/^[A-Z2-9]{6}$/);
      assert.notEqual(first.code,second.code);
      assert.equal((await fetch(`${base}/rooms/${first.code}`).then(r=>r.json())).target,50);
      assert.equal((await fetch(`${base}/rooms/ZZZZZZ`)).status,404);
      const room=service.roomHub?.rooms.get(first.code)??service.hub.rooms.get(first.code);
      const blue=await connect(`ws://127.0.0.1:${service.address.port}/rooms/${first.code}?team=blue`);
      clients.push(blue);
      const red=await connect(`ws://127.0.0.1:${service.address.port}/rooms/${first.code}?team=red`);
      clients.push(red);
      const welcomeBlue=await until(blue,m=>m.type==='welcome');
      const welcomeRed=await until(red,m=>m.type==='welcome');
      assert.equal(welcomeBlue.team,'blue');
      assert.equal(welcomeRed.team,'red');
      assert.equal(welcomeBlue.code,first.code);
      assert.equal(room.match.players.size,2);
      assert.equal(room.match.elapsed,0,'the simulation waits in the lobby');
      red.socket.send(JSON.stringify({type:'lobby',action:'start'}));
      blue.socket.send(JSON.stringify({type:'lobby',action:'start'}));
      await until(blue,m=>m.type==='lobby-error');
      assert.equal(room.started,false,'a guest cannot start and unready players block the host');
      blue.socket.send(JSON.stringify({type:'lobby',action:'ready',ready:true}));
      red.socket.send(JSON.stringify({type:'lobby',action:'ready',ready:true}));
      await until(red,m=>m.type==='lobby'&&m.players.length===2&&m.players.every(p=>p.ready));
      blue.socket.send(JSON.stringify({type:'lobby',action:'start'}));
      await until(red,m=>m.type==='started');
      await until(red,m=>m.type==='snapshot');
      assert.equal(room.started,true);
      assert.equal((await fetch(`${base}/rooms/${first.code}`)).status,404,'started rooms reject new joins');
      assert.equal((service.roomHub?.rooms??service.hub.rooms).get(second.code).started,false,'other rooms remain in their own lobby');
      const closed=clients.map(client=>once(client.socket,'close'));
      red.socket.close();blue.socket.close();
      await Promise.all(closed);
      for(let i=0;i<20&&(service.roomHub?.rooms??service.hub.rooms).has(first.code);i++)await new Promise(done=>setTimeout(done,10));
      assert.equal((service.roomHub?.rooms??service.hub.rooms).has(first.code),false,'empty rooms are removed');
    }finally{
      for(const client of clients)client.socket.terminate();
      await service.close();
    }
  });
}

test('a waiting room transfers host to the next player',async()=>{
  const service=await startRoomServer({port:0});
  const base=`http://127.0.0.1:${service.address.port}`;
  const result=await fetch(`${base}/rooms`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({teamSize:5,target:50})}).then(r=>r.json());
  const first=await connect(`ws://127.0.0.1:${service.address.port}/rooms/${result.code}?team=blue`);
  const second=await connect(`ws://127.0.0.1:${service.address.port}/rooms/${result.code}?team=red`);
  try{
    const nextId=(await until(second,m=>m.type==='welcome')).id;
    first.socket.close();
    await new Promise(done=>first.socket.once('close',done));
    await until(second,m=>m.type==='lobby'&&m.hostId===nextId);
    assert.equal(service.hub.rooms.get(result.code).hostId,nextId);
  }finally{
    second.socket.terminate();
    await service.close();
  }
});
