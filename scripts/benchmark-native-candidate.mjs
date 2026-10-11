import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { verificationSource } from './verification-source.mjs';
const out = process.argv[2];
assert(out && process.argv.length === 3, 'Usage: node scripts/benchmark-native-candidate.mjs fresh-directory');
await mkdir(out); // Refuse to combine fresh measurements with old files.
const run = async args => {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', detached: true });
    let killTimer;
    const watchdog = setTimeout(() => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2000); }, 360000);
    child.once('error', error => { clearTimeout(watchdog); clearTimeout(killTimer); reject(error); });
    child.once('close', code => { clearTimeout(watchdog); clearTimeout(killTimer); resolve(code); });
  });
  assert.equal(code, 0, 'Benchmark/decode failed; retain all partial evidence');
};
const runs = [], source = await verificationSource();
for (let i = 1; i <= 3; i++) {
  const report = `${out}/run-${i}.json`;
  await run(['packages/cli/dist/afx.js', 'bench', 'fixtures/short/little-light.afx', '--backend', 'native', '--width', '1280', '--height', '720', '--repeat', '1', '--timeout', '300000', '--out', report]);
  runs.push(JSON.parse(await readFile(report)));
  await writeFile(`${out}/runs.json`, JSON.stringify({ source, runs, complete: false, qualification: 'Same versioned reference scene/audio and encoding parameters; sequential observations on the recorded host. Linux timing does not qualify the macOS reference target.' }, null, 2) + '\n');
  await run(['scripts/verify-video.mjs', report + '.webm', '--report', `${out}/decode-${i}.json`]);
}
await run(['scripts/profile-native-export.mjs', `${out}/profile-final.json`]);
await writeFile(`${out}/runs.json`, JSON.stringify({ source, runs, complete: true, qualification: 'Three consecutive exports with independent decode; no baseline/private machine files required. Host-specific observations, not cross-platform performance equivalence.' }, null, 2) + '\n');
