import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const commands = [
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
  ['node', ['scripts/benchmark-preview.mjs']]
];
await mkdir('artifacts/ci', { recursive: true });
const results = [];
for (const [command, args] of commands) {
  console.log('Acceptance: ' + [command, ...args].join(' '));
  const start = Date.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject); child.once('close', resolve);
  });
  results.push({ command: [command, ...args], exitCode: code, elapsedMs: Date.now() - start, status: code === 0 ? 'PASS' : 'FAIL' });
  await writeFile('artifacts/ci/acceptance-report.json', JSON.stringify({ node: process.version, results, complete: results.length === commands.length && results.every(r => r.status === 'PASS') }, null, 2) + '\n');
  assert.equal(code, 0, 'Acceptance command failed; subsequent gates were not run');
}
