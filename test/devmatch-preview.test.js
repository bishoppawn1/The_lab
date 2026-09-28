import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';
import { startPreviewServer } from '../scripts/server.js';

test('opening a local Dev Match starts the match server automatically',async()=>{
  const preview=await startPreviewServer({port:0});
  const base=`http://127.0.0.1:${preview.address.port}`;
  const create=async(settings)=>{
    const response=await fetch(`${base}/devmatch`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
    assert.equal(response.status,200);
    return response.json();
  };
  let socket;
  try{
    assert.equal(preview.matchServer,null);
    const first=await create({teamSize:10,target:100});
    assert.ok(preview.matchServer);
    assert.equal(first.teamSize,10);
    socket=new WebSocket(`${first.url}?team=red`);
    const [message]=await once(socket,'message');
    const welcome=JSON.parse(message.toString());
    assert.equal(welcome.type,'welcome');
    assert.equal(welcome.team,'red');
    const reused=await create({teamSize:5,target:50});
    assert.equal(reused.url,first.url,'another player joins the running match');
    socket.close();
    await once(socket,'close');
    const old=preview.matchServer;
    const next=await create({teamSize:5,target:50});
    assert.notEqual(preview.matchServer,old,'a new match replaces the empty one');
    assert.equal(next.teamSize,5);
  }finally{
    socket?.terminate();
    await preview.close();
  }
});
