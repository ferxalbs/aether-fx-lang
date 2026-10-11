import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { platform, release } from 'node:os';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { compile, evaluate } from '@aether-fx/core';
import { compileSource } from '@aether-fx/compiler';
import { startPreviewServer } from '../examples/browser/serve.mjs';
import { measureBrowserBundles } from './verify-bundle-budgets.mjs';

const out=resolve('artifacts/performance');await mkdir(out,{recursive:true});
const source=await readFile('fixtures/short/little-light.afx','utf8');
const server=await startPreviewServer(),{plan,assets}=server.project;
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
const stats=values=>({samples:values.length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),maxMs:Math.max(...values)});
const measure=(fn,warmup=10,count=100)=>{for(let i=0;i<warmup;i++)assert(fn().ok);const samples=[];for(let i=0;i<count;i++){const start=performance.now();assert(fn().ok);samples.push(performance.now()-start);}return stats(samples);};
const nodeCompile={source:measure(()=>compileSource(source,assets.manifest)),canonical:measure(()=>compile(plan.document,assets.manifest))};
const sysctl=name=>{const r=spawnSync('sysctl',['-n',name],{encoding:'utf8'});return r.status===0?r.stdout.trim():null;};
const host={os:platform(),release:release(),node:process.version,model:sysctl('hw.model'),cpu:sysctl('machdep.cpu.brand_string'),physicalCores:sysctl('hw.physicalcpu'),logicalCores:sysctl('hw.logicalcpu'),ramBytes:sysctl('hw.memsize')};
const bundles=await measureBrowserBundles();
const auxiliary=await build({stdin:{contents:"export {compileSource} from '@aether-fx/compiler';export {createPlayer} from '@aether-fx/canvas';",resolveDir:process.cwd(),sourcefile:'benchmark.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',write:false});
let browser,memoryTimer,deadline;
const memory=[],memoryErrors=[];
function sampleMemory(phase){
  // Numeric ps fields only; retain the coordinator and its own descendant processes.
  const r=spawnSync('ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8',timeout:2000});
  if(r.status!==0){memoryErrors.push(String(r.error??r.stderr));return;}
  const rows=r.stdout.trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
  const owned=new Set([process.pid]);let added=true;
  while(added){added=false;for(const [pid,parent]of rows)if(owned.has(parent)&&!owned.has(pid)){owned.add(pid);added=true;}}
  // Exclude the sampling ps process, which is not part of preview rendering.
  const processes=rows.filter(([pid])=>owned.has(pid)&&pid!==r.pid).map(([pid,parent,rssKiB])=>({pid,parent,rssBytes:rssKiB*1024}));
  memory.push({seconds:performance.now()/1000,phase,totalRssBytes:processes.reduce((sum,p)=>sum+p.rssBytes,0),processes});
}
try {
  deadline=setTimeout(()=>{console.error('Benchmark exceeded its 180-second deadline');void browser?.close();},180000);
  browser=await chromium.launch({headless:false});
  const browserVersion=browser.version();
  const page=await browser.newPage({viewport:{width:1344,height:1000},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(server.url+'/benchmark.js',route=>route.fulfill({contentType:'text/javascript',body:Buffer.from(auxiliary.outputFiles[0].contents)}));
  await page.addInitScript(({commands})=>{
    const nativeRAF=window.requestAnimationFrame,clear=CanvasRenderingContext2D.prototype.clearRect,restore=CanvasRenderingContext2D.prototype.restore;
    window.previewBenchmark={firstFrame:null,firstStart:null,restores:0,phase:null,frames:[],raf:[],lastRaf:null,visibility:[]};
    const audit=window.previewBenchmark;
    CanvasRenderingContext2D.prototype.clearRect=function(...args){if(audit.firstStart===null)audit.firstStart=performance.now();return clear.apply(this,args);};
    CanvasRenderingContext2D.prototype.restore=function(...args){const result=restore.apply(this,args);if(audit.firstStart!==null&&audit.firstFrame===null&&++audit.restores===commands)audit.firstFrame=performance.now()-audit.firstStart;return result;};
    document.addEventListener('visibilitychange',()=>audit.visibility.push({state:document.visibilityState,time:performance.now()}));
    window.requestAnimationFrame=callback=>nativeRAF(time=>{
      const player=window.preview?.player,watch=player&&audit.phase!==null;
      const before=watch?player.getStats().renderedFrames:0,start=performance.now();
      callback(time);const elapsed=performance.now()-start;
      if(watch){
        if(time!==audit.lastRaf){audit.raf.push({phase:audit.phase,time});audit.lastRaf=time;}
        const after=player.getStats().renderedFrames;
        if(after>before)audit.frames.push({phase:audit.phase,time,elapsed,frame:player.getCurrentFrame()});
      }
    });
  },{commands:evaluate(plan,{frame:0}).commands.length});
  const navigationStart=performance.now();await page.goto(server.url);await page.waitForFunction(()=>!!window.preview);
  const startupMs=performance.now()-navigationStart;
  await page.evaluate(()=>preview.player.resize(1280,720,1));
  const setup=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height],dpr:devicePixelRatio,visibility:document.visibilityState,firstFrameMs:previewBenchmark.firstFrame,firstDrawStartMs:previewBenchmark.firstStart}));
  assert.deepEqual(setup.canvas,[1280,720]);assert.equal(setup.dpr,1);assert.equal(setup.visibility,'visible');assert.equal(typeof setup.firstFrameMs,'number');
  console.log('Visible browser and real assets ready; measuring compile/first-frame/seek');
  const timings=await page.evaluate(async({source,manifest})=>{
    const {compileSource,createPlayer}=await import('/benchmark.js'),samples=[];
    for(let i=0;i<10;i++){const r=compileSource(source,manifest);if(!r.ok)throw new Error(JSON.stringify(r));}
    for(let i=0;i<100;i++){const start=performance.now(),r=compileSource(source,manifest);samples.push(performance.now()-start);if(!r.ok)throw new Error(JSON.stringify(r));}
    const result=compileSource(source,manifest);if(!result.ok)throw new Error(JSON.stringify(result));
    const canvas=document.querySelector('canvas'),firstFrames=[];
    for(let i=0;i<30;i++){await new Promise(requestAnimationFrame);const start=performance.now(),p=createPlayer(canvas,result.value,preview.resources);firstFrames.push(performance.now()-start);p.dispose();}
    const seeks=[];
    for(let i=0;i<120;i++){
      await new Promise(requestAnimationFrame);
      const frame=i*137%480,start=performance.now();preview.player.seekFrame(frame);seeks.push(performance.now()-start);
    }
    return {compile:samples,firstFrames,seeks};
  },{source,manifest:assets.manifest});
  // Avoid repeated pixel readbacks, which can change Chromium's Canvas backing strategy.
  await page.evaluate(()=>preview.player.seekFrame(0));
  await page.locator('canvas').screenshot({path:resolve(out,'visible-start.png')});
  const plays=[];let currentPhase='idle';sampleMemory(currentPhase);
  memoryTimer=setInterval(()=>sampleMemory(currentPhase),500);
  for(let pass=0;pass<3;pass++){
    currentPhase='play-'+pass;
    await page.evaluate(phase=>{preview.player.seekFrame(0);previewBenchmark.phase=phase;previewBenchmark.lastRaf=null;},currentPhase);
    const before=await page.evaluate(()=>preview.player.getStats()),start=performance.now();
    await page.getByRole('button',{name:'Play with sound'}).click();
    console.log(`Visible 720p playback ${pass+1}/3 started`);
    await page.waitForFunction(()=>preview.player.getCurrentFrame()===479,{}, {timeout:30000});
    await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,120)));
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    const after=await page.evaluate(()=>{previewBenchmark.phase=null;return preview.player.getStats();});
    plays.push({phase:currentPhase,wallSeconds:(performance.now()-start)/1000,renderedFrames:after.renderedFrames-before.renderedFrames,droppedFrames:after.droppedFrames-before.droppedFrames});
    console.log(`Playback ${pass+1} finished: ${plays.at(-1).renderedFrames} draws, ${plays.at(-1).droppedFrames} dropped`);
  }
  clearInterval(memoryTimer);memoryTimer=undefined;sampleMemory('after-play');
  const audit=await page.evaluate(()=>previewBenchmark);
  await page.locator('canvas').screenshot({path:resolve(out,'visible-end.png')});
  const frameTimes=audit.frames.map(f=>f.elapsed),rafIntervals=plays.flatMap(play=>{
    const frames=audit.frames.filter(f=>f.phase===play.phase);
    const raf=audit.raf.filter(e=>e.phase===play.phase&&e.time>=frames[0].time&&e.time<=frames.at(-1).time);
    return raf.slice(1).map((entry,index)=>entry.time-raf[index].time);
  });
  const frame=stats(frameTimes),rafCadence=stats(rafIntervals);
  assert(frameTimes.length>0);assert.deepEqual(errors,[]);assert.deepEqual(memoryErrors,[]);assert(audit.visibility.every(e=>e.state==='visible'));
  await page.evaluate(()=>preview.dispose());
  await page.waitForFunction(()=>document.fonts.size===0);await browser.close();browser=undefined;sampleMemory('after-browser-close');
  const memoryByPass=plays.map(p=>{const samples=memory.filter(m=>m.phase===p.phase),totals=samples.map(m=>m.totalRssBytes);return {phase:p.phase,samples:samples.length,minRssBytes:Math.min(...totals),maxRssBytes:Math.max(...totals),p50RssBytes:percentile(totals,.5),p95RssBytes:percentile(totals,.95)};});
  const report={date:new Date().toISOString(),host,chromium:browserVersion,setup,startupMs,nodeCompile,browserCompile:stats(timings.compile),loadedFirstFrame:stats(timings.firstFrames),seek:stats(timings.seeks),frame,rafCadence,plays,memoryByPass,bundles,assets:assets.manifest.map(a=>({id:a.id,hash:a.hash,bytes:assets.files.get(a.id).bytes.length})),checks:{frameP95:frame.p95Ms<=1000/24?'PASS':'FAIL',noDroppedFrames:plays.every(p=>p.droppedFrames===0)?'PASS':'FAIL',visibleDocument:'PASS',realResourcesAudio:'PASS'},method:{warmupCompile:10,compileSamples:100,firstFrameSamples:30,seekSamples:120,resolution:[1280,720],dpr:1,headless:false,playback:'Three full 20-second runs at 1x with real gesture audio; no repeated pixel readbacks',frame:'Entire RAF callback that increases player renderedFrames; includes absolute evaluation and Canvas drawing',raf:'Distinct RAF timestamps, not 24fps output intervals or physical display presentation timestamps',memory:'Sum of per-process RSS for benchmark Node coordinator and all owned descendants sampled every 500ms; shared pages can be counted more than once'},limitations:['Preview only: Chromium/Node measured; FFmpeg export-process memory remains open','RSS is sampled, not a bound or retained-object proof; no forced GC or heap snapshots','Frame timing measures evaluation and submitted drawing, not physical screen/output latency; distinct RAF cadence and dropped-frame counters provide complementary visible-playback evidence','Gzip baseline is an observation, not an approved CI budget; standalone bundle totals include their shared dependencies and are not additive','Local hardware and visible Chromium only; physical mobile remains provisional']};
  await writeFile(resolve(out,'preview-raw.json'),JSON.stringify({timings,audit,memory},null,2)+'\n');
  await writeFile(resolve(out,'preview-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({report:resolve(out,'preview-report.json'),checks:report.checks,frame,seek:report.seek,browserCompile:report.browserCompile,memoryByPass,bundles:bundles.map(({name,bytes,gzipBytes})=>({name,bytes,gzipBytes}))},null,2));
  assert.equal(report.checks.frameP95,'PASS');assert.equal(report.checks.noDroppedFrames,'PASS');
} finally {if(deadline)clearTimeout(deadline);if(memoryTimer)clearInterval(memoryTimer);await browser?.close();await server.close();}
