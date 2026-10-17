import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname,relative,sep,extname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../tools/platform-observatory/dist');
const port=Number(process.env.OBSERVATORY_PORT??4188);
if(!Number.isInteger(port)||port<1024||port>65535) throw new Error('OBSERVATORY_PORT must be 1024–65535.');
const types={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const target=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  const rel=relative(root,target);
  if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)){res.writeHead(403).end();return;}
  const info=await stat(target);if(!info.isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[extname(target)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:await readFile(target));
 }catch{res.writeHead(404).end('Not found. Build the observatory before starting the server.');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is in use. Keep the existing preview or choose OBSERVATORY_PORT.`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Platform observatory: http://127.0.0.1:${port}/ (local only)`));
