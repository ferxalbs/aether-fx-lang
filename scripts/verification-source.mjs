import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Barrel hashes alone do not identify a modular package's runtime. */
export async function builtRuntimeArtifacts(){
 const files={};
 for(const name of ['core','compiler','canvas','react','export','node','cli']){
  const root=`packages/${name}/dist`;
  for(const file of (await readdir(root,{recursive:true})).filter(f=>/\.(?:js|json)$/.test(f)).sort())files[`${root}/${file}`]=sha256(await readFile(`${root}/${file}`));
 }
 return files;
}
/** Verification inputs only; local session records, generated reports and user notes are excluded. */
export async function verificationSource(){
 const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>/^(packages|scripts|tests|fixtures|examples)\//.test(p)&&!/(^|\/)(dist|node_modules|\.next|public|project)\//.test(p)||['package.json','package-lock.json','bundle-budgets.json','release.config.json','tsconfig.json'].includes(p));
 const files=[];for(const path of [...new Set(paths)].sort()){try{files.push({path,sha256:sha256(await readFile(path))});}catch(error){if(error.code!=='ENOENT')throw error;}}
 return {baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),treeSha256:sha256(JSON.stringify(files)),files,method:'Sorted relative paths and actual SHA256 of verification source/configuration/fixture/package README bytes; excludes generated installs/builds and local internal records'};
}
