import { doctor, loadProject, exportVideo } from '@aether-fx/node';
import { serializePlan } from '@aether-fx/core';
import { writeFile } from 'node:fs/promises';
export async function main(args:string[]):Promise<number>{
  try{
    const [command,path,...rest]=args;
    if(command==='doctor'){const result=await doctor();console.log(JSON.stringify(result,null,2));return result.ok?0:1;}
    if((command==='check'||command==='compile'||command==='render')&&path){
      const loaded=await loadProject(path);if(!loaded.ok){console.error(JSON.stringify(loaded.diagnostics,null,2));return 1;}
      if(command==='compile'){if(rest.length!==2||rest[0]!=='--out')throw new Error('Usage: afx compile file.afx --out plan.json');await writeFile(rest[1]!,serializePlan(loaded.value.plan),{flag:'wx'});}
      else if(command==='render'){
        const allowed=new Set(['--out','--width','--height','--format','--timeout']);const values=new Map<string,string>();
        for(let i=0;i<rest.length;i+=2){const flag=rest[i]!,value=rest[i+1];if(!allowed.has(flag)||value===undefined||values.has(flag))throw new Error('Invalid render option');values.set(flag,value);}
        if(!values.has('--out'))throw new Error('Usage: afx render file.afx --out video.webm [--width N --height N --format webm|mp4 --timeout MS]');
        const format=values.get('--format')??'webm';if(format!=='webm'&&format!=='mp4')throw new Error('Unsupported format');
        const controller=new AbortController(),cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
        try{const result=await exportVideo(loaded.value,{output:values.get('--out')!,format,signal:controller.signal,...(values.has('--width')?{width:Number(values.get('--width'))}:{}),...(values.has('--height')?{height:Number(values.get('--height'))}:{}),...(values.has('--timeout')?{timeoutMs:Number(values.get('--timeout'))}:{})});console.log(JSON.stringify(result,null,2));return 0;}finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
      }else if(rest.length)throw new Error('Usage: afx check file.afx');
      console.log(JSON.stringify({ok:true,duration:loaded.value.plan.duration,assets:loaded.value.assets.manifest.length}));return 0;
    }
    console.error('Usage: afx doctor | check file.afx | compile file.afx --out plan.json | render file.afx --out video.webm');return 2;
  }catch(cause){console.error(JSON.stringify({code:cause&&typeof cause==='object'&&'code' in cause?cause.code:'CLI_FAILED',message:cause instanceof Error?cause.message:String(cause)}));return 1;}
}
