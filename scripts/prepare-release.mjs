import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, lstat, readlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { loadReleaseArchives } from './release-archives.mjs';
import { readReleaseConfig } from './release-config.mjs';

const release = await readReleaseConfig(), archives = await loadReleaseArchives('artifacts/metadata-packages');
const output = 'artifacts/release'; await mkdir(output, { recursive: true });
const run = (command, args) => { const r = spawnSync(command, args, { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const sha = data => createHash('sha256').update(data).digest('hex');
const sourceFiles = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort();
const tree = createHash('sha256');
for (const path of sourceFiles) {
  const info = await lstat(path), bytes = info.isSymbolicLink() ? Buffer.from(await readlink(path)) : await readFile(path);
  tree.update(path + '\0' + (info.isSymbolicLink() ? 'symlink' : info.mode & 0o111 ? 'executable' : 'file') + '\0' + sha(bytes) + '\0');
}
const gates = [], evidence = [];
async function gate(name, paths, predicate) {
  for (const path of paths) {
    let bytes;
    try { bytes = await readFile(path); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const report = JSON.parse(bytes), passed = predicate(report);
    gates.push({ name, status: passed ? 'PASS' : 'FAIL', evidence: path });
    const file = 'evidence/' + name + '.json'; await mkdir(join(output, 'evidence'), { recursive: true }); await writeFile(join(output, file), bytes);
    evidence.push({ file, sha256: sha(bytes) }); return;
  }
  gates.push({ name, status: 'BLOCKED', reason: 'No executed report available' });
}
const allChecks = report => report.checks && Object.values(report.checks).every(value => value === 'PASS');
const sameArchives = report => report.tarballs?.length === archives.length && archives.every(archive => report.tarballs.find(a => a.name === archive.name)?.sha256 === archive.sha256);
await gate('node-consumer', ['artifacts/ci-node/report.json', 'artifacts/documentation-consumer/report.json'], r => allChecks(r) && sameArchives(r));
await gate('next-consumer', ['artifacts/ci-next/react-next-report.json', 'artifacts/seven-package-next/react-next-report.json'], r => allChecks(r) && sameArchives(r));
await gate('browser-consumer', ['artifacts/ci-web/report.json', 'artifacts/seven-package-web/report.json'], r => sameArchives(r) && r.results?.length === 3 && r.results.every(b => b.capability.ok && allChecks(b)));
await gate('video-decode', ['artifacts/ci-web/video-report.json', 'artifacts/seven-package-web/video-report.json'], r => r.results?.length === 5 && r.results.every(allChecks));
await gate('head-torso-connection', ['artifacts/short/head-torso-report.json'], r => allChecks(r) && r.frames?.length === 8 && r.frames.every(frame => frame.checkedPixels === 198));
await gate('scope-migration', ['artifacts/release-config/report.json'], allChecks);
await gate('preview-performance', ['artifacts/performance/preview-report.json'], allChecks);
await gate('node-export-memory', ['artifacts/performance/export-memory-report.json'], allChecks);
await gate('browser-export-memory', ['artifacts/performance/web-memory-report.json'], allChecks);
await gate('bundle-budgets', ['artifacts/performance/bundle-budget-report.json'], r => r.checks?.length === 4 && r.checks.every(c => c.status === 'PASS'));
const workflowHashes = new Map(await Promise.all(['.github/workflows/ci.yml', '.github/workflows/release.yml'].map(async path => [path, sha(await readFile(path))])));
await gate('workflow-validation', ['artifacts/ci/workflow-audit.json', '.github/workflow-audit.json'], r => r.actionlint?.workflowSyntax === 'PASS' && r.files?.length === workflowHashes.size && r.files.every(file => workflowHashes.get(file.path) === file.sha256));
await gate('acceptance-command-matrix', ['artifacts/ci/acceptance-report.json'], r => r.complete === true && r.results?.length === 15 && r.results.every(result => result.status === 'PASS' && result.exitCode === 0));
gates.push({ name: 'hosted-ci', status: process.env.GITHUB_ACTIONS === 'true' && gates.at(-1).status === 'PASS' ? 'PASS' : 'BLOCKED', reason: 'Hosted execution requires the prepared workflows; local reports do not prove an Ubuntu Actions run' });
let identity;
try { identity = JSON.parse(await readFile('artifacts/publication-identity/report.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
gates.push({ name: 'npm-scope-authority', status: identity?.authorityVerified === true ? 'PASS' : 'BLOCKED', reason: identity?.authenticated ? `Authenticated as ${identity.account}; organization query ${identity.error ?? 'has no verified ownership role'}. A 404 does not prove scope availability or control` : 'Authenticated scope ownership and package permissions are unverified' }, { name: 'trusted-publisher-bootstrap', status: 'BLOCKED', reason: 'First-publication authentication, publisher settings and future publication authorization remain external' });
for (const name of ['acceptance-report', 'preview-report', 'investigation']) {
  let bytes;
  try { bytes = await readFile(`artifacts/ci/failed-preview/${name}.json`); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const file = `evidence/prior-failed-${name}.json`;
  await writeFile(join(output, file), bytes); evidence.push({ file, sha256: sha(bytes) });
}
for (const [path, name] of [['artifacts/ci/timeout-preview/acceptance-report.json', 'timeout-acceptance'], ['artifacts/ci/timeout-preview/incident.json', 'timeout-incident'], ['artifacts/ci/preview-diagnosis.json', 'preview-diagnosis']]) {
  let bytes;
  try { bytes = await readFile(path); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const file = `evidence/${name}.json`; await writeFile(join(output, file), bytes); evidence.push({ file, sha256: sha(bytes) });
}
const packed = [];
for (const archive of archives) { const filename = basename(archive.path); await cp(archive.path, join(output, filename)); packed.push({ name: archive.name, version: release.version, filename, sha256: archive.sha256, bytes: archive.bytes }); }
for (const file of ['LICENSE', 'NOTICE', 'CHANGELOG.md', 'RELEASE-READINESS.md', 'README.md']) await cp(file, join(output, file));
await cp('docs', join(output, 'docs'), { recursive: true });
await cp('fixtures/short', join(output, 'reference-short'), { recursive: true });
const referenceShort = { source: 'reference-short/little-light.afx', sha256: sha(await readFile('fixtures/short/little-light.afx')), frames: 480 };
const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), ...release, publicationReady: false, referenceShort, source: { commit: run('git', ['rev-parse', 'HEAD']), dirty: Boolean(run('git', ['status', '--porcelain'])), treeSha256: tree.digest('hex'), method: 'Sorted git tracked/unignored file path, mode category and SHA-256 separated by NUL; includes uncommitted source and documentation' }, tools: { node: process.version, npm: run('npm', ['--version']), ffmpeg: run('ffmpeg', ['-version']).split('\n')[0], playwright: JSON.parse(await readFile('node_modules/playwright/package.json')).version, typescript: JSON.parse(await readFile('node_modules/typescript/package.json')).version, esbuild: JSON.parse(await readFile('node_modules/esbuild/package.json')).version }, repository: run('git', ['remote', 'get-url', 'origin']), publishOrder: packed.map(a => a.name), archives: packed, evidence, gates, publicationCommands: packed.map(a => `npm publish artifacts/release/${a.filename} --access public --registry https://registry.npmjs.org/`), limitations: ['Preparation only; publication job disabled and no npm publication authorized', 'Gate reports retain their observed hardware/platform and scope; physical mobile and optional MP4 acceptance are provisional/unverified', 'A commit with dirty=true is a base reference; treeSha256 identifies actual source contents. Regenerate after any source/documentation change'] };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(output, 'SHA256SUMS'), packed.map(a => `${a.sha256}  ${a.filename}`).join('\n') + '\n');
await writeFile(join(output, 'CHECKLIST.md'), '# Release checklist\n\nPrepared, unpublished. Publication ready: **false**.\n\n| Gate | Status | Evidence / reason |\n| --- | --- | --- |\n' + gates.map(g => `| ${g.name} | ${g.status} | ${g.evidence ?? g.reason} |`).join('\n') + '\n\nPublication is core → compiler/canvas → react/export → node → cli. If a package fails, inspect already-published versions and compare archive integrity before resuming; never overwrite/reuse a published name/version.\n');
console.log(JSON.stringify({ output, archives: packed.length, gates, publicationReady: false }, null, 2));
