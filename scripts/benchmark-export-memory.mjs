import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { compile, evaluate, serializeDocument } from '@aether-fx/core';
import { loadProject, exportVideo, wavMetadata } from '@aether-fx/node';

const out = resolve('artifacts/performance'); await mkdir(out, { recursive: true });
const directory = await mkdtemp(join(out, 'export-memory-'));
const loaded = await loadProject('fixtures/short/little-light.afx'); assert(loaded.ok, JSON.stringify(loaded));
const original = loaded.value, document = structuredClone(original.plan.document), manifest = structuredClone(original.assets.manifest);
const audio = document.audio, definition = document.assets.find(a => a.id === audio.asset), file = original.assets.files.get(audio.asset), metadata = wavMetadata(file.bytes);
// This benchmark repeats the known reference PCM data, preserving its exact samples.
assert.deepEqual({ bits: metadata.bits, channels: metadata.channels, rate: metadata.sampleRate, offset: metadata.dataOffset, length: metadata.dataLength }, { bits: 16, channels: 2, rate: 48000, offset: 44, length: 3840000 });
assert.equal(file.bytes.length, metadata.dataOffset + metadata.dataLength);
const repeated = Buffer.concat([file.bytes.subarray(0, 44), ...Array.from({ length: 3 }, () => file.bytes.subarray(44))]);
repeated.writeUInt32LE(repeated.length - 8, 4); repeated.writeUInt32LE(metadata.dataLength * 3, 40);
assert.equal(wavMetadata(repeated).duration, 60);
definition.version++; definition.src = 'score60.wav'; audio.duration *= 3;
const audioManifest = manifest.find(a => a.id === audio.asset); audioManifest.version = definition.version; audioManifest.duration = 60; audioManifest.hash = createHash('sha256').update(repeated).digest('hex');
const repeatedAudioPath = join(directory, 'score60.wav'); await writeFile(repeatedAudioPath, repeated);
const files = new Map(original.assets.files); files.set(audio.asset, { path: repeatedAudioPath, bytes: repeated });
assert.deepEqual(original.plan.shots[0].snapshot.shapes, {});
const reset = Object.entries(original.plan.shots[0].snapshot.values).filter(([target]) => target !== 'camera').map(([target, values]) => ({ target, values: Object.fromEntries(Object.entries(values).filter(([property, value]) => property !== 'shape' || value !== null)) }));
document.shots = Array.from({ length: 3 }, (_, pass) => original.plan.document.shots.map((shot, index) => ({ ...structuredClone(shot), id: shot.id + 'Repeat' + pass, ...(index === 0 ? { initial: structuredClone(reset) } : {}) }))).flat();
const compiled = compile(document, manifest); assert(compiled.ok, JSON.stringify(compiled)); assert.equal(compiled.value.duration, 1440);
for (let frame = 0; frame < 1440; frame++) {
  const actual = evaluate(compiled.value, { frame }), expected = evaluate(original.plan, { frame: frame % 480 });
  assert.deepEqual(actual.commands, expected.commands); assert.deepEqual(actual.viewport, expected.viewport);
}
const repeatProject = { plan: compiled.value, assets: { manifest, files } };
await writeFile(join(directory, 'repeat-document.json'), serializeDocument(document) + '\n');
const samples = [], errors = [], runs = [], observedExportPids = new Set(); let phase = 'idle', progress = 0, timer;
function sample() {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8', timeout: 2000 });
  if (r.status !== 0) { errors.push(String(r.error ?? r.stderr)); return; }
  const rows = r.stdout.split('\n').flatMap(line => { const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/); return m ? [{ pid: Number(m[1]), parent: Number(m[2]), rssBytes: Number(m[3]) * 1024, command: m[4] }] : []; });
  const owned = new Set([process.pid]); let added = true;
  while (added) { added = false; for (const p of rows) if (owned.has(p.parent) && !owned.has(p.pid)) { owned.add(p.pid); added = true; } }
  const processes = rows.filter(p => owned.has(p.pid) && p.pid !== r.pid).map(p => ({ ...p, role: p.pid === process.pid ? 'coordinator' : /ffmpeg$/.test(p.command) ? 'ffmpeg' : /Google Chrome|(?:^|\/)chrome(?:-headless(?:-shell)?)?$/i.test(p.command) ? 'chromium' : 'helper' }));
  for (const p of processes) if (p.role === 'chromium' || p.role === 'ffmpeg') observedExportPids.add(p.pid);
  samples.push({ timeSeconds: performance.now() / 1000, phase, frame: progress, totalRssBytes: processes.reduce((sum, p) => sum + p.rssBytes, 0), processes });
}
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
try {
  sample(); timer = setInterval(sample, 250);
  for (const [seconds, project] of [[20, original], [60, repeatProject]]) {
    phase = 'export-' + seconds; progress = 0; console.log(`Measuring full Chromium/FFmpeg ${seconds}s export at 720p`);
    const report = await exportVideo(project, { output: join(directory, seconds + 's.webm'), width: 1280, height: 720, timeoutMs: 180000, onProgress: p => { progress = p.frame; if (p.frame % 120 === 0) console.log(`${seconds}s export: ${p.frame}/${p.total} frames`); } });
    sample(); assert.equal(report.frames, seconds * 24); assert.equal(report.queueCapacity, 1); assert.deepEqual(report.blockedRequests, []);
    const memory = samples.filter(s => s.phase === phase), totals = memory.map(s => s.totalRssBytes);
    assert(memory.some(s => s.processes.some(p => p.role === 'ffmpeg') && s.processes.some(p => p.role === 'chromium')), 'Full pipeline was not observed');
    const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', report.output], { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(probe.status, 0, probe.stderr); const streams = JSON.parse(probe.stdout).streams, video = streams.find(s => s.codec_type === 'video'), sound = streams.find(s => s.codec_type === 'audio');
    assert.equal(video.codec_name, 'vp9'); assert.equal(video.nb_read_frames, String(seconds * 24)); assert.equal(video.width, 1280); assert.equal(video.height, 720); assert.equal(video.avg_frame_rate, '24/1'); assert.equal(sound.codec_name, 'opus'); assert.equal(sound.sample_rate, '48000');
    const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', report.output, '-map', '0:a:0', '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'], { timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
    assert.equal(decode.status, 0, decode.stderr.toString()); assert.equal(decode.stdout.length, seconds * 48000 * 2 * 2);
    runs.push({ seconds, report, decode: { frames: Number(video.nb_read_frames), audioSamples: decode.stdout.length / 4, ffprobeStderr: probe.stderr, audioStderr: decode.stderr.toString() }, memory: { samples: memory.length, minRssBytes: Math.min(...totals), peakRssBytes: Math.max(...totals), p50RssBytes: percentile(totals, .5), p95RssBytes: percentile(totals, .95), byThird: Array.from({ length: 3 }, (_, third) => { const values = memory.filter(s => s.frame >= seconds * 24 * third / 3 && s.frame < seconds * 24 * (third + 1) / 3 && s.processes.some(p => p.role === 'ffmpeg')).map(s => s.totalRssBytes); return { third, samples: values.length, p50RssBytes: percentile(values, .5), peakRssBytes: Math.max(...values) }; }) } });
    phase = 'between'; sample();
  }
  clearInterval(timer); timer = undefined; phase = 'after'; sample(); assert.deepEqual(errors, []);
  assert(!samples.at(-1).processes.some(p => p.role === 'ffmpeg' || p.role === 'chromium'), 'Owned export processes remain alive');
  const finalPids = spawnSync('ps', ['-axo', 'pid='], { encoding: 'utf8' }); assert.equal(finalPids.status, 0, finalPids.stderr);
  const remaining = finalPids.stdout.trim().split(/\s+/).map(Number).filter(pid => observedExportPids.has(pid));
  assert.deepEqual(remaining, [], 'Previously observed export processes remain alive or were reparented');
  const report = { node: process.version, directory, processCleanup: { observedPids: [...observedExportPids], remaining, inspectedAt: new Date().toISOString(), method: 'All recorded Chromium/FFmpeg PIDs checked against the full live process table, including reparented processes' }, repetition: { frames: 1440, allStatesMatchOriginalModulo480: 'PASS', pcmSamplesRepeatedExactly: 3, audioHash: audioManifest.hash }, checks: { fullPipelineObserved: 'PASS', decoded20And60SecondFiles: 'PASS', boundedFrameQueue: 'PASS', ownedProcessCleanup: 'PASS' }, runs, method: { sampleIntervalMs: 250, rss: 'Sum of RSS for coordinator and all owned descendants, excluding sampling ps; Chromium/GPU/network/renderers and FFmpeg included', queue: 'Production export awaits capture and stdin write for each frame; capacity one', repetition: 'Reset each cycle to the first compiled snapshot; 1440 draw-command states equal the original modulo 480; original PCM is concatenated three times with a new asset version/hash' }, limitations: ['Sampled RSS can miss short peaks and double-count shared pages; it is not physical unique memory', 'Known audio and asset bytes scale with input duration; bounded-frame assertion concerns captured frames, not constant total memory for arbitrary input assets', 'No universal heap-leak or platform claim; compare the recorded 20s/60s traces and queue capacity', 'FFmpeg Opus EOF diagnostics are retained in full; successful decode and exact sample/frame counts are checked'] };
  await writeFile(join(directory, 'memory-raw.json'), JSON.stringify(samples, null, 2) + '\n');
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'export-memory-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: resolve(out, 'export-memory-report.json'), checks: report.checks, runs: runs.map(r => ({ seconds: r.seconds, exportFactor: r.report.exportFactor, decode: r.decode, memory: r.memory })) }, null, 2));
} finally { if (timer) clearInterval(timer); }
