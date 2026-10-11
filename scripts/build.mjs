import { build } from 'esbuild';
import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { checkReleaseManifests, packageOrder as order } from './release-config.mjs';
import { schemaCode } from './schema-code.mjs';
await checkReleaseManifests();
for (const name of (await readdir('packages', { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
  const root = `packages/${name}`;
  const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  await copyFile('LICENSE', `${root}/LICENSE`);
  await copyFile('NOTICE', `${root}/NOTICE`);
  // Preserve browser package module boundaries so consumers can discard unused
  // modules, including their initialization, before bundling. No code splitting
  // or new externals: the consumer budget bundles every reachable dependency.
  const modular = ['core', 'compiler', 'canvas', 'export'].includes(name);
  await build({
    ...(modular ? { entryPoints: (await readdir(`${root}/src`)).filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts')).map(file => `${root}/src/${file}`), outdir: `${root}/dist` } : { entryPoints: [`${root}/src/index.${name === 'react' ? 'tsx' : 'ts'}`], outfile: `${root}/dist/index.js` }),
    bundle: !modular, packages: 'external', format: 'esm', platform: ['node','cli'].includes(name)?'node':'neutral', target: 'es2022', supported: { 'import-attributes': true },
    sourcemap: true, minifySyntax: modular, ...(name === 'react' ? { banner: { js: "'use client';" } } : {}),
    ...(name === 'core' ? { plugins: [{ name: 'immutable-schema-rules', setup(b) {
      b.onLoad({ filter: /\/core\/src\/schema\.ts$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8'), schema = JSON.parse(await readFile(`${root}/src/document.schema.json`, 'utf8'));
        return { contents: source.replace("import schema from './document.schema.json' with { type: 'json' };", schemaCode(schema.$defs)), loader: 'ts' };
      });
    } }] } : {})
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
  if (name === 'node') await build({entryPoints:[`${root}/src/integrated.ts`],outfile:`${root}/dist/integrated.js`,bundle:true,packages:'external',format:'esm',platform:'node',target:'es2022',sourcemap:true});
  if (name === 'node') await build({ entryPoints: [`${root}/src/browser.ts`], outfile: `${root}/dist/renderer.js`, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', sourcemap: true });
  if (name === 'cli') {await mkdir(`${root}/dist/assets`,{recursive:true});await copyFile('fixtures/short/assets/Nunito.ttf',`${root}/dist/assets/Nunito.ttf`);await copyFile('fixtures/short/assets/Nunito-OFL.txt',`${root}/dist/assets/Nunito-OFL.txt`);}
  if (name === 'cli') await build({ entryPoints: [`${root}/src/afx.ts`], outfile: `${root}/dist/afx.js`, bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'es2022', sourcemap: true });
  console.log(`Built ${pkg.name}`);
}
