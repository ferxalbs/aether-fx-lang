import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { loadProject, createOfflineRenderer } from '@aether-fx/node';
import { evaluate } from '@aether-fx/core';
const loaded=await loadProject('fixtures/short/little-light.afx');assert(loaded.ok,JSON.stringify(loaded));
const {plan,assets}=loaded.value,output='artifacts/short';await mkdir(output,{recursive:true});
const renderer=await createOfflineRenderer(plan,assets);
try{
  const frames=[0,97,144,174,204,274,384,479];
  for(let i=0;i<frames.length;i++){const frame=frames[i];assert.deepEqual(await renderer.evaluateFrame(frame),evaluate(plan,{frame}));await writeFile(`${output}/reference-${String(i).padStart(2,'0')}.png`,await renderer.captureFrame(frame));}
  const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','1','-i',`${output}/reference-%02d.png`,'-vf','scale=640:360,tile=4x2','-frames:v','1',`${output}/contact-sheet.png`],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  await writeFile(`${output}/references.json`,JSON.stringify({frames,chromium:renderer.browserVersion,assets:assets.manifest,blockedRequests:renderer.blockedRequests},null,2)+'\n');
  console.log(JSON.stringify({frames,contactSheet:output+'/contact-sheet.png',chromium:renderer.browserVersion}));
}finally{await renderer.dispose();}
