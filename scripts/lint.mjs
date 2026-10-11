import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';

// Syntax lint uses the installed Node/esbuild toolchain; semantic types are checked separately by tsc.
const ignored = new Set(['node_modules', 'dist', '.next', 'project', 'public']);
let checked = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !ignored.has(entry.name)) await visit(path);
    else if (entry.isFile() && /\.(?:mjs|js|ts|tsx|json)$/.test(entry.name)) {
      const source = await readFile(path, 'utf8');
      if (path.endsWith('.json')) JSON.parse(source);
      else if (/\.tsx?$/.test(path)) await transform(source, { loader: path.endsWith('.tsx') ? 'tsx' : 'ts', sourcefile: path });
      else {
        const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
      }
      checked++;
    }
  }
}
for (const directory of ['packages', 'scripts', 'tests', 'examples']) await visit(directory);
for (const path of ['package.json', 'package-lock.json', 'release.config.json', 'bundle-budgets.json', 'tsconfig.json']) { JSON.parse(await readFile(path, 'utf8')); checked++; }
console.log(JSON.stringify({ syntaxAndJsonFiles: checked, status: 'PASS', semanticTypes: 'Run npm run typecheck separately' }));
