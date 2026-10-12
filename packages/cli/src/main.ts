import { doctor, loadProject, exportVideo } from '@aether-fx/node';
import { serializePlan } from '@aether-fx/core';
import { readFile, writeFile, open, copyFile, realpath } from 'node:fs/promises';
import { parse, print, expand, normalize, authorDiagnostics, safeEdits, applySafeEdits } from '@aether-fx/compiler';
import { hashProject } from './hash.js';
import { lsp } from './lsp.js';
import { sceneSource } from './scene.js';
import { dirname, join } from 'node:path';
import { runBenchChild } from './bench-child.js';
import { bench } from './bench.js';
export async function main(args:string[]):Promise<number>{
  try{
    const [command,path,...rest]=args;
    if(command==='_bench-child'&&path)return await runBenchChild(path,JSON.parse(rest[0]!));
    if(command==='lsp')return Number(await lsp());
    if(command==='scene'&&path){if(rest.length!==2||!['-o','--out'].includes(rest[0]!))throw new Error('Usage: afx scene brief.json -o out.afx');const result=sceneSource(JSON.parse(await readFile(path,'utf8'))),out=rest[1]!,font=join(dirname(out),'afx-Nunito.ttf'),bytes=await readFile(new URL('./assets/Nunito.ttf',import.meta.url));try{await writeFile(font,bytes,{flag:'wx'});}catch(cause){if((cause as NodeJS.ErrnoException).code!=='EEXIST'||!bytes.equals(await readFile(font)))throw cause;}await writeFile(out,result.source,{flag:'wx'});const loaded=await loadProject(out);if(!loaded.ok)throw new Error(JSON.stringify(loaded.diagnostics));console.log(JSON.stringify({ok:true,source:out,duration:loaded.value.plan.duration}));return 0;}
    if(command==='bench')return await bench(args.slice(1));
    if(command==='probe'){const result=await doctor();if(!result.ok){console.log(JSON.stringify(result));return 1;}const {encoders}=result.value,mp4=path==='mp4';const supported=mp4?encoders.h264&&encoders.aac:encoders.vp9&&encoders.opus;console.log(JSON.stringify({backend:'native',format:mp4?'mp4':'webm',supported,...result.value}));return supported?0:1;}
    if(['fmt','expand','fix','hash'].includes(command??'')&&path){
      const source=await readFile(path,'utf8');
      if(command==='fix'){
        if(rest.join(' ')!=='--safe')throw new Error('Usage: afx fix file.afx --safe');
        const edits=safeEdits(source),file=await open(path,'r+');
        try{const current=await file.readFile('utf8'),applied=applySafeEdits(current,source,edits);if(!applied.ok){console.log(JSON.stringify(applied));return 1;}if(edits.length){await file.write(applied.value,0,'utf8');await file.truncate(Buffer.byteLength(applied.value));}}finally{await file.close();}
        const checked=await loadProject(path);console.log(JSON.stringify({ok:checked.ok,applied:edits.length,...(!checked.ok?{diagnostics:authorDiagnostics(await readFile(path,'utf8'),checked.diagnostics,await realpath(path))}:{})}));return checked.ok?0:1;
      }
      if(command==='hash')return await hashProject(path,rest);
      const ast=parse(source);if(!ast.ok){console.error(JSON.stringify(ast));return 1;}
      // Modular expand uses the authorized Node host; retain asset-free legacy expansion.
      if(command==='expand'&&ast.value.project.children.some(d=>d.keyword==='import')){const loaded=await loadProject(path);if(!loaded.ok){console.error(JSON.stringify(loaded));return 1;}console.log(JSON.stringify(loaded.value.plan.document,null,2));return 0;}
      const result=command==='expand'?expand(ast.value):ast;
      if(!result.ok){console.error(JSON.stringify(result));return 1;}
      if(command==='expand'){const doc=normalize(result.value);if(!doc.ok){console.error(JSON.stringify(doc));return 1;}console.log(JSON.stringify(doc.value,null,2));return 0;}
      const formatted=print(result.value);if(rest.length===1&&rest[0]==='--write'){if(await readFile(path,'utf8')!==source)throw new Error('SOURCE_CHANGED');await writeFile(path,formatted);}else if(!rest.length)process.stdout.write(formatted);else throw new Error('Usage: afx fmt file.afx [--write]');return 0;
    }
    if(command==='doctor'){const result=await doctor();console.log(JSON.stringify(result,null,2));return result.ok?0:1;}
    if((command==='check'||command==='compile'||command==='render')&&path){
      const loaded=await loadProject(path);if(!loaded.ok){const diagnostics=authorDiagnostics(await readFile(path,'utf8'),loaded.diagnostics,await realpath(path));if(command==='check'&&rest.includes('--json'))console.log(JSON.stringify({ok:false,diagnostics}));else console.error(JSON.stringify(diagnostics,null,2));return 1;}
      if(command==='compile'){if(rest.length!==2||rest[0]!=='--out')throw new Error('Usage: afx compile file.afx --out plan.json');await writeFile(rest[1]!,serializePlan(loaded.value.plan),{flag:'wx'});}
      else if(command==='render'){
        const allowed=new Set(['--out','--width','--height','--format','--timeout','--backend']);const values=new Map<string,string>();
        for(let i=0;i<rest.length;i+=2){const flag=rest[i]!,value=rest[i+1];if(!allowed.has(flag)||value===undefined||values.has(flag))throw new Error('Invalid render option');values.set(flag,value);}
        if(!values.has('--out'))throw new Error('Usage: afx render file.afx --out video.webm [--width N --height N --format webm|mp4 --timeout MS]');
        const backend=values.get('--backend')??'native';if(backend!=='native'&&backend!=='chromium')throw new Error('Unsupported backend');
        const format=values.get('--format')??'webm';if(format!=='webm'&&format!=='mp4')throw new Error('Unsupported format');
        const controller=new AbortController(),cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
        try{const result=await exportVideo(loaded.value,{output:values.get('--out')!,format,backend,signal:controller.signal,...(values.has('--width')?{width:Number(values.get('--width'))}:{}),...(values.has('--height')?{height:Number(values.get('--height'))}:{}),...(values.has('--timeout')?{timeoutMs:Number(values.get('--timeout'))}:{})});console.log(JSON.stringify(result,null,2));return 0;}finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
      }else if(rest.length&&rest.join(' ')!=='--json')throw new Error('Usage: afx check file.afx [--json]');
      console.log(JSON.stringify({ok:true,diagnostics:[],duration:loaded.value.plan.duration,assets:loaded.value.assets.manifest.length}));return 0;
    }
    console.error('Usage: afx doctor | check file.afx | compile file.afx --out plan.json | render file.afx --out video.webm');return 2;
  }catch(cause){console.error(JSON.stringify({code:cause&&typeof cause==='object'&&'code' in cause?cause.code:'CLI_FAILED',message:cause instanceof Error?cause.message:String(cause)}));return 1;}
}
