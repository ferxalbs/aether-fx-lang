import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,basename,relative} from 'node:path';
import {homedir} from 'node:os';
import {loadReleaseArchives} from './release-archives.mjs';
import {readReleaseConfig} from './release-config.mjs';
import {verificationSource,sha256,builtRuntimeArtifacts} from './verification-source.mjs';
const outputIndex=process.argv.indexOf('--out');
assert(process.argv.length===2||(process.argv.length===4&&outputIndex===2&&process.argv[3]),'Usage: node scripts/prepare-candidate.mjs [--out fresh-directory]');
const diagnosticPath='artifacts/assembly/diagnostic.json';
const diagnostic={status:'RUNNING',complete:false,candidateCreated:false,blockers:[],reports:[],node:process.version,platform:process.platform};
try{
const release=await readReleaseConfig(),out=outputIndex<0?`artifacts/release-v${release.version}`:process.argv[outputIndex+1];diagnostic.requestedOutput=out;
const loaded=new Map();
for(const path of ['artifacts/ci/acceptance-report.json','artifacts/ci-node/report.json','artifacts/ci-next/react-next-report.json','artifacts/ci-web/report.json','.work/aether-fx/quickstart/report.json']){
 try{const bytes=await readFile(path),report=JSON.parse(bytes);loaded.set(path,report);diagnostic.reports.push({path,sha256:sha256(bytes),status:report.status??(report.complete===false?'FAIL':'LEGACY')});if(report.status==='FAIL'||report.complete===false)diagnostic.blockers.push({code:path==='artifacts/ci/acceptance-report.json'?'ACCEPTANCE_FAILED':'REPORT_FAILED',path,failedGates:report.results?.filter(r=>r.status==='FAIL')});}
 catch(error){diagnostic.blockers.push({code:error.code==='ENOENT'?'REPORT_MISSING':'REPORT_INVALID',path,error:String(error)});}
}
const acceptance=loaded.get('artifacts/ci/acceptance-report.json');
if(acceptance&&(acceptance.complete!==true||acceptance.ranAll!==true||!Array.isArray(acceptance.results)||!acceptance.results.length||acceptance.results.some(r=>r.status!=='PASS'))&&!diagnostic.blockers.some(b=>b.code==='ACCEPTANCE_FAILED'))diagnostic.blockers.push({code:'ACCEPTANCE_FAILED',path:'artifacts/ci/acceptance-report.json',failedGates:acceptance.results?.filter(r=>r.status!=='PASS')});
assert.equal(diagnostic.blockers.length,0,'Assembly blocked; see '+diagnosticPath);
const archives=await loadReleaseArchives('artifacts/metadata-packages'),source=await verificationSource();
assert.equal(source.treeSha256,acceptance.source.treeSha256,'Verification source changed after acceptance');
for(const path of ['artifacts/ci-node/report.json','artifacts/ci-next/react-next-report.json','artifacts/ci-web/report.json','.work/aether-fx/quickstart/report.json']){
 const r=JSON.parse(await readFile(path));assert.equal(r.tarballs.length,7);for(const a of archives)assert.equal(r.tarballs.find(t=>t.name===a.name)?.sha256,a.sha256,'Consumer archive mismatch: '+path);
}
const evidence=[['artifacts/ci/acceptance-report.json','acceptance.json'],['artifacts/metadata-packages/report.json','packages.json'],['artifacts/ci-node/report.json','node-consumer.json'],['artifacts/ci-next/react-next-report.json','next-consumer.json'],['artifacts/ci-web/report.json','browser-consumer.json'],['artifacts/ci-web/video-report.json','browser-decode.json'],['artifacts/short/head-torso-report.json','head-torso.json'],['artifacts/short/node-lifecycle-report.json','export-lifecycle.json'],['artifacts/performance/bundle-budget-report.json','bundles.json'],['artifacts/performance/preview-report.json','preview.json'],['artifacts/performance/export-memory-report.json','chromium-memory.json'],['artifacts/performance/web-memory-report.json','browser-memory.json'],['artifacts/release-config/report.json','configuration.json'],['artifacts/ci-node-decode.json','node-mp4-decode.json'],['artifacts/ci-browser-mp4/report.json','browser-mp4.json'],['artifacts/ci-browser-mp4/decode.json','browser-mp4-decode.json'],['.work/aether-fx/authoring/report.json','authoring.json'],['.work/aether-fx/scenes-acceptance/report.json','scenes.json'],['.work/aether-fx/scenes-acceptance/quality-report.json','scene-quality.json'],['.work/aether-fx/fuzz-acceptance/report.json','fuzz.json'],['.work/aether-fx/quickstart/report.json','quickstart.json'],['.github/workflow-audit.json','workflow-syntax.json'],['.work/aether-fx/native-parity.json','native-parity.json'],['.work/aether-fx/native-lifecycle.json','native-lifecycle.json'],['artifacts/native-benchmark/runs.json','native-benchmark.json'],...Array.from({length:3},(_,i)=>['artifacts/native-benchmark/run-'+(i+1)+'.json','native-run-'+(i+1)+'.json']),...Array.from({length:3},(_,i)=>['artifacts/native-benchmark/decode-'+(i+1)+'.json','native-decode-'+(i+1)+'.json']),['artifacts/native-benchmark/profile-final.json','native-profile.json']];
const forbidden=/\/Users\/|\/home\/|npm whoami|authenticated as|npm org ls|ferxalb(?!s)|USD\s*5|saas-cost-model|OWNER-ACTIONS|FINAL-REPORT|owner.confirm|authorized by the owner|this task performed/i;
const scrub=value=>Array.isArray(value)?value.map(scrub):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[scrub(k),scrub(v)])):typeof value==='string'?value.replaceAll(process.cwd(),'.').replaceAll(homedir(),'<home>').replace(/\/(?:private\/)?(?:var\/folders|tmp)\/[^\s"\n]+/g,'<temporary-path>'):value;
const reports=[];for(const [path,name] of evidence){let bytes;try{bytes=await readFile(path);}catch(error){if(error.code==='ENOENT'&&['native-parity.json'].includes(name))continue;throw error;}const data=scrub(JSON.parse(bytes));assert(!forbidden.test(JSON.stringify(data)),'Internal evidence content: '+path);reports.push({name,bytes:Buffer.from(JSON.stringify({verification:{originalReportSha256:sha256(bytes),candidateSourceTreeSha256:acceptance.source.treeSha256,qualification:'Current full acceptance attempt; individual reports retain their own source/build/tool hashes. Baseline and profiling are separately scoped measurements, not generation evaluation',normalization:'Absolute checkout and temporary paths normalized for public distribution; original hash retained'},...data},null,2)+'\n')});}
await mkdir(out); // Immutable destination: never overwrite a prior candidate.
const files=[];
async function write(destination,bytes){await mkdir(join(out,destination,'..'),{recursive:true});await writeFile(join(out,destination),bytes);files.push({file:destination,bytes:bytes.length,sha256:sha256(bytes)});}
async function copy(path,destination){const s=await lstat(path);if(s.isDirectory()){for(const name of (await readdir(path)).sort())await copy(join(path,name),join(destination,name));}else if(s.isFile()){const bytes=await readFile(path);if(/\.(?:md|json)$/.test(path))assert(!forbidden.test(bytes.toString()),'Internal public document: '+path);await write(destination,bytes);}}
for(const path of ['README.md','LICENSE','NOTICE','CHANGELOG.md','RELEASE-READINESS.md','KNOW-ISSUES.md','docs','fixtures/short','artifacts/playground'])await copy(path,path==='fixtures/short'?'reference-short':path==='artifacts/playground'?'playground':path);
for(const a of archives)await copy(a.path,basename(a.path));
for(const r of reports)await write('evidence/'+r.name,r.bytes);
for(const [path,name] of [['artifacts/short/contact-sheet.png','reference-poses.png'],['artifacts/ci-node.mp4','node.mp4'],['artifacts/ci-browser-mp4/chromium.mp4','browser.mp4'],...Array.from({length:3},(_,i)=>['artifacts/native-benchmark/run-'+(i+1)+'.json.webm','native-run-'+(i+1)+'.webm'])])await copy(path,'evidence/'+name);
// Only current authored sources and images, not session notes or provider recordings.
for(const [directory,name] of [['.work/aether-fx/authoring','authoring'],['.work/aether-fx/scenes-acceptance','scenes']])for(const file of (await readdir(directory)).filter(f=>/\.(?:png|afx|ttf)$/.test(f)).sort())await copy(join(directory,file),'examples/'+name+'/'+file);
await copy('fixtures/short/assets/Nunito-OFL.txt','examples/scenes/Nunito-OFL.txt');
const builtArtifacts=Object.fromEntries(await Promise.all(['@aether-fx/core','@aether-fx/compiler','@aether-fx/canvas','@aether-fx/react','@aether-fx/export','@aether-fx/export/mp4','@aether-fx/export/aac','@aether-fx/node','@aether-fx/node/integrated','@aether-fx/cli'].map(async name=>[name,sha256(await readFile(new URL(import.meta.resolve(name))))])));
assert.deepEqual(builtArtifacts,acceptance.builtArtifacts,'Built code changed after acceptance');
const runtimeArtifacts=await builtRuntimeArtifacts();assert.deepEqual(runtimeArtifacts,acceptance.runtimeArtifacts,'Runtime modules changed after acceptance');
const unchangedArtifacts={};
const measurement=reports.find(r=>r.name==='native-benchmark.json');
const measured=measurement?JSON.parse(measurement.bytes):null;
if(measured)for(const run of measured.runs){for(const [name,hash] of Object.entries(run.sourceArtifacts))assert.equal(builtArtifacts[name],hash,'Native measurement artifact mismatch');for(const [path,hash] of Object.entries(run.runtimeArtifacts))assert.equal(runtimeArtifacts[path],hash,'Native measurement module mismatch');}
const performanceTarget=measured?{status:measured.runs.some(r=>r.platform==='linux')?'NOT_QUALIFIED_REFERENCE_HOST':measured.runs.every(r=>r.export.exportFactor<=0.5&&r.peakTreeRssBytes<=700*1048576)?'PASS':'FAIL',runs:measured.runs.map(r=>({exportFactor:r.export.exportFactor,treeRssMiB:r.peakTreeRssBytes/1048576})),targets:{exportFactor:0.5,treeRssMiB:700},report:'evidence/native-benchmark.json'}:{status:'NOT_MEASURED'};
const manifest={schemaVersion:1,...release,snapshotKind:outputIndex<0?'release-candidate':'unapproved-validation',isReleaseCandidate:outputIndex<0,createdAt:new Date().toISOString(),source,builtArtifacts,runtimeArtifacts,tools:{node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),platform:process.platform,arch:process.arch},archives:archives.map(a=>({name:a.name,filename:basename(a.path),bytes:a.bytes,sha256:a.sha256})),acceptance:{scope:acceptance.scope,unchangedArtifacts,ranAll:acceptance.ranAll,complete:acceptance.complete,results:acceptance.results},performanceTarget,technicalApproved:false,publicationReady:false,hostedCi:'Not qualified by local acceptance',files:[...files],limitations:['See evidence/bundles.json for unchanged bundle caps and measured failures','Native external performance gate evaluates all three runs at unchanged factor 0.5 / aggregate RSS 700 MiB targets','Linux runner timing is observational and does not qualify the measured macOS reference performance target', 'Default Node video uses Skia and external FFmpeg; integrated NodeAV binary distribution unqualified','Physical devices and hosted Linux have separate qualification','Authored examples, tests and recorded replay are not live model-generation metrics']};
await write('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
await writeFile(join(out,'SHA256SUMS'),files.sort((a,b)=>a.file.localeCompare(b.file)).map(f=>`${f.sha256}  ${f.file}`).join('\n')+'\n');
console.log(JSON.stringify({out,archives:7,files:files.length,technicalApproved:false},null,2));

diagnostic.status='PASS';diagnostic.complete=true;diagnostic.candidateCreated=true;
}catch(error){diagnostic.status='FAIL';diagnostic.error={name:error.name,message:error.message,stack:error.stack};throw error;}
finally{await mkdir('artifacts/assembly',{recursive:true});await writeFile(diagnosticPath,JSON.stringify(diagnostic,null,2)+'\n');}
