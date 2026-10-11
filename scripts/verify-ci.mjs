import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { verificationSource, sha256, builtRuntimeArtifacts } from './verification-source.mjs';
const initialSource=await verificationSource();
const artifactNames=['@aether-fx/core','@aether-fx/compiler','@aether-fx/canvas','@aether-fx/react','@aether-fx/export','@aether-fx/export/mp4','@aether-fx/export/aac','@aether-fx/node','@aether-fx/node/integrated','@aether-fx/cli'];

let commands = [
  ['npm', ['run', 'lint']], ['npm', ['run', 'check']],
  ['node', ['scripts/verify-bundle-budgets.mjs']],
  ['node', ['scripts/verify-foundation.mjs', 'artifacts/ci-foundation']],
  ['node', ['scripts/inspect-short.mjs']], ['node', ['scripts/verify-resources.mjs']],
  ['node', ['scripts/verify-node-lifecycle.mjs']], ['node', ['scripts/verify-package-metadata.mjs']],
  ['node', ['scripts/verify-node-packages.mjs', 'artifacts/metadata-packages', 'artifacts/ci-node']],
  ['node', ['scripts/verify-react-next.mjs', 'artifacts/ci-next', 'artifacts/metadata-packages']],
  ['node', ['scripts/verify-web-export.mjs', 'artifacts/metadata-packages', 'artifacts/ci-web']],
  ['node', ['scripts/verify-release-config.mjs']],
  ['node', ['scripts/benchmark-export-memory.mjs']], ['node', ['scripts/benchmark-web-memory.mjs']],
  ['node', ['scripts/benchmark-preview.mjs']],
  ['node', ['scripts/verify-authoring.mjs']],
  ['node', ['scripts/verify-native-lifecycle.mjs']],
  ['node', ['scripts/verify-lsp.mjs']],
  ['node', ['scripts/fuzz.mjs', '100000', '.work/aether-fx/fuzz-acceptance']],
  ['npm', ['run', 'playground:build']],
  ['node', ['scripts/verify-playground.mjs']],
  ['node', ['scripts/verify-quickstart.mjs']],
  ['node', ['packages/cli/dist/afx.js','render','fixtures/short/little-light.afx','--format','mp4','--out','artifacts/ci-node.mp4']],
  ['node', ['scripts/verify-mp4.mjs','artifacts/ci-node.mp4','artifacts/ci-node-decode.json']],
  ['node', ['scripts/verify-browser-mp4.mjs','artifacts/ci-browser-mp4','chromium','wasm']],
  ['node', ['scripts/verify-mp4.mjs','artifacts/ci-browser-mp4/chromium.mp4','artifacts/ci-browser-mp4/decode.json']],
  ['node', ['scripts/verify-scenes.mjs','.work/aether-fx/scenes-acceptance']],
  ['node', ['scripts/verify-scene-quality.mjs','.work/aether-fx/scenes-acceptance']],
  ['node', ['scripts/eval/harness.mjs','recorded']]
];
const scope=process.argv.includes('--distribution')?'distribution':'full';
if(scope==='distribution')commands=commands.filter((_,i)=>[0,1,2,6,7,8,9,10,16,21,22,23].includes(i));
await mkdir('artifacts/ci', { recursive: true });
const results = [];
for (const [command, args] of commands) {
  console.log('Acceptance: ' + [command, ...args].join(' '));
  const start = Date.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    const timer=setTimeout(()=>child.kill('SIGKILL'),600000);
    child.once('error', error=>{clearTimeout(timer);reject(error);}); child.once('close', code=>{clearTimeout(timer);resolve(code);});
  });
  let category='functional';
  if(args.includes('scripts/verify-bundle-budgets.mjs')){
    const bundleReport=await readFile('artifacts/performance/bundle-budget-report.json','utf8').then(JSON.parse).catch(()=>null);
    if(bundleReport?.graphIsolation==='PASS'&&bundleReport.source.treeSha256===initialSource.treeSha256)category='budget';
  }
  if(args.includes('scripts/verify-package-metadata.mjs')||args.includes('scripts/verify-release-config.mjs'))category='distribution';
  results.push({ category, command: [command, ...args], exitCode: code, elapsedMs: Date.now() - start, status: code === 0 ? 'PASS' : 'FAIL' });
  const functionalResults=results.filter(r=>r.category==='functional');
  const source=await verificationSource();const builtArtifacts=Object.fromEntries(await Promise.all(artifactNames.map(async name=>[name,sha256(await readFile(new URL(import.meta.resolve(name))))])));
  await writeFile('artifacts/ci/acceptance-report.json', JSON.stringify({ scope,functionalAcceptance:{complete:results.length===commands.length&&functionalResults.every(r=>r.status==='PASS'),results:functionalResults,qualification:'Separates numeric budget failures only after graph-isolation checks pass; excludes metadata/release configuration, includes isolated consumers. Complete acceptance still requires every gate.'},source,initialSourceTreeSha256:initialSource.treeSha256,builtArtifacts,runtimeArtifacts:await builtRuntimeArtifacts(),date:new Date().toISOString(),platform:process.platform,arch:process.arch,node: process.version, results, ranAll: results.length === commands.length, complete: results.length === commands.length && results.every(r => r.status === 'PASS') }, null, 2) + '\n');
  // Preserve every result; independent gates continue after a failed budget or host check.
}

assert(results.every(r=>r.status==='PASS'), 'Acceptance failed; see every executed gate in artifacts/ci/acceptance-report.json');
