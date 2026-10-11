// Explicit opt-in encoder. Never imported by the default Node or browser entry.
import { createNativeRenderer } from '@aether-fx/node';
import { frameSeconds, frameTimestamp } from '@aether-fx/core';
import { Output, FilePathTarget, WebMOutputFormat, Mp4OutputFormat, VideoSampleSource, AudioSampleSource, VideoSample, AudioSample, canEncodeVideo, canEncodeAudio } from 'mediabunny';
import { mkdtemp, link, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { platform, release } from 'node:os';
import type { LoadedProject } from './assets.js';
import { wavMetadata } from './assets.js';
import type { ExportOptions, ExportReport } from './export.js';
import { FxEnvironmentError } from './errors.js';
let registered=false;
export async function nativeCapabilities(format:'webm'|'mp4'='webm'){
 if(!registered){
  const name='@mediabunny/server';
  try { const {registerMediabunnyServer}=await import(name); registerMediabunnyServer(); registered=true; }
  catch(cause){throw new FxEnvironmentError('ENCODER_UNAVAILABLE','Opt-in integrated encoding requires @mediabunny/server 1.61.3 and node-av 6.1.1; qualify the exact binary distribution first',{cause});}
 }
 const video=format==='webm'?'vp9':'avc',audio=format==='webm'?'opus':'aac';
 return {backend:'napi-mediabunny',video,audio,videoSupported:await canEncodeVideo(video),audioSupported:await canEncodeAudio(audio),nativeLibraries:'NodeAV/FFmpeg (not FFmpeg-free)'};
}
export async function exportNativeVideo(project:LoadedProject,options:ExportOptions):Promise<ExportReport>{
 const format=options.format??'webm',caps=await nativeCapabilities(format);
 if(!caps.videoSupported||(project.plan.document.audio&&!caps.audioSupported))throw new FxEnvironmentError('EXPORT_UNSUPPORTED',JSON.stringify(caps));
 const timeout=AbortSignal.timeout(options.timeoutMs??300000),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
 const check=()=>{if(signal.aborted)throw new FxEnvironmentError(timeout.aborted?'EXPORT_TIMEOUT':'EXPORT_ABORTED','Export cancelled');};check();
 const {plan,assets}=project,width=options.width??plan.document.viewport[0],height=options.height??plan.document.viewport[1];
 if(width%2||height%2)throw new FxEnvironmentError('RESOLUTION_INVALID','YUV420 needs even dimensions');
 const output=resolve(options.output),directory=await mkdtemp(join(dirname(output),'.afx-native-')),temporary=join(directory,'video.'+format);
 let renderer:Awaited<ReturnType<typeof createNativeRenderer>>|undefined,muxer:Output|undefined,finalized=false;
 const start=performance.now();let peakRssBytes=process.memoryUsage().rss;
 try{
 renderer=await createNativeRenderer(plan,assets,{width,height});check();
 muxer=new Output({format:format==='webm'?new WebMOutputFormat():new Mp4OutputFormat(),target:new FilePathTarget(temporary)});
 const video=new VideoSampleSource({codec:format==='webm'?'vp9':'avc',bitrate:4_000_000,hardwareAcceleration:'prefer-software'});muxer.addVideoTrack(video,{frameRate:plan.document.fps.numerator/plan.document.fps.denominator});
 const track=plan.document.audio,audio=track?new AudioSampleSource({codec:format==='webm'?'opus':'aac',bitrate:128000}):undefined;
 if(audio)muxer.addAudioTrack(audio);
 const bytes=track?assets.files.get(track.asset)!.bytes:undefined,meta=bytes?wavMetadata(bytes):undefined;
 await muxer.start();
 for(let frame=0;frame<plan.duration;frame++){
 check();renderer.render(frame);
 const sample=new VideoSample(renderer.pixels(),{format:'RGBA',codedWidth:width,codedHeight:height,timestamp:frameSeconds(frame,plan.document.fps),duration:frameSeconds(1,plan.document.fps)});
 try{await video.add(sample);}finally{sample.close();}
 if(audio&&track&&meta&&bytes){const sr=meta.sampleRate,ch=meta.channels,a=frameTimestamp(frame,plan.document.fps,sr),b=frameTimestamp(frame+1,plan.document.fps,sr),offset=frameTimestamp(track.offset,plan.document.fps,sr),trim=frameTimestamp(track.trimStart,plan.document.fps,sr),length=frameTimestamp(track.duration,plan.document.fps,sr),pcm=new Float32Array((b-a)*ch);for(let i=a;i<b;i++){const source=i-offset+trim;if(i<offset||i>=offset+length||source<0||source>=meta.dataLength/(ch*meta.bits/8))continue;for(let c=0;c<ch;c++){const at=meta.dataOffset+(source*ch+c)*meta.bits/8;const v=meta.bits===8?(bytes[at]!-128)/128:meta.bits===16?bytes.readInt16LE(at)/32768:meta.bits===24?bytes.readIntLE(at,3)/8388608:bytes.readInt32LE(at)/2147483648;pcm[(i-a)*ch+c]=Math.max(-1,Math.min(1,v*track.gain));}}const sample=new AudioSample({data:pcm,format:'f32',numberOfChannels:ch,sampleRate:sr,timestamp:a/sr});try{await audio.add(sample);}finally{sample.close();}}
 peakRssBytes=Math.max(peakRssBytes,process.memoryUsage().rss);options.onProgress?.({frame:frame+1,total:plan.duration});
 }
 await video.close();await audio?.close();check();await muxer.finalize();finalized=true;check();await link(temporary,output);
 const seconds=(performance.now()-start)/1000,duration=frameSeconds(plan.duration,plan.document.fps);
 return {output,frames:plan.duration,width,height,duration,seconds,exportFactor:seconds/duration,backend:'napi-mediabunny',chromium:'none',ffmpeg:'NodeAV integrated libraries; server 1.61.3',os:`${platform()} ${release()}`,assetHashes:Object.fromEntries(assets.manifest.map(a=>[a.id,a.hash])),fonts:plan.document.assets.filter(a=>a.kind==='font').map(a=>a.id),queueCapacity:1,peakRssBytes,blockedRequests:[]};
 }finally{if(muxer&&!finalized)await muxer.cancel().catch(()=>{});renderer?.dispose();await rm(directory,{recursive:true,force:true});}
}
