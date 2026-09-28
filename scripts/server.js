import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoomHub } from './room-server.js';

const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};

export async function startPreviewServer({port=Number(process.env.PORT)||5174}={}){
  let roomHub;
  const server=createServer(async(request,response)=>{
    if(await roomHub.handleRequest(request,response))return;
    try{
      let pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      let file=join(root,normalize(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root)){response.writeHead(403).end('Forbidden');return;}
      if((await stat(file)).isDirectory())file=join(file,'index.html');
      response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});
      response.end(await readFile(file));
    }catch{response.writeHead(404,{'Content-Type':'text/plain'});response.end('Not found');}
  });
  roomHub=createRoomHub(server);
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,done);});
  return{server,address:server.address(),roomHub,async close(){await roomHub.close();await new Promise(done=>server.close(done));}};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const preview=await startPreviewServer();
  console.log(`The Lab preview runs at http://127.0.0.1:${preview.address.port}`);
  const shutdown=()=>preview.close().then(()=>process.exit(0));
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}
