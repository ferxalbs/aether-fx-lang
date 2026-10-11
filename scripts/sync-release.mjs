import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageOrder, readReleaseConfig } from './release-config.mjs';

assert(['--check', '--write'].includes(process.argv[2]), 'Usage: node scripts/sync-release.mjs --check|--write');
const config = await readReleaseConfig();
const previous = JSON.parse(await readFile('packages/core/package.json', 'utf8'));
const oldScope = previous.name.slice(0, previous.name.lastIndexOf('/'));
const files = ['README.md', 'package.json', 'package-lock.json'];
const excluded = new Set(['node_modules', 'dist', '.next', 'project', 'public']);
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) await collect(path);
    else if (entry.isFile() && /\.(?:[cm]?js|tsx?|json|md)$/.test(entry.name)) files.push(path);
  }
}
for (const directory of ['packages', 'scripts', 'tests', 'examples', 'docs']) await collect(directory);
const changes = [];
for (const path of files) {
  const original = await readFile(path, 'utf8');
  let updated = original.replaceAll(oldScope + '/', config.scope + '/').replaceAll(oldScope + '\\/', config.scope + '\\/');
  for (const name of packageOrder) updated = updated.replaceAll(`${oldScope.slice(1)}-${name}-${previous.version}.tgz`, `${config.scope.slice(1)}-${name}-${config.version}.tgz`);
  if (path.endsWith('package.json') || path.endsWith('package-lock.json')) {
    const pkg = JSON.parse(updated);
    const internal = key => packageOrder.some(name => key === `${config.scope}/${name}`);
    const dependencies = object => {
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const key of Object.keys(object[field] ?? {})) {
          if (internal(key) && !object[field][key].startsWith('file:')) object[field][key] = config.version;
        }
      }
    };
    if (path.endsWith('package.json')) {
      if (path === 'package.json' || path.startsWith('packages/') || path === 'examples/next-app/package.json') pkg.version = config.version;
      dependencies(pkg);
    } else {
      pkg.version = config.version;
      for (const [key, entry] of Object.entries(pkg.packages)) {
        if (key === '' || /^packages\/[^/]+$/.test(key) || packageOrder.some(name => key === `node_modules/${config.scope}/${name}`) && !entry.link) {
          entry.version = config.version;
          // A changed tarball identity needs a fresh npm install after rebuilding; never reuse its old integrity.
          if (key.startsWith(`node_modules/${config.scope}/`) && (oldScope !== config.scope || previous.version !== config.version)) delete entry.integrity;
        }
        dependencies(entry);
      }
    }
    updated = JSON.stringify(pkg, null, 2) + '\n';
  }
  if (updated !== original) changes.push({ path, updated });
}
if (process.argv[2] === '--check') assert.equal(changes.length, 0, `Release configuration drift; run npm run release:sync: ${changes.map(change => change.path).join(', ')}`);
else for (const change of changes) await writeFile(change.path, change.updated);
console.log(JSON.stringify({ ...config, mode: process.argv[2], changedFiles: changes.map(change => change.path) }, null, 2));
