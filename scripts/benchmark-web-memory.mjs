import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, open, rm, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { compile, deserializeDocument, serializePlan } from '@aether-fx/core';
import { wavMetadata } from '@aether-fx/node';
import { startPreviewServer } from '../examples/browser/serve.mjs';

const out=resolve('artifacts/performance');await mkdir(out,{recursive:true});
const nodeReport=JSON.parse(await readFile(resolve(out,'export-memory-report.json'),'utf8'));
const repeated=deserializeDocument(await readFile(join(nodeReport.directory,'repeat-document.json'),'utf8'));assert(repeated.ok,JSON.stringify(repeated));
const server=await startPreviewServer(),original=server.project,directory=await mkdtemp(join(out,'web-memory-'));
const repeatedAudio=await readFile(join(nodeReport.directory,'score60.wav')),audioDefinition=repeated.value.assets.find(a=>a.kind==='audio');
assert.equal(createHash('sha256').update(repeatedAudio).digest('hex'),nodeReport.repetition.audioHash);assert.equal(wavMetadata(repeatedAudio).duration,60);
const manifest=structuredClone(original.assets.manifest),audioManifest=manifest.find(a=>a.id===audioDefinition.id);
Object.assign(audioManifest,{version:audioDefinition.version,hash:nodeReport.repetition.audioHash,duration:60});
const compiled=compile(repeated.value,manifest);assert(compiled.ok,JSON.stringify(compiled));
const files=new Map(original.assets.files);files.set(audioDefinition.id,{bytes:repeatedAudio,path:join(nodeReport.directory,'score60.wav')});
const repeatProject={plan:compiled.value,assets:{manifest,files}};
let browser,timer,deadline,phase='idle',progress=0,handle;
const samples=[],errors=[],runs=[],observedPids=new Set();
function sample(){
  const result=spawnSync('ps',['-axo','pid=,ppid=,rss=,comm='],{encoding:'utf8',timeout:2000});
  if(result.status!==0){errors.push(String(result.error??result.stderr));return;}
  const rows=result.stdout.split('\n').flatMap(line=>{const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);return m?[{pid:Number(m[1]),parent:Number(m[2]),rssBytes:Number(m[3])*1024,command:m[4]}]:[];});
  const owned=new Set([process.pid]);let added=true;
  while(added){added=false;for(const p of rows)if(owned.has(p.parent)&&!owned.has(p.pid)){owned.add(p.pid);added=true;}}
  const processes=rows.filter(p=>owned.has(p.pid)&&p.pid!==result.pid).map(p=>({...p,role:p.pid===process.pid?'coordinator':/Google Chrome/.test(p.command)?'chromium':'helper'}));
  for(const p of processes)if(p.role==='chromium')observedPids.add(p.pid);
  samples.push({timeSeconds:performance.now()/1000,phase,frame:progress,totalRssBytes:processes.reduce((sum,p)=>sum+p.rssBytes,0),processes});
}
function instrument(){
  const sets={VideoFrame:new Set(),AudioData:new Set(),VideoEncoder:new Set(),AudioEncoder:new Set()},peak={VideoFrame:0,AudioData:0,VideoEncoder:0,AudioEncoder:0},queues={VideoEncoder:0,AudioEncoder:0};
  for(const name of Object.keys(sets)){
    const Native=window[name],live=sets[name];
    window[name]=new Proxy(Native,{construct(target,args){const value=Reflect.construct(target,args,target);live.add(value);peak[name]=Math.max(peak[name],live.size);return value;}});
    const close=Native.prototype.close;Native.prototype.close=function(){live.delete(this);return close.call(this);};
    if(name==='VideoFrame'||name==='AudioData'){const clone=Native.prototype.clone;Native.prototype.clone=function(){const value=clone.call(this);live.add(value);peak[name]=Math.max(peak[name],live.size);return value;};}
    else {const encode=Native.prototype.encode;Native.prototype.encode=function(...args){const value=encode.apply(this,args);queues[name]=Math.max(queues[name],this.encodeQueueSize);return value;};}
  }
  window.nativeMemoryAudit=()=>({live:Object.fromEntries(Object.entries(sets).map(([name,set])=>[name,set.size])),peak,queues});
}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
try {
  deadline=setTimeout(()=>{console.error('Browser memory benchmark exceeded 180 seconds');void browser?.close();},180000);
  sample();timer=setInterval(sample,250);
  for(const [seconds,project]of [[20,original],[60,repeatProject]]){
    phase='load-'+seconds;progress=0;
    browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
    const version=browser.version(),page=await browser.newPage({viewport:{width:1344,height:1000},deviceScaleFactor:1}),pageErrors=[];
    page.on('pageerror',e=>pageErrors.push(e.message));await page.addInitScript(instrument);
    await page.route(server.url+'/plan.json',route=>route.fulfill({contentType:'application/json',body:serializePlan(project.plan)}));
    await page.route(server.url+'/assets/'+audioDefinition.id,route=>route.fulfill({contentType:'application/octet-stream',body:project.assets.files.get(audioDefinition.id).bytes}));
    await page.goto(server.url);await page.waitForFunction(()=>!!window.preview);await page.waitForFunction(()=>!document.querySelector('#export').disabled);
    const output=join(directory,seconds+'s.webm'),partial=output+'.partial';handle=await open(partial,'wx');let writes=0,active=0,maxActive=0,closed=false,aborted=false;
    await page.exposeFunction('memoryWrite',async(data,position)=>{active++;maxActive=Math.max(maxActive,active);try{const bytes=Buffer.from(data);let at=0;while(at<bytes.length){const result=await handle.write(bytes,at,bytes.length-at,position+at);assert(result.bytesWritten>0);at+=result.bytesWritten;}writes++;}finally{active--;}});
    await page.exposeFunction('memoryClose',async()=>{await handle.close();handle=undefined;closed=true;});
    await page.exposeFunction('memoryAbort',async()=>{aborted=true;await handle?.close();handle=undefined;await rm(partial,{force:true});});
    await page.exposeFunction('memoryProgress',p=>{progress=p.frame;if(p.frame%120===0)console.log(`Native ${seconds}s export: ${p.frame}/${p.total} frames`);});
    phase='export-'+seconds;sample();console.log(`Measuring actual native browser ${seconds}s export at 720p`);
    const report=await page.evaluate(async()=>{
      const {deserializePlan,exportWebM}=await import('/main.js'),result=deserializePlan(await(await fetch('/plan.json')).text());if(!result.ok)throw new Error(JSON.stringify(result));
      return exportWebM(result.value,preview.resources,{width:1280,height:720,sink:{write:(data,position)=>memoryWrite(Array.from(data),position),close:()=>memoryClose(),abort:()=>memoryAbort()},onProgress:p=>{void memoryProgress(p);}});
    });
    sample();assert(closed&&!aborted);assert.equal(report.frames,seconds*24);assert.equal(report.audioSamples,seconds*48000);assert.deepEqual(report.queueCapacity,{producerSamples:1,videoEncoderSamples:1,audioEncoderSamples:4});assert.equal(maxActive,1);assert(writes>1);
    const audit=await page.evaluate(()=>nativeMemoryAudit());assert.deepEqual(audit.live,{VideoFrame:0,AudioData:0,VideoEncoder:0,AudioEncoder:0});assert(audit.queues.VideoEncoder<=1);assert(audit.queues.AudioEncoder<=4);
    await page.evaluate(()=>preview.dispose());await page.waitForFunction(()=>document.fonts.size===0);assert.deepEqual(pageErrors,[]);await browser.close();browser=undefined;
    await rename(partial,output);
    const memory=samples.filter(s=>s.phase===phase),totals=memory.map(s=>s.totalRssBytes);assert(memory.some(s=>s.processes.some(p=>p.role==='chromium')));
    phase='decode-'+seconds;
    const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',output],{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});assert.equal(probe.status,0,probe.stderr);
    const streams=JSON.parse(probe.stdout).streams,video=streams.find(s=>s.codec_type==='video'),audio=streams.find(s=>s.codec_type==='audio');assert.equal(video.codec_name,'vp9');assert.equal(video.nb_read_frames,String(seconds*24));assert.equal(video.width,1280);assert.equal(video.height,720);assert.equal(audio.codec_name,'opus');assert.equal(audio.sample_rate,'48000');
    const decoded=spawnSync('ffmpeg',['-v','error','-i',output,'-map','0:a:0','-f','s16le','-acodec','pcm_s16le','pipe:1'],{timeout:120000,maxBuffer:32*1024*1024});assert.equal(decoded.status,0,decoded.stderr.toString());assert.equal(decoded.stdout.length,(seconds*48000+648)*4);
    runs.push({seconds,version,output,report,exportFactor:report.seconds/seconds,writes,maxActive,audit,decode:{frames:Number(video.nb_read_frames),audioSamples:decoded.stdout.length/4,opusTailSamples:648,ffprobeStderr:probe.stderr,audioStderr:decoded.stderr.toString()},memory:{samples:memory.length,peakRssBytes:Math.max(...totals),p50RssBytes:percentile(totals,.5),p95RssBytes:percentile(totals,.95),byThird:Array.from({length:3},(_,third)=>{const values=memory.filter(s=>s.frame>=seconds*24*third/3&&s.frame<seconds*24*(third+1)/3).map(s=>s.totalRssBytes);return {third,samples:values.length,p50RssBytes:percentile(values,.5),peakRssBytes:Math.max(...values)};})}});
  }
  clearInterval(timer);timer=undefined;phase='after';sample();assert.deepEqual(errors,[]);
  const finalPids=spawnSync('ps',['-axo','pid='],{encoding:'utf8'});assert.equal(finalPids.status,0,finalPids.stderr);const remaining=finalPids.stdout.trim().split(/\s+/).map(Number).filter(pid=>observedPids.has(pid));assert.deepEqual(remaining,[]);
  const report={node:process.version,directory,repetitionSource:nodeReport.directory,checks:{native20And60SecondExports:'PASS',progressiveSinkAndBoundedQueues:'PASS',decodedAudioVideo:'PASS',zeroLiveNativeObjects:'PASS',ownedProcessCleanup:'PASS'},runs,processCleanup:{observedPids:[...observedPids],remaining},method:{sampleIntervalMs:250,rss:'Sum of benchmark coordinator and all owned descendant RSS, excluding sampling ps; browser GPU/renderers/network/native encoders included',nativeAudit:'Live sets delete closed samples/encoders; closed objects are not retained by the benchmark',sink:'Random-access writes awaited into a host file; no compressed-file Blob accumulation',repeat:'Same verified 1440-frame reset/PCM repetition as the Node memory benchmark'},limitations:['Local native Chromium only; Firefox/WebKit 20s exports already tested, but their 60s memory is not a reference-gate claim','Sampled aggregate RSS may double-count shared pages and miss brief peaks; not physical unique memory or a universal heap-leak claim','Source asset/decoded PCM buffers scale with duration; queue bounds concern frame/encoder/sink work','Browser Opus has the previously measured 648-sample tail, unlike exact-length Node reference audio; stderr retained']};
  await writeFile(join(directory,'memory-raw.json'),JSON.stringify(samples,null,2)+'\n');await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');await writeFile(resolve(out,'web-memory-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({report:resolve(out,'web-memory-report.json'),checks:report.checks,runs:runs.map(r=>({seconds:r.seconds,exportFactor:r.exportFactor,decode:r.decode,memory:r.memory,audit:r.audit}))},null,2));
} finally {if(deadline)clearTimeout(deadline);if(timer)clearInterval(timer);await browser?.close();await handle?.close();await server.close();}
