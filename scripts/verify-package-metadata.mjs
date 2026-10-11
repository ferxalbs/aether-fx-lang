import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { checkReleaseManifests } from './release-config.mjs';
import { schemaCode } from './schema-code.mjs';
import { runInNewContext } from 'node:vm';
const definitions=JSON.parse(await readFile('packages/core/src/document.schema.json','utf8')).$defs;
assert.equal(JSON.stringify(runInNewContext(schemaCode(definitions)+'schema.$defs')),JSON.stringify(definitions),'Interned runtime schema must preserve every original rule');
const release=await checkReleaseManifests();
const root=process.cwd(),out=resolve('artifacts/metadata-packages');await mkdir(out,{recursive:true});
const run=(command,args,cwd=root)=>{const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});assert.equal(result.status,0,`${command}: ${result.error??result.stderr}`);return result.stdout;};
const license=await readFile('LICENSE','utf8'),notice=await readFile('NOTICE','utf8'),remote=run('git',['remote','get-url','origin']).trim();
const repository=JSON.parse(await readFile('package.json','utf8')).repository.url;
const repositoryBase=url=>url.replace(/^git\+/,'').replace(/(?:\.git)?\/?$/,'');
assert.equal(repositoryBase(remote),repositoryBase(repository),'Package repository must identify the actual Git remote');
assert(license.includes('Version 2.0, January 2004'));assert(notice.split('\n').includes("Copyright 2026  Fer's"));
const results=[];
for(const name of ['core','compiler','canvas','react','export','node','cli']){
  const directory=join(root,'packages',name),dry=JSON.parse(run('npm',['pack','--dry-run','--json'],directory))[0],files=dry.files.map(f=>f.path);
  for(const file of ['LICENSE','NOTICE','README.md','dist/index.js','dist/index.d.ts'])assert(files.includes(file));
  assert(!files.some(f=>/GOAL|OWNER-ACTIONS|FINAL-REPORT|saas-cost|\.work\//i.test(f)));
  assert(!files.some(f=>/(?:^|\/)(?:ffmpeg|ffprobe)(?:\.|$)|\.(?:node|so|dylib|dll)$/.test(f)),'CI codecs/native binaries must not enter workspace tarballs');
  assert(!files.some(f=>f.startsWith('src/')||f.includes('node_modules')||f.startsWith('assets/')||f.endsWith('.tgz')));
  const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',out],directory))[0],path=join(out,packed.filename);
  const pkg=JSON.parse(run('tar',['-xOf',path,'package/package.json']));
  assert(!Object.keys({...pkg.dependencies,...pkg.optionalDependencies}).some(n=>n==='node-av'||n==='@mediabunny/server'));
  if(name==='export'){assert(!pkg.dependencies['@mediabunny/aac-encoder']);assert.equal(pkg.peerDependenciesMeta['@mediabunny/aac-encoder'].optional,true);}
  assert.equal(pkg.name,`${release.scope}/${name}`);assert.equal(pkg.version,release.version);assert.equal(pkg.license,'Apache-2.0');assert.equal(pkg.type,'module');
  assert.equal(pkg.repository.url,repository);assert.equal(pkg.repository.directory,`packages/${name}`);assert.equal(pkg.homepage,repositoryBase(remote)+'#readme');assert.equal(pkg.bugs.url,repositoryBase(remote)+'/issues');assert(pkg.keywords.includes('aether-fx'));
  assert.equal(pkg.publishConfig.access,'public');assert.equal(pkg.publishConfig.registry,'https://registry.npmjs.org/');
  for(const version of Object.values({...pkg.dependencies,...pkg.peerDependencies}))assert(!/^(?:file:|workspace:|link:)/.test(version));
  for(const entry of Object.values(pkg.exports)){if(typeof entry==='string')assert(files.includes(entry.replace(/^\.\//,'')));else {assert.equal(Object.keys(entry)[0],'types');for(const target of Object.values(entry))assert(files.includes(target.replace(/^\.\//,'')));}}
  for(const file of files.filter(f=>/\.(?:md|json)$/.test(f))){const text=run('tar',['-xOf',path,'package/'+file]);assert(!/npm whoami|authenticated as|ferxalb(?!s)|npm org ls|saas-cost-model|OWNER-ACTIONS|USD ?5|authorized by the owner|this task performed/i.test(text),'Internal package content: '+file);}
  assert.equal(run('tar',['-xOf',path,'package/LICENSE']),license);assert.equal(run('tar',['-xOf',path,'package/NOTICE']),notice);
  results.push({name:pkg.name,path,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),files});
}
assert.equal(await readFile('fixtures/short/assets/Nunito-OFL.txt','utf8'),run('git',['show','HEAD:fixtures/short/assets/Nunito-OFL.txt']));
await writeFile(join(out,'SHA256SUMS'),results.map(r=>`${r.sha256}  ${r.path.split('/').at(-1)}`).join('\n')+'\n');
await writeFile(join(out,'report.json'),JSON.stringify({checks:{sevenRealTarballs:'PASS',apacheLicenseAndExactNotice:'PASS',actualRemoteMetadata:'PASS',exportsAndDependencyProtocols:'PASS',thirdPartyFontNoticePreserved:'PASS'},remote,results,limits:['Metadata and archive verification only; final seven-package isolated consumers and release gates remain separate','Package inspection does not establish hosted or physical-device qualification']},null,2)+'\n');
console.log(JSON.stringify({report:join(out,'report.json'),packages:results.map(r=>r.name),checks:'PASS'}));
