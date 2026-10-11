import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { checkReleaseManifests, packageOrder } from './release-config.mjs';

/** Load the complete metadata-verified release set without repacking it. */
export async function loadReleaseArchives(directory, root = process.cwd()) {
  directory = resolve(directory);
  const release = await checkReleaseManifests(root);
  const report = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'));
  for (const check of ['sevenRealTarballs', 'apacheLicenseAndExactNotice', 'actualRemoteMetadata', 'exportsAndDependencyProtocols', 'thirdPartyFontNoticePreserved']) assert.equal(report.checks[check], 'PASS', `Metadata gate not passed: ${check}`);
  assert.equal(report.results.length, packageOrder.length);
  assert.deepEqual(report.results.map(archive => archive.name).sort(), packageOrder.map(name => `${release.scope}/${name}`).sort());
  const archives = [];
  for (const name of packageOrder) {
    const recorded = report.results.find(archive => archive.name === `${release.scope}/${name}`);
    const path = join(directory, basename(recorded.path));
    assert.equal(basename(path), `${release.scope.slice(1)}-${name}-${release.version}.tgz`);
    const bytes = await readFile(path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), recorded.sha256, `Archive hash mismatch: ${name}`);
    archives.push({ ...recorded, path, bytes: bytes.length });
  }
  return archives;
}
