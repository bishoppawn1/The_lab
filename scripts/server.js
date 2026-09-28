import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMatchServer } from './match-server.js';

const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};

export async function startPreviewServer({port=Number(process.env.PORT)||5174}={}){
  let matchServer=null,pendingMatch=null;
  const getMatch=async(settings)=>{
    if(pendingMatch)return pendingMatch;
    if(matchServer?.match.players.size&&!matchServer.match.winner)return matchServer;
    pendingMatch=(async()=>{
      if(matchServer)await matchServer.close();
      matchServer=await startMatchServer({port:0,teamSize:settings.teamSize,target:settings.target});
      return matchServer;
    })();
    try{return await pendingMatch;}finally{pendingMatch=null;}
  };
  const server=createServer(async(request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/devmatch'&&request.method==='POST'){
      try{
        let body='';
        for await(const chunk of request){body+=chunk;if(body.length>1024)throw new Error('Request too large');}
        const settings=JSON.parse(body);
        if(![5,10].includes(settings.teamSize)||![50,100,250].includes(settings.target))throw new Error('Invalid match settings');
        const active=await getMatch(settings);
        response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        response.end(JSON.stringify({url:`ws://127.0.0.1:${active.address.port}/match`,teamSize:active.match.teamSize,target:active.match.target}));
      }catch(error){response.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify({error:error.message}));}
      return;
    }
    try{
      let pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      let file=join(root,normalize(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root)){response.writeHead(403).end('Forbidden');return;}
      if((await stat(file)).isDirectory())file=join(file,'index.html');
      response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});
      response.end(await readFile(file));
    }catch{response.writeHead(404,{'Content-Type':'text/plain'});response.end('Not found');}
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,done);});
  return{server,address:server.address(),get matchServer(){return matchServer;},async close(){if(matchServer)await matchServer.close();await new Promise(done=>server.close(done));}};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const preview=await startPreviewServer();
  console.log(`The Lab preview runs at http://127.0.0.1:${preview.address.port}`);
  const shutdown=()=>preview.close().then(()=>process.exit(0));
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
}
