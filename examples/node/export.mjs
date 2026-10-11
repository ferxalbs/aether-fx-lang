import { loadProject, exportVideo } from '@aether-fx/node';
const result=await loadProject(process.argv[2]??'fixtures/short/little-light.afx');
if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));
const report=await exportVideo(result.value,{output:process.argv[3]??'little-light.webm',onProgress:({frame,total})=>{if(frame%48===0)console.log(`${frame}/${total} frames`);}});
console.log(JSON.stringify(report,null,2));
