import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

export async function measureBrowserBundles(){
  const bundles=[];
  for(const [name,contents] of [
    ['core',"export * from '@aether-fx/core';"],
    ['player',"export {createPlayer,createRenderer,loadResources} from '@aether-fx/canvas';"],
    ['parser',"export * from '@aether-fx/compiler';"],
    ['export',"export * from '@aether-fx/export';"]
  ]){
    const result=await build({stdin:{contents,resolveDir:process.cwd(),sourcefile:name+'.js'},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false,metafile:true});
    const bytes=result.outputFiles[0].contents,inputs=Object.keys(result.metafile.inputs);
    assert(!inputs.some(p=>/playwright|packages\/node\/|@aether-fx\/node\//.test(p)),name+' imports Node tooling');
    if(name==='core'||name==='player')assert(!inputs.some(p=>/chevrotain|packages\/compiler\/|@aether-fx\/compiler\//.test(p)),name+' imports the parser');
    bundles.push({name,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,sha256:createHash('sha256').update(bytes).digest('hex'),inputs});
  }
  return bundles;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const budget=JSON.parse(await readFile('bundle-budgets.json','utf8')),bundles=await measureBrowserBundles();
  assert.deepEqual(Object.keys(budget.maxGzipBytes).sort(),bundles.map(b=>b.name).sort());
  const checks=bundles.map(bundle=>({...bundle,maxGzipBytes:budget.maxGzipBytes[bundle.name],status:bundle.gzipBytes<=budget.maxGzipBytes[bundle.name]?'PASS':'FAIL'}));
  await mkdir('artifacts/performance',{recursive:true});
  await writeFile('artifacts/performance/bundle-budget-report.json',JSON.stringify({node:process.version,budget,checks},null,2)+'\n');
  console.log(JSON.stringify({report:resolve('artifacts/performance/bundle-budget-report.json'),checks:checks.map(({name,gzipBytes,maxGzipBytes,status})=>({name,gzipBytes,maxGzipBytes,status}))},null,2));
  assert(checks.every(c=>c.status==='PASS'),'Measured bundle exceeds its reviewed baseline; investigate and review an explicit budget change');
}
