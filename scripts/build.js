import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('index.html', root), new URL('index.html', out));
await cp(new URL('styles.css', root), new URL('styles.css', out));
await cp(new URL('room-config.js', root), new URL('room-config.js', out));
await cp(new URL('src/', root), new URL('src/', out), { recursive: true });
const stamp = Date.now().toString(36);
const configured=(process.env.PUBLIC_ROOM_SERVER_URL||'').trim();
let serviceOrigin='';
if(configured){
  const endpoint=new URL(configured);
  if(endpoint.protocol!=='https:'||endpoint.pathname!=='/'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)throw new Error('PUBLIC_ROOM_SERVER_URL must be an HTTPS origin');
  serviceOrigin=endpoint.origin;
}
await writeFile(new URL('room-config.js',out),`window.THE_LAB_ROOM_SERVER_URL=${JSON.stringify(serviceOrigin)};\n`);
const htmlPath = new URL('index.html', out);
let html = await readFile(htmlPath, 'utf8');
html = html.replace(/\.\/styles\.css(?:\?v=[^\"']*)?/, `./styles.css?v=${stamp}`).replace(/\.\/room-config\.js(?:\?v=[^\"']*)?/, `./room-config.js?v=${stamp}`).replace(/\.\/src\/app\.js(?:\?v=[^\"']*)?/, `./src/app.js?v=${stamp}`);
await writeFile(htmlPath, html);
console.log(`Built static game in dist/ (${stamp}).`);
