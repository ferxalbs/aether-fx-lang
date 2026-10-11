import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPreviewServer } from '../examples/browser/serve.mjs';
const server=await startPreviewServer(),browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1320,height:1000}}),errors=[];page.on('pageerror',cause=>errors.push(cause.message));
  await page.addInitScript(()=>{
    const Native=window.AudioContext;window.audioEvidence={contexts:[],starts:[],stops:0,disconnects:0};
    window.AudioContext=class extends Native {
      constructor(...args){super(...args);window.audioEvidence.contexts.push(this);}
      createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source),stop=source.stop.bind(source),disconnect=source.disconnect.bind(source);source.start=(when,offset,duration)=>{window.audioEvidence.starts.push({when,offset,duration,rate:source.playbackRate.value});return start(when,offset,duration);};source.stop=(...args)=>{window.audioEvidence.stops++;return stop(...args);};source.disconnect=(...args)=>{window.audioEvidence.disconnects++;return disconnect(...args);};return source;}
    };
  });
  await page.goto(server.url);await page.waitForFunction(()=>!!window.preview);
  const loaded=await page.evaluate(()=>({images:window.preview.resources.images.size,fonts:window.preview.resources.fonts.size,audio:window.preview.resources.audio.size,duration:window.preview.resources.audio.get('score').duration,sampleRate:window.preview.resources.audio.get('score').sampleRate,channels:window.preview.resources.audio.get('score').numberOfChannels,contexts:window.audioEvidence.contexts.length}));
  assert.deepEqual(loaded,{images:1,fonts:1,audio:1,duration:20,sampleRate:48000,channels:2,contexts:0});
  await page.click('#play');await page.waitForFunction(()=>window.preview.player.getCurrentFrame()>=5);
  await page.click('#pause');
  const pause=await page.evaluate(async()=>{const p=window.preview.player,frame=p.getCurrentFrame();await new Promise(resolve=>setTimeout(resolve,120));return {frame,later:p.getCurrentFrame(),stops:window.audioEvidence.stops,disconnected:window.audioEvidence.disconnects};});assert.equal(pause.frame,pause.later);assert(pause.stops>0&&pause.disconnected>0);
  await page.evaluate(()=>window.preview.player.seekFrame(168));await page.click('#play');
  const seek=await page.evaluate(()=>window.audioEvidence.starts.at(-1));assert.equal(seek.offset,7);assert.equal(seek.duration,13);
  await page.selectOption('#rate','2');const rate=await page.evaluate(()=>window.audioEvidence.starts.at(-1));assert.equal(rate.rate,2);
  const suspended=await page.evaluate(async()=>{const context=window.audioEvidence.contexts[0],p=window.preview.player;await context.suspend();const frame=p.getCurrentFrame();await new Promise(resolve=>setTimeout(resolve,150));const after=p.getCurrentFrame();await context.resume();return {frame,after};});assert.equal(suspended.frame,suspended.after);
  await page.click('#pause');
  const beforeDispose=await page.evaluate(()=>({fonts:document.fonts.size,starts:window.audioEvidence.starts.length,contexts:window.audioEvidence.contexts.length}));assert.equal(beforeDispose.contexts,1);
  await page.evaluate(()=>window.preview.dispose());await page.waitForFunction(()=>window.audioEvidence.contexts[0].state==='closed');
  const disposed=await page.evaluate(()=>({images:window.preview.resources.images.size,fonts:window.preview.resources.fonts.size,audio:window.preview.resources.audio.size,documentFonts:document.fonts.size,state:window.audioEvidence.contexts[0].state}));
  assert.deepEqual(disposed,{images:0,fonts:0,audio:0,documentFonts:0,state:'closed'});
  assert.deepEqual(errors,[]);
  const failures=await page.evaluate(async()=>{
    const {loadResources,deserializePlan}=await import('/main.js'),result=deserializePlan(await(await fetch('/plan.json')).text());if(!result.ok)throw new Error(JSON.stringify(result));
    const plan=result.value,fetchAsset=async asset=>(await fetch('/assets/'+asset.id)).arrayBuffer();
    let integrity=false,aborted=false,closed=0;
    const nativeClose=ImageBitmap.prototype.close;ImageBitmap.prototype.close=function(){closed++;return nativeClose.call(this);};
    try{await loadResources(plan,async asset=>asset.id==='paper'?new Uint8Array([1]).buffer:fetchAsset(asset));}catch(cause){integrity=String(cause).includes('integrity mismatch');}
    const afterIntegrity=document.fonts.size;
    const controller=new AbortController();
    try{await loadResources(plan,async asset=>{const bytes=await fetchAsset(asset);if(asset.id==='score')controller.abort();return bytes;},controller.signal);}catch(cause){aborted=cause.name==='AbortError';}
    ImageBitmap.prototype.close=nativeClose;
    return {integrity,aborted,closed,afterIntegrity,afterAbort:document.fonts.size};
  });
  assert.deepEqual(failures,{integrity:true,aborted:true,closed:1,afterIntegrity:0,afterAbort:0});
  const report={chromium:browser.version(),checks:{realImageFontWav:'PASS',gestureBeforeAudioContext:'PASS',pauseSeekRate:'PASS',audioClockSuspension:'PASS',resourceDispose:'PASS',integrityAndCancellationCleanup:'PASS'},loaded,pause,seek,rate,suspended,beforeDispose,disposed,failures,physicalOutputLatency:'Not measured; preview is tied to the monotonic AudioContext timeline.'};
  await writeFile('artifacts/short/resources-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await server.close();}
