import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadProject, createNativeRenderer, createOfflineRenderer, exportVideo } from '@aether-fx/node';
import { evaluate } from '@aether-fx/core';
import { createDemo } from './create-parametric-demo.mjs';

await mkdir('.work', { recursive: true });
const output = process.argv[2] ?? await mkdtemp('.work/parametric-');
await mkdir(output, { recursive: true });
const unwrap = r => { assert(r.ok, JSON.stringify(r.diagnostics)); return r.value; };
const project = unwrap(await loadProject('fixtures/parametric/lamp-table.afx'));
const { plan, assets } = project, demo = createDemo();
const native = await createNativeRenderer(plan, assets);
let browser;
const canvas = createCanvas(960, 720), ctx = canvas.getContext('2d');
const sheet = createCanvas(1920, 720), sheetContext = sheet.getContext('2d');
const selected = [0, 120, 156, 216, 263, 264, 300, 383];
// Same declared tolerances as the existing renderer spike; no exact pixel promise.
const tolerance = { mae: 2, differentPixelRatio: .05 };
let maxMae = 0, maxDifferentRatio = 0, peakRss = process.memoryUsage().rss;
try {
  browser = await createOfflineRenderer(plan, assets);
  for (let frame = 0; frame < plan.duration; frame++) {
    const draw = evaluate(plan, { frame });
    for (const c of draw.commands.filter(c => c.id !== 'background.wall' && c.material.fill !== null)) {
      for (const contour of c.shape.contours) for (const p of [contour.start, ...contour.segments.flatMap(s => [s.control1, s.control2, s.end])]) {
        const [a, b, xScale, yScale, x, y] = c.matrix, px = a * p[0] + xScale * p[1] + x, py = b * p[0] + yScale * p[1] + y;
        assert(px >= 16 && px <= 944 && py >= 16 && py <= 704, `Framing: ${c.id} at ${frame}`);
      }
    }
    const png = await native.captureFrame(frame), reference = await browser.captureFrame(frame);
    assert.deepEqual(await browser.evaluateFrame(frame), draw);
    ctx.clearRect(0, 0, 960, 720); ctx.drawImage(await loadImage(reference), 0, 0);
    const a = native.pixels(), b = ctx.getImageData(0, 0, 960, 720).data;
    let sum = 0, different = 0;
    for (let i = 0; i < a.length; i += 4) {
      let changed = false;
      for (let ch = 0; ch < 4; ch++) { const delta = Math.abs(a[i + ch] - b[i + ch]); sum += delta; changed ||= delta > 2; }
      if (changed) different++;
    }
    const mae = sum / a.length, ratio = different / (960 * 720);
    assert(mae <= tolerance.mae && ratio <= tolerance.differentPixelRatio, `Renderer parity at ${frame}: ${mae}, ${ratio}`);
    maxMae = Math.max(maxMae, mae); maxDifferentRatio = Math.max(maxDifferentRatio, ratio);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    if (selected.includes(frame)) {
      await writeFile(`${output}/frame-${frame}.png`, png, { flag: 'wx' });
      const index = selected.indexOf(frame), x = index % 4 * 480, y = Math.floor(index / 4) * 360;
      sheetContext.drawImage(await loadImage(png), x, y, 480, 360);
      sheetContext.fillStyle = '#2b4653'; sheetContext.font = '16px sans-serif'; sheetContext.fillText(`frame ${frame}`, x + 16, y + 24);
    }
    // The front finger occludes the handle at a declared point in the grip geometry.
    if (frame >= 264) {
      const p = demo.camera.point([46, 5, 264]), grip = draw.commands.find(c => c.id === 'grip.anchor'), m = grip.matrix;
      const x = Math.round(m[0] * p[0] + m[2] * p[1] + m[4]), y = Math.round(m[1] * p[0] + m[3] * p[1] + m[5]);
      const rgb = Array.from(a.slice((y * 960 + x) * 4, (y * 960 + x) * 4 + 3));
      assert.deepEqual(rgb, [84, 127, 128], `Front finger visibility at ${frame}`);
    }
  }
  await writeFile(`${output}/contact-sheet.png`, sheet.toBuffer('image/png'), { flag: 'wx' });
  // Comparable per-frame evaluation/raster timings at the same backing dimensions.
  const benchmark = async (name, p) => {
    const renderer = await createNativeRenderer(p.plan, p.assets, { width: 960, height: 720 }), evalMs = [], drawMs = [];
    try {
      for (let frame = 0; frame < p.plan.duration; frame++) {
        let start = performance.now(); evaluate(p.plan, { frame }); evalMs.push(performance.now() - start);
        start = performance.now(); renderer.render(frame); drawMs.push(performance.now() - start);
      }
      const p95 = xs => xs.sort((a, b) => a - b)[Math.ceil(xs.length * .95) - 1];
      return { name, frames: p.plan.duration, evaluateP95Ms: p95(evalMs), evaluateAndDrawP95Ms: p95(drawMs) };
    } finally { renderer.dispose(); }
  };
  const baseline = unwrap(await loadProject('fixtures/short/little-light.afx'));
  const timings = [await benchmark('parametric', project), await benchmark('little-light', baseline)];
  const exports = [];
  for (const [name, p] of [['parametric', project], ['little-light', baseline]]) {
    const report = await exportVideo(p, { output: `${output}/${name}.webm`, backend: 'native', width: 960, height: 720 });
    const decoded = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'json', report.output], { encoding: 'utf8' });
    assert.equal(decoded.status, 0, decoded.stderr); assert.equal(Number(JSON.parse(decoded.stdout).streams[0].nb_read_frames), p.plan.duration);
    exports.push({ name, frames: report.frames, seconds: report.seconds, factor: report.exportFactor, peakCoordinatorRssBytes: report.peakRssBytes });
  }
  console.log(JSON.stringify({ status: 'PASS', output, frames: plan.duration, chromium: browser.browserVersion, parity: { tolerance, maxMae, maxDifferentRatio }, timings, exports, peakCoordinatorRssBytes: peakRss, limitations: ['Single macOS run; no isolated process-tree memory measurement or release speed qualification', 'Authored order covers this fixture; no arbitrary assembly occlusion solver', 'Mechanical grip does not qualify character acting; no blind artistic review'] }, null, 2));
} finally { native.dispose(); await browser?.dispose(); }
