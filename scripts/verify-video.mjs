import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const run=(command,args)=>{const r=spawnSync(command,args,{maxBuffer:16_000_000});assert.equal(r.status,0,`${command} failed: ${r.stderr}`);return {stdout:r.stdout,stderr:r.stderr.toString()};};
const wav=await readFile('fixtures/short/assets/score.wav'),markers=JSON.parse(await readFile('fixtures/short/sync-markers.json','utf8')).markers;
const files=process.argv.slice(2);if(!files.length)files.push('artifacts/short/little-light-720.webm','artifacts/short/little-light-1080.webm');
const results=[];
for(const file of files){
  const probe=run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file]),metadata=JSON.parse(probe.stdout.toString()),video=metadata.streams.find(s=>s.codec_type==='video'),audio=metadata.streams.find(s=>s.codec_type==='audio');
  assert.equal(video.codec_name,'vp9');assert.equal(audio.codec_name,'opus');assert.equal(video.nb_read_frames,'480');assert.equal(video.avg_frame_rate,'24/1');
  assert([[1280,720],[1920,1080]].some(([w,h])=>video.width===w&&video.height===h));assert.equal(video.tags.DURATION,'00:00:20.000000000');assert.equal(audio.sample_rate,'48000');assert.equal(audio.channels,2);
  const pixelX=Math.round(1184*video.width/1280),pixelY=Math.round(86*video.height/720);
  const pixels=run('ffmpeg',['-v','error','-xerror','-i',file,'-map','0:v:0','-vf',`format=rgb24,crop=1:1:${pixelX}:${pixelY}`,'-fps_mode','passthrough','-f','rawvideo','pipe:1']);
  assert.equal(pixels.stdout.length,480*3);
  const flashes=[];for(let frame=0;frame<480;frame++){const r=pixels.stdout[frame*3],g=pixels.stdout[frame*3+1],b=pixels.stdout[frame*3+2];if(r>200&&g>140&&g<210&&b<120)flashes.push(frame);}
  assert.deepEqual(flashes,[24,25,26,168,169,170,360,361,362]);
  const decoded=run('ffmpeg',['-v','error','-xerror','-i',file,'-map','0:a:0','-ac','1','-ar','48000','-f','f32le','pipe:1']);assert.equal(decoded.stdout.length,960000*4);
  const sync=[];
  const onset=(fn,frame)=>{const expected=frame/24;for(let sample=Math.floor((expected-.08)*48000);sample<Math.ceil((expected+.08)*48000);sample++)if(Math.abs(fn(sample))>.15)return sample;throw new Error(`Pulse not found at ${frame}`);};
  for(const marker of markers){const sourceSample=onset(i=>wav.readInt16LE(44+i*4)/32768,marker.frame),sample=onset(i=>decoded.stdout.readFloatLE(i*4),marker.frame),sourceAttackMs=(sourceSample/48000-marker.frame/24)*1000,errorMs=(sample-sourceSample)/48000*1000;assert(Math.abs(errorMs)<=1000/24,`AV sync outside one frame: ${errorMs}`);sync.push({frame:marker.frame,frequency:marker.frequency,videoSeconds:marker.frame/24,sourceSample,decodedSample:sample,sourceAttackMs,errorMs});}
  const decoding=run('ffmpeg',['-loglevel','debug','-xerror','-i',file,'-f','null','-']);
  assert.match(decoding.stderr,/480 frames decoded; 0 decode errors/);assert.match(decoding.stderr,/1001 frames decoded; 0 decode errors \(960000 samples\)/);
  const parserWarning=decoding.stderr.includes('Error parsing Opus packet header.');
  // Preserve and explain the observed EOF parser message; do not hide other decoding errors.
  const warnings=parserWarning?[{message:'FFmpeg 8.0.1 emits an Opus parser message on the empty EOF flush; all 1001 packets decode into exactly 960000 samples with zero decoding errors.',basis:'Debug log places the message at EOF; n8.0 set_frame_duration runs for zero bytes under PARSER_FLAG_COMPLETE_FRAMES, while upstream master guards buf_size.',source:'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.0/libavcodec/opus/parser.c'}]:[];
  const bytes=await readFile(file);results.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,checks:{vp9Opus:'PASS',resolution:'PASS',decoded480Frames:'PASS',video20Seconds:'PASS',audio960000Samples:'PASS',visualPulses:'PASS',syncWithinOneFrame:'PASS',zeroDecodeErrors:'PASS'},width:video.width,height:video.height,videoDuration:20,containerDuration:Number(metadata.format.duration),codecPadding:{initialSamples:audio.initial_padding,audioStartSeconds:Number(audio.start_time),containerTailSeconds:Number(metadata.format.duration)-20},sync,warnings,probeStderr:probe.stderr,decodeLog:decoding.stderr.slice(-14000)});
}
await writeFile('artifacts/short/video-report.json',JSON.stringify({referenceDate:'2026-10-10',ffmpeg:run('ffmpeg',['-version']).stdout.toString().split('\n')[0],results},null,2)+'\n');
console.log(JSON.stringify(results.map(({decodeLog,...r})=>r),null,2));
