import {verificationSource} from './verification-source.mjs';
const verification=await verificationSource();
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readReleaseConfig } from './release-config.mjs';

const root = process.cwd(), original = await readReleaseConfig();
const output = resolve('artifacts/release-config'); await mkdir(output, { recursive: true });
let report={source:verification,status:'RUNNING',complete:false,node:process.version,original,checks:{}};
function validateTests(result, json, expectedFiles) {
  assert(!result.error && result.status === 0 && !result.signal, 'Vitest execution failed');
  assert.equal(json.success,true,'Vitest suite failed');
  for(const key of ['numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests','numTotalTestSuites','numPassedTestSuites','numFailedTestSuites','numPendingTestSuites'])assert(Number.isSafeInteger(json[key])&&json[key]>=0,'Incomplete Vitest report: '+key);
  assert(json.numTotalTests>0&&json.numTotalTestSuites>0,'Empty Vitest report');
  assert.equal(json.numPassedTests,json.numTotalTests);assert.equal(json.numPassedTestSuites,json.numTotalTestSuites);
  for(const key of ['numFailedTests','numPendingTests','numTodoTests','numFailedTestSuites','numPendingTestSuites'])assert.equal(json[key],0,key);
  assert(Array.isArray(json.testResults),'Missing Vitest files');
  assert.deepEqual(json.testResults.map(f=>relative(directory,f.name)).sort(),expectedFiles.sort(),'Incomplete Vitest file inventory');
  const assertions=json.testResults.flatMap(f=>{assert.equal(f.status,'passed');assert.equal(f.message,'');assert(Array.isArray(f.assertionResults));return f.assertionResults;});
  assert.equal(assertions.length,json.numTotalTests,'Incomplete Vitest assertions');
  for(const test of assertions){assert.equal(test.status,'passed');assert.deepEqual(test.failureMessages,[]);}
}
const directory = await realpath(await mkdtemp(join(tmpdir(), 'afx release scope ')));
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
  for(const task of ['release:check','build','typecheck'])run(['npm','run',task]);
  const vitestPath=join(output,'vitest.json');
  await rm(vitestPath,{force:true});
  const checks=run(['npm','test','--','--reporter=json','--outputFile='+vitestPath]);
  const tests=JSON.parse(await readFile(vitestPath,'utf8'));
  const expectedFiles=['tests/core.test.ts','tests/node.test.ts'];
  validateTests(checks,tests,expectedFiles);
  // Exercise the pinned reporter with actual failing tests and an import-time execution error.
  for(const [name,source]of [['failed',"import {it,expect} from 'vitest';it('failure',()=>expect(1).toBe(2));"],['execution-error',"throw new Error('Intentional verification execution error');"]]){
    const file=join(directory,'tests',name+'.test.ts'),jsonPath=join(output,name+'-vitest.json');await writeFile(file,source);await rm(jsonPath,{force:true});
    const result=run(['npm','exec','--no','--','vitest','run',file,'--reporter=json','--outputFile='+jsonPath],directory,false);
    const failed=JSON.parse(await readFile(jsonPath,'utf8'));assert.throws(()=>validateTests(result,failed,['tests/'+name+'.test.ts']));await rm(file);
  }
  for(const result of [{...checks,status:1},{...checks,error:new Error('spawn error')},{...checks,status:null,signal:'SIGTERM'}])assert.throws(()=>validateTests(result,tests,expectedFiles));
  for(const incomplete of [{...tests,testResults:[]},{...tests,numTotalTests:undefined},{...tests,testResults:tests.testResults.slice(1)},{...tests,numPassedTests:tests.numPassedTests-1}])assert.throws(()=>validateTests(checks,incomplete,expectedFiles));
  report.checks.structuredVitestAndFailureRejection='PASS';
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
  report = { source:verification,status:'PASS',complete:true,node: process.version, original, alternate, changedFiles: synchronized.changedFiles, checks: { invalidScopeAndVersionRejected: 'PASS', driftRejected: 'PASS', coherentScopeAndJointVersion: 'PASS', idempotentSync: 'PASS', cleanNpmCiBuildTypesAndTests: 'PASS', structuredVitestAndFailureRejection:'PASS', sevenAlternateScopeTarballsAndCliExport: 'PASS', rebuiltNextExampleAndTypes: 'PASS', roundtripToOriginalConfiguration: 'PASS' }, limits: ['Isolated unpublished test scope; no registry ownership assertion or npm publication', 'Next example declarations/install checked here; production browser lifecycle remains a separate gate'] };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'alternate-node-report.json'), JSON.stringify(nodeReport, null, 2) + '\n');
  console.log(JSON.stringify({ report: join(output, 'report.json'), checks: report.checks }, null, 2));
} catch(error){report={...report,status:'FAIL',complete:false,error:{name:error.name,message:error.message,stack:error.stack}};throw error;} finally { await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await rm(directory, { recursive: true, force: true }); }
