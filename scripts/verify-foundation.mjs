import { mkdtemp, mkdir, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { compileSource } from '@aether-fx/compiler';
import { evaluate } from '@aether-fx/core';
const root = process.cwd(), out = resolve(process.argv[2] ?? 'artifacts/foundation');
await mkdir(out, { recursive: true });
const consumer = await mkdtemp(join(tmpdir(), 'afx consumer '));
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.error ?? result.stderr}\n${result.stdout}`);
  return result.stdout;
};
let browser, server;
try {
  const tarballs = [];
  for (const name of ['core', 'compiler', 'canvas']) {
    const dry = JSON.parse(run('npm', ['pack', '--dry-run', '--json'], join(root, 'packages', name)))[0];
    assert(!dry.files.some(f => f.path.startsWith('src/') || f.path.includes('node_modules') || f.path.endsWith('.tgz')));
    assert(dry.files.some(f => f.path === 'dist/index.js'));
    assert(dry.files.some(f => f.path === 'dist/index.d.ts'));
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', out], join(root, 'packages', name)))[0];
    const file = join(out, packed.filename), bytes = await readFile(file);
    tarballs.push({ name: `@aether-fx/${name}`, path: file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, files: dry.files.map(f => f.path) });
  }
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs.map(t => t.path)], consumer);
  for (const t of tarballs) assert(!(await lstat(join(consumer, 'node_modules', t.name))).isSymbolicLink());
  const source = await readFile('fixtures/curve.afx', 'utf8');
  await writeFile(join(consumer, 'fixture.afx'), source);
  await writeFile(join(consumer, 'verify.mjs'), `import {readFile} from 'node:fs/promises';import {compileSource} from '@aether-fx/compiler';import {evaluate,deserializePlan,serializePlan} from '@aether-fx/core';import {createRenderer,createPlayer} from '@aether-fx/canvas';const r=compileSource(await readFile('fixture.afx','utf8'));if(!r.ok)throw new Error(JSON.stringify(r));if(evaluate(r.value,{frame:97}).commands[0].matrix[4]!==442.5)throw new Error('Seek mismatch');if(!deserializePlan(serializePlan(r.value)).ok)throw new Error('Plan roundtrip');console.log('ISOLATED_NODE_PASS');`);
  assert.match(run(process.execPath, ['verify.mjs'], consumer), /ISOLATED_NODE_PASS/);
  await writeFile(join(consumer, 'consumer.ts'), `import {compileSource} from '@aether-fx/compiler';import {evaluate,type PlaybackPlan} from '@aether-fx/core';import {createPlayer,createRenderer} from '@aether-fx/canvas';const result=compileSource('');if(result.ok){const plan:PlaybackPlan=result.value;evaluate(plan,{frame:0});createPlayer(document.createElement('canvas'),plan);createRenderer(document.createElement('canvas'));}`);
  await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', noEmit: true, skipLibCheck: false }, files: ['consumer.ts'] }));
  run(join(root, 'node_modules/.bin/tsc'), ['-p', join(consumer, 'tsconfig.json')], consumer);
  await writeFile(join(consumer, 'browser.js'), `import {compileSource} from '@aether-fx/compiler';import {evaluate,compile} from '@aether-fx/core';import {createRenderer,createPlayer} from '@aether-fx/canvas';const result=compileSource(${JSON.stringify(source)});if(!result.ok)throw new Error(JSON.stringify(result));globalThis.afx={plan:result.value,evaluate,compile,createRenderer,createPlayer};globalThis.ready=true;`);
  await build({ entryPoints: [join(consumer, 'browser.js')], outfile: join(consumer, 'bundle.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
  server = createServer(async (req, res) => { if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(join(consumer, 'bundle.js'))); } else { res.setHeader('Content-Type', 'text/html'); res.end('<canvas id="canvas" width="1280" height="720"></canvas><script type="module" src="/bundle.js"></script>'); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 740 }, deviceScaleFactor: 1 });
  const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
  const address = server.address(); await page.goto(`http://127.0.0.1:${address.port}/`); await page.waitForFunction(() => globalThis.ready === true);
  const result = compileSource(source); assert(result.ok);
  const expected = Array.from({ length: 480 }, (_, frame) => evaluate(result.value, { frame }));
  const states = await page.evaluate(() => Array.from({ length: 480 }, (_, frame) => globalThis.afx.evaluate(globalThis.afx.plan, { frame })));
  assert.deepEqual(states, expected);
  const rendered = await page.evaluate(async () => {
    const { plan, evaluate, createRenderer, createPlayer } = globalThis.afx, canvas = document.getElementById('canvas');
    const renderer = createRenderer(canvas); renderer.render(evaluate(plan, { frame: 97 }));
    const pixel = Array.from(canvas.getContext('2d').getImageData(493, 280, 1, 1).data); renderer.dispose();
    const player = createPlayer(canvas, plan); player.seekFrame(97); const current = player.getCurrentFrame(); player.resize(640, 360, 2); const dimensions = [canvas.width, canvas.height]; player.dispose(); player.dispose();
    let rejected = false; try { player.seekFrame(1); } catch { rejected = true; }
    const stats = [];
    for (let i = 0; i < 50; i++) { const p = createPlayer(canvas, plan); p.seekFrame(i); await p.play(); p.pause(); stats.push(p.getStats().renderedFrames); p.dispose(); }
    const d = structuredClone(plan.document);
    const rectangle = (id, x, y, w, h) => ({ id, start: [x, y], closed: true, segments: [[x + w, y], [x + w, y + h], [x, y + h], [x, y]].map((end, i) => ({ id: 's' + i, control1: end, control2: end, end })) });
    d.shapes[0].contours = [rectangle('outer', 0, 0, 100, 100), rectangle('hole', 25, 25, 50, 50)];
    d.actors[0].transform.x = 0; d.actors[0].transform.y = 0; d.parts[0].material = { fill: '#00ff00', stroke: null, strokeWidth: 0, fillRule: 'evenodd' };
    d.parts.push({ ...structuredClone(d.parts[0]), id: 'cover', material: { fill: '#ff0000', stroke: null, strokeWidth: 0, fillRule: 'nonzero' } });
    d.actors.push({ ...structuredClone(d.actors[0]), id: 'front', parts: ['cover'], transform: { ...d.actors[0].transform, x: 60 }, layer: 1 });
    d.shots = [{ ...d.shots[0], duration: 1, keys: [], morphs: [], exposures: [] }];
    const checked = globalThis.afx.compile(d); if (!checked.ok) throw new Error(JSON.stringify(checked));
    const r = createRenderer(canvas); r.render(evaluate(checked.value, { frame: 0 }));
    const sample = (x, y) => Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
    const holes = { hole: sample(50, 50), outer: sample(10, 10), front: sample(70, 10) }; r.dispose();
    d.parts[0].material.fillRule = 'nonzero';
    const solidPlan = globalThis.afx.compile(d); if (!solidPlan.ok) throw new Error(JSON.stringify(solidPlan));
    const solidRenderer = createRenderer(canvas); solidRenderer.render(evaluate(solidPlan.value, { frame: 0 }));
    const nonzeroInterior = sample(50, 50); solidRenderer.dispose(); d.parts[0].material.fillRule = 'evenodd';
    // A discrete layer change must alter actual occlusion, including direct/reverse seeks.
    d.shots[0].duration = 2;
    d.shots[0].keys = [{ id: 'behind', target: 'front', property: 'layer', frame: 1, value: -1, easing: 'linear', rotation: 'direct', hold: 1 }];
    const occlusionPlan = globalThis.afx.compile(d); if (!occlusionPlan.ok) throw new Error(JSON.stringify(occlusionPlan));
    const occlusionRenderer = createRenderer(canvas), occlusion = [];
    for (const frame of [0, 1, 0, 1]) { occlusionRenderer.render(evaluate(occlusionPlan.value, { frame })); occlusion.push(sample(70, 10)); }
    occlusionRenderer.dispose();
    // Self-crossing cubic contours keep their authored order; no geometric remapping.
    d.actors.pop(); d.parts.pop(); d.shots[0].duration = 1; d.shots[0].keys = [];
    d.shapes[0].contours = [{ id: 'crossing', start: [0, 0], closed: true, segments: [[100, 100], [0, 100], [100, 0], [0, 0]].map((end, i) => ({ id: 'cross' + i, control1: end, control2: end, end })) }];
    const crossings = {};
    for (const rule of ['evenodd', 'nonzero']) {
      d.parts[0].material.fillRule = rule;
      const crossingPlan = globalThis.afx.compile(d); if (!crossingPlan.ok) throw new Error(JSON.stringify(crossingPlan));
      const crossingRenderer = createRenderer(canvas); crossingRenderer.render(evaluate(crossingPlan.value, { frame: 0 }));
      crossings[rule] = { top: sample(50, 10), bottom: sample(50, 90), outside: sample(10, 50) }; crossingRenderer.dispose();
    }
    let callbacks = 0; const nativeRAF = globalThis.requestAnimationFrame, nativeCancel = globalThis.cancelAnimationFrame, active = new Set();
    globalThis.requestAnimationFrame = fn => { let handle = nativeRAF(t => { active.delete(handle); callbacks++; fn(t); }); active.add(handle); return handle; };
    globalThis.cancelAnimationFrame = handle => { active.delete(handle); nativeCancel(handle); };
    for (let i = 0; i < 50; i++) { const p = createPlayer(canvas, plan); await p.play(); p.dispose(); }
    await new Promise(resolve => nativeRAF(() => nativeRAF(resolve)));
    globalThis.requestAnimationFrame = nativeRAF; globalThis.cancelAnimationFrame = nativeCancel;
    return { pixel, current, dimensions, rejected, mounts: stats.length, holes, nonzeroInterior, occlusion, crossings, pendingCallbacks: active.size, callbacksAfterDispose: callbacks };
  });
  assert.equal(rendered.current, 97); assert.deepEqual(rendered.dimensions, [1280, 720]); assert(rendered.rejected); assert.deepEqual(rendered.pixel, [36, 99, 235, 255]); assert.deepEqual(rendered.holes, { hole: [0, 0, 0, 0], outer: [0, 255, 0, 255], front: [255, 0, 0, 255] }); assert.equal(rendered.pendingCallbacks, 0); assert.equal(rendered.callbacksAfterDispose, 0);
  assert.deepEqual(rendered.occlusion, [[255, 0, 0, 255], [0, 255, 0, 255], [255, 0, 0, 255], [0, 255, 0, 255]]);
  assert.deepEqual(rendered.nonzeroInterior, [0, 255, 0, 255]);
  const crossingPixels = { top: [0, 255, 0, 255], bottom: [0, 255, 0, 255], outside: [0, 0, 0, 0] };
  assert.deepEqual(rendered.crossings, { evenodd: crossingPixels, nonzero: crossingPixels });
  await page.evaluate(() => { const { plan, evaluate, createRenderer } = globalThis.afx; const c = document.getElementById('canvas'); c.style.width = '1280px'; c.style.height = '720px'; createRenderer(c).render(evaluate(plan, { frame: 97 })); });
  await page.locator('#canvas').screenshot({ path: join(out, 'curve-frame-97.png') });
  assert.deepEqual(pageErrors, []);
  const report = { date: '2026-10-10', node: process.version, npm: run('npm', ['--version']).trim(), chromium: browser.version(), tarballs, checks: { isolatedNode: 'PASS', isolatedTypes: 'PASS', browserBundle: 'PASS', browserNodeAll480Frames: 'PASS', numericCurvePixels: 'PASS', seekAndDpr: 'PASS', repeatedMountDispose: 'PASS', cancelRafOnDispose: 'PASS', evenoddAndLayerPixels: 'PASS', animatedOcclusionPixels: 'PASS', selfCrossingContourPixels: 'PASS' }, rendered, limitations: ['Three foundation packages only; seven-package release not complete', 'Curve fixture is not illustrated acceptance short', 'No audiovisual export, physical mobile, memory or preview performance acceptance claim'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(out, 'SHA256SUMS'), tarballs.map(t => `${t.sha256}  ${t.path.split('/').at(-1)}`).join('\n') + '\n');
  console.log(JSON.stringify({ checks: report.checks, chromium: report.chromium, tarballs: tarballs.map(t => ({ name: t.name, bytes: t.bytes })), report: join(out, 'report.json') }, null, 2));
} finally {
  await browser?.close(); if (server) await new Promise(r => server.close(r)); await rm(consumer, { recursive: true, force: true });
}
