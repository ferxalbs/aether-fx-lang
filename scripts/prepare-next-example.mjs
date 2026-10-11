import { mkdir, cp, readFile, writeFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadProject } from '@aether-fx/node';
import { loadReleaseArchives } from './release-archives.mjs';
import { packageOrder } from './release-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function prepareNextExample(destination=join(root,'examples/next-app'),options={}) {
  destination=await realpath(destination);
  const output=options.output ? resolve(options.output) : join(root,'artifacts/next-packages');await mkdir(output,{recursive:true});
  const run=(command,args,cwd)=>{const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});assert.equal(result.status,0,`${command}: ${result.error??result.stderr}\n${result.stdout}`);return result.stdout;};
  const tarballs=options.archiveDirectory ? await loadReleaseArchives(options.archiveDirectory,root) : [];
  if(!options.archiveDirectory)for(const name of packageOrder){
    const dry=JSON.parse(run('npm',['pack','--dry-run','--json'],join(root,'packages',name)))[0];assert(!dry.files.some(f=>f.path.startsWith('src/')||f.path.includes('node_modules')||f.path.endsWith('.tgz')));
    const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',output],join(root,'packages',name)))[0],path=join(output,packed.filename),bytes=await readFile(path);tarballs.push({name:`@aether-fx/${name}`,path,sha256:createHash('sha256').update(bytes).digest('hex'),files:dry.files.map(f=>f.path)});
  }
  if(resolve(destination)!==resolve(join(root,'examples/next-app')))await cp(join(root,'examples/next-app'),destination,{recursive:true,filter:path=>!/(?:^|\/)(node_modules|\.next|project|public|package-lock\.json|[^/]+\.tsbuildinfo)(?:\/|$)/.test(path)});
  await cp(join(root,'fixtures/short'),join(destination,'project'),{recursive:true});await mkdir(join(destination,'public/assets'),{recursive:true});
  const loaded=await loadProject(join(destination,'project/little-light.afx'));assert(loaded.ok);
  for(const [id,file] of loaded.value.assets.files)await writeFile(join(destination,'public/assets',id),file.bytes);
  const manifest=await readFile(join(destination,'package.json'),'utf8');
  try{run('npm',['install','--ignore-scripts','--no-audit','--no-fund',...tarballs.map(t=>relative(destination,t.path))],destination);}finally{await writeFile(join(destination,'package.json'),manifest);}
  await writeFile(join(output,'SHA256SUMS'),tarballs.map(t=>`${t.sha256}  ${t.path.split('/').at(-1)}`).join('\n')+'\n');
  return {root,destination,output,tarballs,project:loaded.value};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await prepareNextExample();console.log(JSON.stringify({prepared:result.destination,tarballs:result.tarballs.map(t=>t.name)},null,2));}
