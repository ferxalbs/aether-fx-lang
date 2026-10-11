import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import type { FontKey } from '@napi-rs/canvas';
import { createRenderer } from '@aether-fx/canvas';
import { evaluate, deserializePlan, serializePlan } from '@aether-fx/core';
import type { PlaybackPlan } from '@aether-fx/core';
import { createHash } from 'node:crypto';
import type { ResolvedAssets } from './assets.js';
import { FxEnvironmentError } from './errors.js';
let activeRenderers=0;
const ownedFonts=new Map<string,{key:FontKey;alias:string}>();
function releaseFontSession(){if(--activeRenderers===0){GlobalFonts.removeBatch([...ownedFonts.values()].map(f=>f.key));ownedFonts.clear();}}
export async function createNativeRenderer(plan:PlaybackPlan,assets:ResolvedAssets,options:{width?:number;height?:number}={}){
 const verified=deserializePlan(serializePlan(plan));if(!verified.ok)throw new FxEnvironmentError('PLAN_INVALID',JSON.stringify(verified.diagnostics));plan=verified.value;
 const width=options.width??plan.document.viewport[0],height=options.height??plan.document.viewport[1];
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=8192))throw new FxEnvironmentError('RESOLUTION_INVALID','Dimensions must be integers in [1,8192]');
 const canvas=createCanvas(width,height),fonts=new Map<string,string>(),images=new Map<string,CanvasImageSource>();let disposed=false;
 activeRenderers++;
 try{for(const asset of plan.document.assets){const file=assets.files.get(asset.id);if(file&&createHash('sha256').update(file.bytes).digest('hex')!==plan.manifest.find(a=>a.id===asset.id)?.hash)throw new FxEnvironmentError('ASSET_INTEGRITY',asset.id);if(!file)throw new FxEnvironmentError('ASSET_UNRESOLVED',asset.id);if(asset.kind==='font'){const hash=createHash('sha256').update(file.bytes).digest('hex');let registered=ownedFonts.get(hash);if(!registered){const alias='afx_'+hash,key=GlobalFonts.register(file.bytes,alias);if(!key)throw new FxEnvironmentError('FONT_UNSUPPORTED',asset.id);registered={key,alias};ownedFonts.set(hash,registered);}fonts.set(asset.id,registered.alias);}if(asset.kind==='image')images.set(asset.id,await loadImage(file.bytes) as unknown as CanvasImageSource);}
 const renderer=createRenderer(canvas as unknown as HTMLCanvasElement,{fonts,images}),context=canvas.getContext('2d');context.fontVariationSettings='"wght" 400';
 return {width,height,render(frame:number){if(disposed)throw new FxEnvironmentError('RENDERER_DISPOSED','Native renderer disposed');if(!Number.isSafeInteger(frame)||frame<0||frame>=plan.duration)throw new RangeError('Frame outside movie');renderer.render(evaluate(plan,{frame}));},async captureFrame(frame:number){this.render(frame);return canvas.encode('png');},pixels(){if(disposed)throw new Error('Renderer disposed');return context.getImageData(0,0,width,height).data;},dispose(){if(!disposed){disposed=true;renderer.dispose();releaseFontSession();}}};
 }catch(cause){releaseFontSession();throw cause;}
}
