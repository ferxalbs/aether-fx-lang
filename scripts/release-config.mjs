import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const packageOrder = ['core', 'compiler', 'canvas', 'react', 'export', 'node', 'cli'];
export async function readReleaseConfig(root = process.cwd()) {
  const config = JSON.parse(await readFile(join(root, 'release.config.json'), 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), ['scope', 'version']);
  assert.match(config.scope, /^@[a-z0-9][a-z0-9._-]*$/, 'Invalid npm scope');
  assert.match(config.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.[1-9]\d*)?$/, 'Use a stable joint package version or rc.N prerelease');
  return config;
}
export async function checkReleaseManifests(root = process.cwd()) {
  const config = await readReleaseConfig(root);
  for (const name of packageOrder) {
    const pkg = JSON.parse(await readFile(join(root, 'packages', name, 'package.json'), 'utf8'));
    assert.equal(pkg.name, `${config.scope}/${name}`, 'Run npm run release:sync after editing release.config.json');
    assert.equal(pkg.version, config.version, 'Run npm run release:sync after editing release.config.json');
    for (const [dependency, version] of Object.entries(pkg.dependencies ?? {})) {
      if (dependency.startsWith(config.scope + '/')) assert.equal(version, config.version);
    }
  }
  return config;
}
