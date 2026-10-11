import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readReleaseConfig } from './release-config.mjs';

const root = process.cwd(), original = await readReleaseConfig();
const directory = await mkdtemp(join(tmpdir(), 'afx release scope '));
const ignored = new Set(['.git', 'node_modules', 'artifacts', '.next', 'dist', 'project', 'public', 'test-results', '.work']);
const run = (args, cwd = directory, success = true) => {
  const result = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
  if (success) assert.equal(result.status, 0, `${args.join(' ')}: ${result.error ?? result.stderr}\n${result.stdout}`);
  else assert.notEqual(result.status, 0, 'Invalid or unsynchronized configuration was accepted');
  return result;
};
try {
  await cp(root, directory, { recursive: true, filter: path => !relative(root, path).split('/').some(part => ignored.has(part)) });
  const configPath = join(directory, 'release.config.json');
  await writeFile(configPath, JSON.stringify({ ...original, scope: 'invalid/unscoped' }));
  assert.match(run([process.execPath, 'scripts/sync-release.mjs', '--write'], directory, false).stderr, /Invalid npm scope/);
  await writeFile(configPath, JSON.stringify({ ...original, version: '01.0.0' }));
  assert.match(run([process.execPath, 'scripts/sync-release.mjs', '--write'], directory, false).stderr, /stable joint package version/);
  const alternate = { scope: '@afx-scope-check', version: '0.2.1' };
  await writeFile(configPath, JSON.stringify(alternate, null, 2) + '\n');
  assert.match(run([process.execPath, 'scripts/sync-release.mjs', '--check'], directory, false).stderr, /Release configuration drift/);
  const synchronized = JSON.parse(run([process.execPath, 'scripts/sync-release.mjs', '--write']).stdout);
  for (const path of ['packages/react/src/index.tsx', 'packages/core/package.json', 'package-lock.json', 'examples/next-app/package-lock.json', 'scripts/verify-foundation.mjs']) assert(synchronized.changedFiles.includes(path));
  assert.deepEqual(JSON.parse(run([process.execPath, 'scripts/sync-release.mjs', '--check']).stdout).changedFiles, []);
  run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  const checks = run(['npm', 'run', 'check']);
  assert.match(checks.stdout, /Tests\s+\d+ passed/); // Exit status already proves the complete current suite passed.
  run([process.execPath, 'scripts/verify-node-packages.mjs']);
  const nodeReport = JSON.parse(await readFile(join(directory, 'artifacts/node-packages/report.json'), 'utf8'));
  assert.equal(nodeReport.tarballs.length, 7);
  assert(nodeReport.tarballs.every(t => t.name.startsWith(alternate.scope + '/')));
  run([process.execPath, 'scripts/prepare-next-example.mjs']);
  run(['npm', 'run', 'typecheck'], join(directory, 'examples/next-app'));
  const nextLock = JSON.parse(await readFile(join(directory, 'examples/next-app/package-lock.json'), 'utf8'));
  assert(!Object.keys(nextLock.packages).some(key => key.startsWith('node_modules/' + original.scope + '/')));
  await writeFile(configPath, JSON.stringify(original, null, 2) + '\n');
  run([process.execPath, 'scripts/sync-release.mjs', '--write']);
  assert.deepEqual(JSON.parse(run([process.execPath, 'scripts/sync-release.mjs', '--check']).stdout).changedFiles, []);
  const report = { node: process.version, original, alternate, changedFiles: synchronized.changedFiles, checks: { invalidScopeAndVersionRejected: 'PASS', driftRejected: 'PASS', coherentScopeAndJointVersion: 'PASS', idempotentSync: 'PASS', cleanNpmCiBuildTypesAndTests: 'PASS', sevenAlternateScopeTarballsAndCliExport: 'PASS', rebuiltNextExampleAndTypes: 'PASS', roundtripToOriginalConfiguration: 'PASS' }, limits: ['Isolated unpublished test scope; no registry ownership assertion or npm publication', 'Next example declarations/install checked here; production browser lifecycle remains a separate gate'] };
  const output = resolve('artifacts/release-config'); await mkdir(output, { recursive: true });
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'alternate-node-report.json'), JSON.stringify(nodeReport, null, 2) + '\n');
  console.log(JSON.stringify({ report: join(output, 'report.json'), checks: report.checks }, null, 2));
} finally { await rm(directory, { recursive: true, force: true }); }
