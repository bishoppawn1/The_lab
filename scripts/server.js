import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.cwd();
const port = Number(process.env.PORT) || 5174;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=join(root,normalize(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root)){res.writeHead(403).end('Forbidden');return;}if((await stat(file)).isDirectory())file=join(file,'index.html');res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}}).listen(port,()=>console.log(`The Lab preview runs at http://127.0.0.1:${port}`));
