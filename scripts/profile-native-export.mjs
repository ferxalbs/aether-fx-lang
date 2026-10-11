import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadProject } from '@aether-fx/node';
import { verificationSource } from './verification-source.mjs';
const out = process.argv[2]; assert(out, 'Usage: node scripts/profile-native-export.mjs report.json');
const verbose = process.argv[3] === '--ffmpeg-verbose';
assert(process.argv.length <= 4 || (process.argv.length === 5 && verbose), 'Only --ffmpeg-verbose is supported');
await mkdir(dirname(out), { recursive: true });
const stages = {}, measure = (name, fn) => { const start = performance.now(); try { return fn(); } finally { stages[name] = (stages[name] ?? 0) + performance.now() - start; } };
globalThis.__afxProfile = { stages, measure };
const instrument = (source, from, to) => { assert(source.includes(from), 'Instrumentation point changed: ' + from); return source.replace(from, to); };
const module = resolve(out + '.instrumented.mjs');
await build({
    entryPoints: ['packages/node/src/export.ts'], outfile: module, bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'es2022', plugins: [{
        name: 'profile-stages', setup(b) {
            b.onLoad({ filter: /packages\/node\/src\/(native|export)\.ts$/ }, async ({ path }) => {
                let source = await readFile(path, 'utf8');
                if (path.endsWith('/native.ts')) {
                    source = instrument(source, 'renderer.render(evaluate(plan,{frame}));', "const list=globalThis.__afxProfile.measure('evaluate',()=>evaluate(plan,{frame}));globalThis.__afxProfile.measure('draw',()=>renderer.render(list));");
                    source = instrument(source, 'return context.getImageData(0,0,width,height).data;', "return globalThis.__afxProfile.measure('rgbaRead',()=>context.getImageData(0,0,width,height).data);");
                } else {
                    if (source.includes('Buffer.from(native.pixels())')) source = instrument(source, 'return Buffer.from(native.pixels());', "const pixels=native.pixels();return globalThis.__afxProfile.measure('rgbaCopy',()=>Buffer.from(pixels));");
                    source = instrument(source, 'await new Promise<void>((resolve, reject) => process!.stdin!.write(bytes, cause => cause ? reject(cause) : resolve()));', 'const writeStart=performance.now();await new Promise<void>((resolve, reject) => process!.stdin!.write(bytes, cause => cause ? reject(cause) : resolve()));globalThis.__afxProfile.stages.pipeWait=(globalThis.__afxProfile.stages.pipeWait??0)+performance.now()-writeStart;');
                    source = instrument(source, 'process = spawn(', `globalThis.__afxProfile.ffmpegArgs=[...args];${verbose ? "args[args.indexOf('-loglevel')+1]='verbose';" : ''}globalThis.__afxProfile.encodingStart=performance.now();process = spawn(`);
                    if (verbose) source = instrument(source, "stderr = (stderr + bytes.toString()).slice(-16000);", "globalThis.__afxProfile.ffmpegLog=(globalThis.__afxProfile.ffmpegLog??'')+bytes.toString();stderr = (stderr + bytes.toString()).slice(-16000);");
                    source = instrument(source, 'finished = true;', 'globalThis.__afxProfile.stages.encodingLifetime=performance.now()-globalThis.__afxProfile.encodingStart;finished = true;');
                    source = instrument(source, 'process.stdin!.end(); await completion;', "const finishStart=performance.now();process.stdin!.end(); await completion;globalThis.__afxProfile.stages.finalize=performance.now()-finishStart;");
                }
                return { contents: source, loader: 'ts' };
            });
        }
    }]
});
try {
    const project = await loadProject('fixtures/short/little-light.afx'); assert(project.ok);
    const { exportVideo } = await import(module);
    const report = await exportVideo(project.value, { backend: 'native', width: 1280, height: 720, output: out + '.webm', timeoutMs: 300000 });
    const data = { date: new Date().toISOString(), source: await verificationSource(), node: process.version, platform: process.platform, report, stagesMs: stages, ffmpegArgs: globalThis.__afxProfile.ffmpegArgs, verbose, ...(verbose ? { ffmpegLog: globalThis.__afxProfile.ffmpegLog } : {}), method: 'Instrumented source copy; synchronous evaluation/draw/read/copy and awaited pipe/finalization wall time. FFmpeg encoding overlaps all producer stages and pipe wait; its total is not an additional sequential stage. No change to codec/quality/frame/audio parameters. ffmpegArgs records the production command before any optional verbose logging change. Verbose mode is diagnostic, not a comparable benchmark. Use afx bench for uninstrumented totals and process-tree RSS.' };
    await writeFile(out, JSON.stringify(data, null, 2) + '\n'); console.log({ seconds: report.seconds, stagesMs: stages });
} finally { delete globalThis.__afxProfile; await rm(module, { force: true }); }
