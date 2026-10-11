import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, lstat, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadProject } from '@aether-fx/node';
import { evaluate } from '@aether-fx/core';
const root=process.cwd(),out=resolve('artifacts/node-packages'),consumer=await mkdtemp(join(tmpdir(),'afx node consumer '));await mkdir(out,{recursive:true});
const run=(command,args,cwd=root)=>{const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});assert.equal(r.status,0,`${command}: ${r.error??r.stderr}\n${r.stdout}`);return r.stdout;};
try {
  const tarballs=[];
  for(const name of ['core','compiler','canvas','node','cli']){
    const directory=join(root,'packages',name),dry=JSON.parse(run('npm',['pack','--dry-run','--json'],directory))[0];assert(!dry.files.some(f=>f.path.startsWith('src/')||f.path.includes('node_modules')||f.path.endsWith('.tgz')));assert(dry.files.some(f=>f.path==='README.md'));
    const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',out],directory))[0],path=join(out,packed.filename),bytes=await readFile(path);tarballs.push({name:`@aether-fx/${name}`,path,sha256:createHash('sha256').update(bytes).digest('hex'),files:dry.files.map(f=>f.path)});
  }
  await writeFile(join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));run('npm',['install','--ignore-scripts','--no-audit','--no-fund',...tarballs.map(t=>t.path),'@types/node@26.6.5'],consumer);
  for(const t of tarballs){const dir=join(consumer,'node_modules',t.name);assert(!(await lstat(dir)).isSymbolicLink());const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));assert.equal(pkg.version,'0.1.0');assert(!Object.values(pkg.dependencies??{}).some(v=>/^(workspace:|file:)/.test(v)));for(const key of ['types','import'])await lstat(join(dir,pkg.exports['.'][key]));}
  await cp(join(root,'fixtures/short'),join(consumer,'project with spaces'),{recursive:true});
  await writeFile(join(consumer,'consumer.ts'),`import {loadProject,exportVideo,createOfflineRenderer,doctor,type ExportReport} from '@aether-fx/node';import {doctor as cliDoctor} from '@aether-fx/cli';async function check(){const loaded=await loadProject('project with spaces/little-light.afx');if(loaded.ok){const report:ExportReport=await exportVideo(loaded.value,{output:'short.webm',width:320,height:180});const renderer=await createOfflineRenderer(loaded.value.plan,loaded.value.assets);const bytes:Buffer=await renderer.captureFrame(0);await renderer.dispose();}return cliDoctor();}`);
  await writeFile(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',noEmit:true,skipLibCheck:false,types:['node']},files:['consumer.ts']}));run(join(root,'node_modules/.bin/tsc'),['-p',join(consumer,'tsconfig.json')],consumer);
  const loaded=await loadProject('fixtures/short/little-light.afx');assert(loaded.ok);const expected=createHash('sha256').update(JSON.stringify(Array.from({length:480},(_,frame)=>evaluate(loaded.value.plan,{frame})))).digest('hex');
  await writeFile(join(consumer,'verify.mjs'),`import {loadProject} from '@aether-fx/node';import {evaluate} from '@aether-fx/core';import {createHash} from 'node:crypto';const r=await loadProject('project with spaces/little-light.afx');if(!r.ok)throw new Error(JSON.stringify(r));const hash=createHash('sha256').update(JSON.stringify(Array.from({length:480},(_,frame)=>evaluate(r.value.plan,{frame})))).digest('hex');if(hash!==${JSON.stringify(expected)})throw new Error('Isolated semantic mismatch');console.log('NODE_PASS');`);assert.match(run(process.execPath,['verify.mjs'],consumer),/NODE_PASS/);
  const bin=join(consumer,'node_modules/.bin/afx'),fixture='project with spaces/little-light.afx';assert(JSON.parse(run(bin,['doctor'],consumer)).ok);assert.equal(JSON.parse(run(bin,['check',fixture],consumer)).duration,480);
  run(bin,['compile',fixture,'--out','plan with spaces.json'],consumer);const plan=JSON.parse(await readFile(join(consumer,'plan with spaces.json'),'utf8'));assert.equal(plan.duration,480);
  const exportReport=JSON.parse(run(bin,['render',fixture,'--out','video with spaces.webm','--width','320','--height','180'],consumer));assert.equal(exportReport.frames,480);assert.equal(exportReport.queueCapacity,1);assert.deepEqual(exportReport.blockedRequests,[]);
  const metadata=JSON.parse(run('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',exportReport.output],consumer));assert.equal(metadata.streams.find(s=>s.codec_type==='video').nb_read_frames,'480');assert.equal(metadata.streams.find(s=>s.codec_type==='audio').codec_name,'opus');
  const checks={fiveRealTarballs:'PASS',isolatedImportsAndAll480Frames:'PASS',publicDeclarations:'PASS',cliExecutable:'PASS',doctorCheckCompile:'PASS',cliChromiumFfmpegRender:'PASS',pathsWithSpaces:'PASS'};
  await writeFile(join(out,'report.json'),JSON.stringify({node:process.version,checks,tarballs,exportReport,limitations:['Five-package milestone; React/export and full seven-package distribution remain pending','Publication LICENSE/identity metadata remains pending']},null,2)+'\n');await writeFile(join(out,'SHA256SUMS'),tarballs.map(t=>`${t.sha256}  ${t.path.split('/').at(-1)}`).join('\n')+'\n');console.log(JSON.stringify({checks,report:join(out,'report.json')},null,2));
}finally{await rm(consumer,{recursive:true,force:true});}
