import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { compileSource } from '@aether-fx/compiler';
import { evaluate, matrixPoint } from '@aether-fx/core';
import { loadProject, createNativeRenderer, createOfflineRenderer, exportVideo } from '@aether-fx/node';

const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'aether-authoring-'));
await mkdir(output, { recursive: true });
const names = ['authored', 'varied', 'assembly'];
const results = [];
const between = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const critical = [...new Set([0, 143, 144, 156, 174, 184, ...between(190, 222), 240, 274, 298, ...between(330, 340), 384, 479])].sort((a, b) => a - b);
const command = (list, id) => list.commands.find(c => c.id === id);
const close = (a, b, tolerance = 1e-8) => a.forEach((n, i) => assert(Math.abs(n - b[i]) <= tolerance));
for (const name of names) {
  const loaded = await loadProject(`fixtures/short/little-light-${name}.afx`);
  assert(loaded.ok, JSON.stringify(loaded.diagnostics));
  const project = loaded.value, { plan, assets, sources } = project;
  // Benchmark compiler text and evaluation independently; module IO is preloaded.
  const entry = [...sources.keys()][0], source = sources.get(entry);
  const options = { sourceId: entry, resolveModule: (specifier, importer) => {
    const id = new URL(specifier, 'file://' + importer).pathname;
    return { id, source: sources.get(id) };
  } };
  const compileMs = [], evaluateMs = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now(), compiled = compileSource(source, assets.manifest, options);
    assert(compiled.ok, JSON.stringify(compiled.diagnostics));
    if (i > 1) compileMs.push(performance.now() - start);
  }
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    for (let frame = 0; frame < plan.duration; frame++) evaluate(plan, { frame });
    if (i > 0) evaluateMs.push(performance.now() - start);
  }
  const expected = Array.from({ length: plan.duration }, (_, frame) => evaluate(plan, { frame }));
  for (let i = 0; i < plan.duration; i++) {
    const frame = i * 137 % plan.duration;
    assert.deepEqual(evaluate(plan, { frame }), expected[frame]);
  }
  for (let frame = plan.duration - 1; frame >= 0; frame--) assert.deepEqual(evaluate(plan, { frame }), expected[frame]);
  if (name !== 'assembly') {
    const world = structuredClone(plan);
    for (const item of world.shots) {
      item.snapshot.values.camera = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
      item.shot.keys = item.shot.keys.filter(k => k.target !== 'camera');
    }
    const firstFoot = command(evaluate(world, { frame: 0 }), 'hero.shoes').matrix;
    const worldAt = frame => evaluate(world, { frame });
    for (let frame = 0; frame < plan.duration; frame++) {
      const list = worldAt(frame);
      close(command(list, 'hero.shoes').matrix, firstFoot);
      if (frame >= 204) close(matrixPoint(command(list, 'hero.hand').matrix, [18, -5]), matrixPoint(command(list, 'lantern.lanternBody').matrix, [-2, -31]));
    }
    for (const id of ['hero.hand', 'lantern.lanternBody']) close(command(worldAt(335), id).matrix, command(worldAt(336), id).matrix);
    close(command(worldAt(203), 'lantern.lanternBody').matrix, command(worldAt(204), 'lantern.lanternBody').matrix);
    close(command(worldAt(204), 'lantern.lanternBody').matrix, command(worldAt(216), 'lantern.lanternBody').matrix);
    assert(command(worldAt(217), 'lantern.lanternBody').matrix[5] < command(worldAt(216), 'lantern.lanternBody').matrix[5]);
    const approaching = worldAt(174);
    const hand = matrixPoint(command(approaching, 'hero.hand').matrix, [18, -5]);
    const crown = matrixPoint(command(approaching, 'lantern.lanternBody').matrix, [-2, -31]);
    assert(Math.hypot(hand[0] - crown[0], hand[1] - crown[1]) > 10, 'Free approach must remain visibly separate');
  } else {
    for (const id of ['housing_piece', 'foot_piece', 'rim_piece']) {
      const target = plan.document.actors.find(a => a.id === id).parts[0];
      close(command(expected[0], id + '.' + target).matrix, command(expected[143], id + '.' + target).matrix);
      assert.notDeepEqual(command(expected[0], id + '.' + target).matrix, command(expected[60], id + '.' + target).matrix);
    }
  }
  const native = await createNativeRenderer(plan, assets), browser = await createOfflineRenderer(plan, assets);
  const canvas = createCanvas(1280, 720), context = canvas.getContext('2d');
  const frames = name === 'assembly' ? [0, 11, 12, 24, 35, 36, 60, 84, 107, 108, 143] : critical;
  const sheet = createCanvas(7 * 256, Math.ceil(frames.length / 7) * 224), sheetContext = sheet.getContext('2d');
  sheetContext.fillStyle = '#f4eee3'; sheetContext.fillRect(0, 0, sheet.width, sheet.height);
  let maxMae = 0, maxDifferentRatio = 0, maxStateError = 0;
  try {
    for (const [index, frame] of frames.entries()) {
      const png = await native.captureFrame(frame), reference = await browser.captureFrame(frame), state = await browser.evaluateFrame(frame);
      // Cross-engine trig is permitted only bounded roundoff; same-runtime seeks above stay exact.
      const compare = (a, b) => {
        if (typeof a === 'number' && typeof b === 'number') {
          const delta = Math.abs(a - b); maxStateError = Math.max(maxStateError, delta);
          assert(delta <= 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b))); return;
        }
        if (a && typeof a === 'object') {
          assert.deepEqual(Object.keys(a), Object.keys(b));
          for (const key of Object.keys(a)) compare(a[key], b[key]);
        } else assert.equal(a, b);
      };
      compare(state, expected[frame]);
      context.clearRect(0, 0, 1280, 720); context.drawImage(await loadImage(reference), 0, 0);
      const a = native.pixels(), b = context.getImageData(0, 0, 1280, 720).data;
      let sum = 0, different = 0;
      for (let i = 0; i < a.length; i += 4) {
        let changed = false;
        for (let ch = 0; ch < 4; ch++) { const delta = Math.abs(a[i + ch] - b[i + ch]); sum += delta; changed ||= delta > 2; }
        if (changed) different++;
      }
      const mae = sum / a.length, ratio = different / (1280 * 720);
      assert(mae <= 2 && ratio <= .05, `Raster parity ${name} G${frame}: ${mae}, ${ratio}`);
      maxMae = Math.max(maxMae, mae); maxDifferentRatio = Math.max(maxDifferentRatio, ratio);
      await writeFile(`${output}/${name}-${frame}.png`, png, { flag: 'wx' });
      const x = index % 7 * 256, y = Math.floor(index / 7) * 224;
      sheetContext.fillStyle = '#f4eee3'; sheetContext.fillRect(x, y, 256, 224);
      const image = await loadImage(png);
      if (name === 'assembly') sheetContext.drawImage(image, x, y, 256, 196);
      else {
        const grip = matrixPoint(command(expected[frame], 'hero.hand').matrix, [18, -5]);
        sheetContext.drawImage(image, grip[0] - 100, grip[1] - 55, 200, 180, x, y, 256, 196);
      }
      sheetContext.fillStyle = '#493c49'; sheetContext.font = '15px sans-serif';
      sheetContext.fillText(`G${frame} / ${expected[frame].shot} L${frame - plan.shots.find(s => s.shot.id === expected[frame].shot).start}`, x + 8, y + 215);
    }
    await writeFile(`${output}/${name}-critical.png`, sheet.toBuffer('image/png'), { flag: 'wx' });
  } finally { native.dispose(); await browser.dispose(); }
  const video = await exportVideo(project, { output: `${output}/${name}.${name === 'assembly' ? 'webm' : 'mp4'}`, format: name === 'assembly' ? 'webm' : 'mp4', backend: 'native' });
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'json', video.output], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(Number(JSON.parse(probe.stdout).streams[0].nb_read_frames), plan.duration);
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-xerror', '-i', video.output, '-f', 'null', '-'], { encoding: 'utf8' });
  assert.equal(decode.status, 0, decode.stderr); assert.equal(decode.stderr, '');
  const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const result = { name, sourceFiles: sources.size, sourceLines: [...sources.values()].reduce((n, s) => n + s.split('\n').length - 1, 0), sourceBytes: [...sources.values()].reduce((n, s) => n + Buffer.byteLength(s), 0), duration: plan.duration, compileMedianMs: median(compileMs), evaluateMovieMedianMs: median(evaluateMs), parityFrames: frames.length, maxMae, maxDifferentRatio, maxStateError, video: video.output, exportSeconds: video.seconds, seeking: 'PASS', decode: 'PASS' };
  results.push(result); console.log(JSON.stringify(result));
}
console.log(JSON.stringify({ status: 'PASS', output, results, limitations: ['Single macOS host, sampled raster parity, no universal artistic/platform or encoding speed claim'] }, null, 2));
