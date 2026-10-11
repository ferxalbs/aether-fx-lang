import type { Asset, PlaybackPlan } from '@aether-fx/core';
import type { CanvasResources } from './renderer.js';
export type AssetResolver=(asset:Asset,signal?:AbortSignal)=>Promise<ArrayBuffer>;
export interface LoadedResources extends CanvasResources { audio:Map<string,AudioBuffer>; dispose():void }
export async function loadResources(plan:PlaybackPlan,resolver:AssetResolver,signal?:AbortSignal):Promise<LoadedResources> {
  const images=new Map<string,ImageBitmap>(),fonts=new Map<string,string>(),audio=new Map<string,AudioBuffer>();
  const faces:FontFace[]=[];
  let disposed=false;
  const result:LoadedResources={images,fonts,audio,dispose(){if(disposed)return;disposed=true;for(const image of images.values())image.close();for(const font of faces)document.fonts.delete(font);images.clear();fonts.clear();audio.clear();}};
  try {
    for(const asset of plan.document.assets){
      signal?.throwIfAborted();
      const bytes=await resolver(asset,signal);signal?.throwIfAborted();
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      const entry=plan.manifest.find(a=>a.id===asset.id)!;
      if(hash!==entry.hash)throw new Error(`Asset integrity mismatch: ${asset.id}`);
      if(asset.kind==='image'){
        const bitmap=await createImageBitmap(new Blob([bytes]));images.set(asset.id,bitmap);
        if(bitmap.width!==entry.width||bitmap.height!==entry.height)throw new Error(`Image dimensions mismatch: ${asset.id}`);
      }else if(asset.kind==='font'){
        const name=`afx_${asset.id}_${hash.slice(0,16)}`;
        const face=new FontFace(name,bytes);await face.load();faces.push(face);document.fonts.add(face);fonts.set(asset.id,name);
      }else{
        const decoder=new OfflineAudioContext(entry.channels!,1,entry.sampleRate!);
        const buffer=await decoder.decodeAudioData(bytes.slice(0));audio.set(asset.id,buffer);
        if(buffer.sampleRate!==entry.sampleRate||buffer.numberOfChannels!==entry.channels||Math.abs(buffer.duration-entry.duration!)>1/entry.sampleRate!)throw new Error(`Audio metadata mismatch: ${asset.id}`);
      }
      signal?.throwIfAborted();
    }
    return result;
  }catch(cause){result.dispose();throw cause;}
}
