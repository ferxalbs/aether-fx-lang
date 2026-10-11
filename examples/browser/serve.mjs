import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { loadProject } from '@aether-fx/node';
import { serializePlan } from '@aether-fx/core';
export async function startPreviewServer(path='fixtures/short/little-light.afx',port=0){
  const loaded=await loadProject(path);if(!loaded.ok)throw new Error(JSON.stringify(loaded.diagnostics));
  const built=await build({entryPoints:[fileURLToPath(new URL('./main.ts',import.meta.url))],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false});
  const routes=new Map([['/',{type:'text/html',bytes:await readFile(new URL('./index.html',import.meta.url))}],['/main.js',{type:'text/javascript',bytes:built.outputFiles[0].contents}],['/plan.json',{type:'application/json',bytes:serializePlan(loaded.value.plan)}]]);
  for(const [id,file]of loaded.value.assets.files)routes.set('/assets/'+id,{type:'application/octet-stream',bytes:file.bytes});
  const server=createServer((request,response)=>{const route=routes.get(request.url);if(!route||!['GET','HEAD'].includes(request.method)){response.writeHead(404);response.end();return;}response.setHeader('Content-Type',route.type);response.setHeader('Cache-Control','no-store');response.end(request.method==='HEAD'?undefined:route.bytes);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}`,project:loaded.value,close:()=>new Promise((resolve,reject)=>{server.close(cause=>cause?reject(cause):resolve());server.closeAllConnections();})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=await startPreviewServer(process.argv[2],Number(process.env.PORT??3000));console.log(server.url);}
