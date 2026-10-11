import { parentPort } from 'node:worker_threads';
import { compileSource } from '@aether-fx/compiler';
import { evaluate } from '@aether-fx/core';
parentPort.postMessage({ready:true});
parentPort.on('message',({id,source,spin})=>{if(spin){for(;;){}}try{const result=compileSource(source,[],{sourceBytes:4096,depth:16,parts:64,segments:128,tracks:128,duration:240});if(result.ok)evaluate(result.value,{frame:Math.max(0,result.value.duration-1)});parentPort.postMessage({id,status:result.ok?'accepted':'rejected',codes:result.ok?[]:result.diagnostics.map(d=>d.code)});}catch(error){parentPort.postMessage({id,status:'crash',error:String(error),stack:error.stack});}});
