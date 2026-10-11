import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('artifacts/playground',{recursive:true});await build({entryPoints:['examples/playground/app.ts'],outfile:'artifacts/playground/app.js',bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true});for(const f of ['index.html','style.css'])await copyFile('examples/playground/'+f,'artifacts/playground/'+f);console.log('Built artifacts/playground; serve with python3 -m http.server 3010 --directory artifacts/playground');
