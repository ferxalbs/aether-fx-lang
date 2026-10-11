import { build } from 'esbuild';
import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const order = ['core', 'compiler', 'canvas', 'react', 'export', 'node', 'cli'];
for (const name of (await readdir('packages')).sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
  const root = `packages/${name}`;
  const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  await build({
    entryPoints: [`${root}/src/index.ts`], outfile: `${root}/dist/index.js`,
    bundle: true, packages: 'external', format: 'esm', platform: 'neutral', target: 'es2022',
    sourcemap: true, ...(name === 'react' ? { banner: { js: "'use client';" } } : {})
  });
  await mkdir(`${root}/dist`, { recursive: true });
  const config = {
    extends: '../../tsconfig.json', compilerOptions: {
      declaration: true, emitDeclarationOnly: true, rootDir: './src', outDir: './dist'
    }, include: ['src/**/*']
  };
  await writeFile(`${root}/tsconfig.build.json`, JSON.stringify(config, null, 2) + '\n');
  const result = spawnSync('node_modules/.bin/tsc', ['-p', `${root}/tsconfig.build.json`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (name === 'core') await copyFile(`${root}/src/document.schema.json`, `${root}/dist/document.schema.json`);
  console.log(`Built ${pkg.name}`);
}
