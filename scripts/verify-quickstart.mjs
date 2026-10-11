import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadReleaseArchives } from './release-archives.mjs';
const archives=await loadReleaseArchives('artifacts/metadata-packages'),directory=await mkdtemp(join(tmpdir(),'afx-quickstart-'));
const run=(command,args)=>{const r=spawnSync(command,args,{cwd:directory,encoding:'utf8',timeout:180000});assert.equal(r.status,0,r.error??r.stderr);return r.stdout;};
try{run('npm',['install','--no-audit','--no-fund',...archives.map(a=>a.path)]);const docs=await readFile('docs/quickstart.md','utf8'),match=docs.match(/printf '([^']+)' > hello\.afx/);assert(match);await writeFile(join(directory,'hello.afx'),match[1]);const report=JSON.parse(run(join(directory,'node_modules/.bin/afx'),['render','hello.afx','--out','hello.webm']));assert.equal(report.frames,48);assert.equal(report.backend,'native');assert.equal(report.chromium,'none');const probe=JSON.parse(run('ffprobe',['-v','error','-count_frames','-show_streams','-of','json','hello.webm']));assert.equal(probe.streams[0].nb_read_frames,'48');await mkdir('.work/aether-fx/quickstart',{recursive:true});await writeFile('.work/aether-fx/quickstart/report.json',JSON.stringify({date:new Date().toISOString(),node:process.version,tarballs:archives,steps:['npm install exact seven archives','write documented source','afx render hello.afx --out hello.webm'],report,status:'PASS'},null,2)+'\n');console.log('Clean quickstart PASS');}finally{await rm(directory,{recursive:true,force:true});}
