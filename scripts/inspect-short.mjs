import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { loadProject, createOfflineRenderer } from '@aether-fx/node';
import { evaluate, applyPatch, compile, serializeDocument } from '@aether-fx/core';
const loaded=await loadProject('fixtures/short/little-light.afx');assert(loaded.ok,JSON.stringify(loaded));
const {plan,assets}=loaded.value,output='artifacts/short';await mkdir(output,{recursive:true});
const renderer=await createOfflineRenderer(plan,assets);let patchedRenderer;
const decode=bytes=>{const decoded=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:bytes,maxBuffer:8*1024*1024});assert.equal(decoded.status,0,decoded.stderr.toString());assert.equal(decoded.stdout.length,1280*720*4);return decoded.stdout;};
function checkHeadTorso(bytes,draw){
  const pixels=decode(bytes),head=draw.commands.find(c=>c.id==='hero.head');assert(head);
  const palette=[[237,182,142],[241,185,85],[88,143,145]];let checked=0;
  for(const x of [-6,0,6])for(let y=-65;y<=0;y++){
    const px=Math.round(head.matrix[0]*x+head.matrix[2]*y+head.matrix[4]),py=Math.round(head.matrix[1]*x+head.matrix[3]*y+head.matrix[5]);
    assert(px>=0&&px<1280&&py>=0&&py<720);const at=(py*1280+px)*4;
    const rgb=[...pixels.subarray(at,at+3)];
    const painted=palette.some(a=>palette.some(b=>{const delta=b.map((v,i)=>v-a[i]),length=delta.reduce((sum,v)=>sum+v*v,0),t=length?Math.max(0,Math.min(1,rgb.reduce((sum,v,i)=>sum+(v-a[i])*delta[i],0)/length)):0;return rgb.every((v,i)=>Math.abs(v-a[i]-t*delta[i])<=2);}));
    assert(painted,`Head–torso gap at ${px},${py}`);checked++;
  }
  return checked;
}
try{
  const frames=[0,97,144,174,204,274,384,479];
  const headTorso=[];
  for(let i=0;i<frames.length;i++){const frame=frames[i],draw=evaluate(plan,{frame});assert.deepEqual(await renderer.evaluateFrame(frame),draw);const bytes=await renderer.captureFrame(frame);headTorso.push({frame,checkedPixels:checkHeadTorso(bytes,draw)});await writeFile(`${output}/reference-${String(i).padStart(2,'0')}.png`,bytes);}
  const disconnected=structuredClone(plan.document);disconnected.parts.find(p=>p.id==='neck').transform.visible=false;
  const disconnectedPlan=compile(disconnected,plan.manifest);assert(disconnectedPlan.ok,JSON.stringify(disconnectedPlan));
  const negativeRenderer=await createOfflineRenderer(disconnectedPlan.value,assets);
  try{const bytes=await negativeRenderer.captureFrame(0);assert.throws(()=>checkHeadTorso(bytes,evaluate(disconnectedPlan.value,{frame:0})),/Head–torso gap/);}finally{await negativeRenderer.dispose();}
  await writeFile(`${output}/head-torso-report.json`,JSON.stringify({checks:{connectedAtStartPosesAndEnd:'PASS',missingNeckRejected:'PASS'},frames:headTorso,method:'Three character-local vertical pixel corridors from chin to torso; actual Chromium pixels must be skin, collar, shirt or their antialiased edge mixtures (RGB tolerance 2). Hiding the bridge must fail.'},null,2)+'\n');
  const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','1','-i',`${output}/reference-%02d.png`,'-vf','scale=640:360,tile=4x2','-frames:v','1',`${output}/contact-sheet.png`],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  await writeFile(`${output}/references.json`,JSON.stringify({frames,chromium:renderer.browserVersion,assets:assets.manifest,blockedRequests:renderer.blockedRequests},null,2)+'\n');
  const shot=plan.document.shots.find(s=>s.id==='keep'),index=shot.morphs.findIndex(m=>m.id==='expression'),morph=shot.morphs[index];
  const patch=applyPatch(plan.document,{baseRevision:plan.document.revision,operations:[{op:'updateProperty',collection:'shots',id:'keep',path:['morphs',String(index),'start'],value:morph.start-6},{op:'updateProperty',collection:'shots',id:'keep',path:['morphs',String(index),'end'],value:morph.end-6}]},plan.manifest);assert(patch.ok,JSON.stringify(patch));
  const changed=compile(patch.value.document,plan.manifest);assert(changed.ok,JSON.stringify(changed));
  patchedRenderer=await createOfflineRenderer(changed.value,assets);
  const comparisons=[];
  for(const frame of [341,348,384,402,408,479]){
    const before=await renderer.captureFrame(frame),after=await patchedRenderer.captureFrame(frame);
    assert.deepEqual(await patchedRenderer.evaluateFrame(frame),evaluate(changed.value,{frame}));
    await writeFile(`${output}/patch-before-${frame}.png`,before);await writeFile(`${output}/patch-after-${frame}.png`,after);
    const a=decode(before),b=decode(after),mouth=evaluate(changed.value,{frame}).commands.find(c=>c.id==='hero.mouth'),points=[mouth.shape.contours[0].start,...mouth.shape.contours.flatMap(c=>c.segments.flatMap(s=>[s.control1,s.control2,s.end]))].map(([x,y])=>[mouth.matrix[0]*x+mouth.matrix[2]*y+mouth.matrix[4],mouth.matrix[1]*x+mouth.matrix[3]*y+mouth.matrix[5]]);
    const bounds=[Math.floor(Math.min(...points.map(p=>p[0])))-8,Math.floor(Math.min(...points.map(p=>p[1])))-8,Math.ceil(Math.max(...points.map(p=>p[0])))+8,Math.ceil(Math.max(...points.map(p=>p[1])))+8];
    let pixels=0;for(let at=0;at<a.length;at+=4)if(!a.subarray(at,at+4).equals(b.subarray(at,at+4))){pixels++;const x=at/4%1280,y=Math.floor(at/4/1280);assert(x>=bounds[0]&&x<=bounds[2]&&y>=bounds[1]&&y<=bounds[3],`Patch changed a pixel outside mouth at ${x},${y}`);}
    if(frame<342||frame>=408)assert.equal(pixels,0);else assert(pixels>0);
    comparisons.push({frame,changedPixels:pixels,mouthBounds:bounds});
  }
  await writeFile(`${output}/expression-patch.json`,serializeDocument(patch.value.document)+'\n');
  await writeFile(`${output}/patch-report.json`,JSON.stringify({checks:{sixFramesEarlier:'PASS',realChromiumRendering:'PASS',outsideIntervalIdenticalPixels:'PASS',changedPixelsWithinMouth:'PASS'},oldInterval:[348,408],newInterval:[342,402],affectedIds:patch.value.affectedIds,dependencies:patch.value.dependencies,comparisons,chromium:renderer.browserVersion},null,2)+'\n');
  console.log(JSON.stringify({frames,contactSheet:output+'/contact-sheet.png',chromium:renderer.browserVersion}));
}finally{await patchedRenderer?.dispose();await renderer.dispose();}
