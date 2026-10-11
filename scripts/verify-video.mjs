import {verificationSource} from './verification-source.mjs';
const verification=await verificationSource();
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const run=(command,args)=>{const r=spawnSync(command,args,{maxBuffer:16_000_000});assert.equal(r.status,0,`${command} failed: ${r.stderr}`);return {stdout:r.stdout,stderr:r.stderr.toString()};};
const wav=await readFile('fixtures/short/assets/score.wav'),markers=JSON.parse(await readFile('fixtures/short/sync-markers.json','utf8')).markers;
const args = process.argv.slice(2), reportIndex = args.indexOf('--report');
let reportPath;
if (reportIndex >= 0) { reportPath = args[reportIndex + 1]; assert(reportPath && !reportPath.startsWith('--'), '--report requires an output path'); args.splice(reportIndex, 2); }
const web = args.includes('--web'), files = args.filter(a => a !== '--web'); if (!files.length) files.push('artifacts/short/little-light-720.webm', 'artifacts/short/little-light-1080.webm');
const results=[];const failures=[];
for(const file of files){
  const diagnostic={file,status:'RUNNING',checks:{}};results.push(diagnostic);
  try{
  const inputBytes=await readFile(file);diagnostic.sha256=createHash('sha256').update(inputBytes).digest('hex');diagnostic.bytes=inputBytes.length;
  const probe = run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_data', '-show_format', '-of', 'json', file]), metadata = JSON.parse(probe.stdout.toString()), video = metadata.streams.find(s => s.codec_type === 'video'), audio = metadata.streams.find(s => s.codec_type === 'audio');
  diagnostic.probe=metadata;
  const opusHeader = Buffer.from(audio.extradata.split('\n').flatMap(line => { const match = line.match(/^[0-9a-f]{8}: ((?:[0-9a-f]{2,4} ?)+)/i); return match ? [match[1].replaceAll(' ', '')] : []; }).join(''), 'hex');
  assert.equal(opusHeader.subarray(0, 8).toString(), 'OpusHead');
  const opusHeaderPreSkipSamples = opusHeader.readUInt16LE(10);diagnostic.opusHeaderPreSkipSamples=opusHeaderPreSkipSamples;
  assert.equal(video.codec_name,'vp9');assert.equal(audio.codec_name,'opus');assert.equal(video.nb_read_frames,'480');assert.equal(video.avg_frame_rate,'24/1');
  assert([[1280, 720], [1920, 1080]].some(([w, h]) => video.width === w && video.height === h)); if (!web) assert.equal(video.tags.DURATION, '00:00:20.000000000'); else { const packets = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts_time,duration_time', '-of', 'json', file]).stdout.toString()).packets; assert.equal(packets.length, 480); for (let i = 0; i < 480; i++)assert(Math.abs(Number(packets[i].pts_time) - i / 24) <= .001, `Timestamp differs at ${i}`); } assert.equal(audio.sample_rate, '48000'); assert.equal(audio.channels, 2);
  const pixelX=Math.round(1184*video.width/1280),pixelY=Math.round(86*video.height/720);
  const pixels=run('ffmpeg',['-v','error','-xerror','-i',file,'-map','0:v:0','-vf',`format=rgb24,crop=1:1:${pixelX}:${pixelY}`,'-fps_mode','passthrough','-f','rawvideo','pipe:1']);
  assert.equal(pixels.stdout.length,480*3);
  const flashes=[];for(let frame=0;frame<480;frame++){const r=pixels.stdout[frame*3],g=pixels.stdout[frame*3+1],b=pixels.stdout[frame*3+2];if(r>200&&g>140&&g<210&&b<120)flashes.push(frame);}
  assert.deepEqual(flashes,[24,25,26,168,169,170,360,361,362]);
  const decoded = run('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']); const decodedSamples = decoded.stdout.length / 4, paddingSamples = decodedSamples - 960000; Object.assign(diagnostic,{decodedSamples,paddingSamples,paddingMs:paddingSamples/48});
  if (!web) assert.equal(decodedSamples, 960000); else { assert(Number.isInteger(paddingSamples) && paddingSamples >= 0 && paddingSamples < 960, 'Native Opus tail must be less than one 20 ms packet'); }
  const sync=[];
  const onset=(fn,frame)=>{const expected=frame/24;for(let sample=Math.floor((expected-.08)*48000);sample<Math.ceil((expected+.08)*48000);sample++)if(Math.abs(fn(sample))>.15)return sample;throw new Error(`Pulse not found at ${frame}`);};
  for(const marker of markers){const sourceSample=onset(i=>wav.readInt16LE(44+i*4)/32768,marker.frame),sample=onset(i=>decoded.stdout.readFloatLE(i*4),marker.frame),sourceAttackMs=(sourceSample/48000-marker.frame/24)*1000,errorMs=(sample-sourceSample)/48000*1000;assert(Math.abs(errorMs)<=1000/24,`AV sync outside one frame: ${errorMs}`);sync.push({frame:marker.frame,frequency:marker.frequency,videoSeconds:marker.frame/24,sourceSample,decodedSample:sample,sourceAttackMs,errorMs});}
  const decoding=run('ffmpeg',['-loglevel','debug','-xerror','-i',file,'-f','null','-']);
  assert.match(decoding.stderr, /480 frames decoded; 0 decode errors/); assert.match(decoding.stderr, new RegExp(String.raw`${audio.nb_read_frames} frames decoded; 0 decode errors \(${decodedSamples} samples\)`));
  const parserWarning=decoding.stderr.includes('Error parsing Opus packet header.');
  // Preserve and explain the observed EOF parser message; do not hide other decoding errors.
  const warnings = parserWarning ? [{ message: 'FFmpeg 8.0.1 emits an Opus parser message on the empty EOF flush; the independently checked packet/sample counts decode with zero errors.', basis: 'Debug log places the message at EOF; n8.0 set_frame_duration runs for zero bytes under PARSER_FLAG_COMPLETE_FRAMES, while upstream master guards buf_size.', source: 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.0/libavcodec/opus/parser.c' }] : [];
  const bytes = await readFile(file); Object.assign(diagnostic,{status:'PASS', file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, checks: { vp9Opus: 'PASS', resolution: 'PASS', decoded480Frames: 'PASS', video20Seconds: 'PASS', audioContentAndPadding: 'PASS', visualPulses: 'PASS', syncWithinOneFrame: 'PASS', zeroDecodeErrors: 'PASS' }, width: video.width, height: video.height, videoDuration: 20, decodedSamples, paddingSamples, paddingMs: paddingSamples / 48, containerDuration: Number(metadata.format.duration), codecPadding: { opusHeaderPreSkipSamples, initialSamples: audio.initial_padding, audioStartSeconds: Number(audio.start_time), containerTailSeconds: Number(metadata.format.duration) - 20 }, sync, warnings, probeStderr: probe.stderr, decodeLog: decoding.stderr.slice(-14000) });
  }catch(error){diagnostic.status='FAIL';diagnostic.error={name:error.name,message:error.message,stack:error.stack};failures.push(diagnostic);}
}
reportPath ??= web ? 'artifacts/web-export/video-report.json' : 'artifacts/short/video-report.json';
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify({source:verification,status:failures.length?'FAIL':'PASS',complete:!failures.length,platform:process.platform,node:process.version,inputAudio:{source:'fixtures/short/assets/score.wav',sha256:createHash('sha256').update(wav).digest('hex'),samples:960000,sampleRate:48000}, referenceDate: '2026-10-10', ffmpeg: run('ffmpeg', ['-version']).stdout.toString().split('\n')[0], results }, null, 2) + '\n');
console.log(JSON.stringify(results.map(({decodeLog,...r})=>r),null,2));

assert.equal(failures.length,0,'Independent decode failed; see '+reportPath);
