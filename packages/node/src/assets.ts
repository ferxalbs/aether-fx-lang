import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { compile, diagnostic, failure } from '@aether-fx/core';
import type { AssetManifest, FxDocument, PlaybackPlan, Result } from '@aether-fx/core';
import { normalize, parse, compileSource } from '@aether-fx/compiler';
import type { SourceOptions } from '@aether-fx/compiler';
import { FxEnvironmentError } from './errors.js';
export interface ResolvedAssets { manifest:AssetManifest; files:Map<string,{path:string;bytes:Buffer}> }
export interface LoadedProject { plan:PlaybackPlan; assets:ResolvedAssets; sources?:Map<string,string> }
export function wavMetadata(bytes:Buffer):{duration:number;sampleRate:number;channels:number;bits:number;dataOffset:number;dataLength:number} {
  if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt32LE(4)+8!==bytes.length)throw new FxEnvironmentError('ASSET_FORMAT','Expected a complete RIFF WAV file');
  let channels=0,sampleRate=0,bits=0,alignment=0,dataOffset=0,dataLength=0;
  for(let offset=12;offset+8<=bytes.length;){
    const type=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),start=offset+8;
    if(start+length>bytes.length)throw new FxEnvironmentError('ASSET_FORMAT','Truncated WAV chunk');
    if(type==='fmt '){if(length<16||bytes.readUInt16LE(start)!==1)throw new FxEnvironmentError('ASSET_FORMAT','Reference audio must be integer PCM WAV');channels=bytes.readUInt16LE(start+2);sampleRate=bytes.readUInt32LE(start+4);alignment=bytes.readUInt16LE(start+12);bits=bytes.readUInt16LE(start+14);}
    if(type==='data'){if(dataOffset)throw new FxEnvironmentError('ASSET_FORMAT','Multiple WAV data chunks are unsupported');dataOffset=start;dataLength=length;}
    offset=start+length+(length%2);
  }
  if(channels<1||channels>8||sampleRate<8000||sampleRate>192000||![8,16,24,32].includes(bits)||alignment!==channels*bits/8||!dataOffset||!dataLength||dataLength%alignment)throw new FxEnvironmentError('ASSET_FORMAT','Invalid PCM WAV metadata');
  return {duration:dataLength/alignment/sampleRate,sampleRate,channels,bits,dataOffset,dataLength};
}
export function imageMetadata(bytes:Buffer):{width:number;height:number} {
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    const type=bytes.toString('ascii',12,16);
    if(type==='VP8X')return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
    if(type==='VP8 '&&bytes.subarray(23,26).equals(Buffer.from([157,1,42])))return {width:bytes.readUInt16LE(26)&16383,height:bytes.readUInt16LE(28)&16383};
    if(type==='VP8L'&&bytes[20]===47){const packed=bytes.readUInt32LE(21);return {width:1+(packed&16383),height:1+((packed>>>14)&16383)};}
  }
  throw new FxEnvironmentError('ASSET_FORMAT','Image must be PNG or WebP');
}
export async function resolveAssets(document:FxDocument,options:{root:string;signal?:AbortSignal;maxAssetBytes?:number;maxTotalAssetBytes?:number}):Promise<ResolvedAssets> {
  const root=await realpath(options.root),files:ResolvedAssets['files']=new Map(),manifest:AssetManifest=[];
  let totalBytes=0;
  for(const asset of document.assets){
    options.signal?.throwIfAborted();
    if(isAbsolute(asset.src)||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(asset.src)||asset.src.includes('\0'))throw new FxEnvironmentError('ASSET_PATH',`Only local relative asset paths are allowed: ${asset.id}`);
    let path:string,bytes:Buffer;
    try{path=await realpath(resolve(root,asset.src));if(!path.startsWith(root+sep))throw new FxEnvironmentError('ASSET_PATH',`Asset escapes authorized root: ${asset.id}`);const info=await stat(path);if(!info.isFile()||info.size>(options.maxAssetBytes??32_000_000))throw new FxEnvironmentError('ASSET_LIMIT',`Asset is not a file or exceeds byte limit: ${asset.id}`);bytes=await readFile(path,{signal:options.signal});}
    catch(cause){if(cause instanceof FxEnvironmentError)throw cause;throw new FxEnvironmentError('ASSET_READ',`Cannot read asset ${asset.id}`,{cause});}
    totalBytes+=bytes.length;if(totalBytes>(options.maxTotalAssetBytes??128_000_000))throw new FxEnvironmentError('ASSET_LIMIT','Resolved asset bytes exceed total limit');
    let metadata:{}={};
    if(asset.kind==='image'){const dimensions=imageMetadata(bytes);if(dimensions.width<1||dimensions.height<1||dimensions.width>8192||dimensions.height>8192)throw new FxEnvironmentError('ASSET_LIMIT',`Image resolution exceeds limit: ${asset.id}`);metadata=dimensions;}
    else if(asset.kind==='audio'){const {duration,sampleRate,channels}=wavMetadata(bytes);metadata={duration,sampleRate,channels};}
    else if(![Buffer.from([0,1,0,0]),Buffer.from('OTTO'),Buffer.from('wOFF'),Buffer.from('wOF2')].some(signature=>bytes.subarray(0,4).equals(signature)))throw new FxEnvironmentError('ASSET_FORMAT',`Font must be TTF, OTF, WOFF or WOFF2: ${asset.id}`);
    manifest.push({id:asset.id,version:asset.version,kind:asset.kind,hash:createHash('sha256').update(bytes).digest('hex'),...metadata});files.set(asset.id,{path,bytes});
  }
  return {manifest,files};
}
export async function loadProject(path:string,options:{signal?:AbortSignal}={}):Promise<Result<LoadedProject>> {
  let absolute=resolve(path),source:string;
  try{absolute=await realpath(absolute);const info=await stat(absolute);if(info.size>2_000_000)throw new FxEnvironmentError('SOURCE_LIMIT','Source exceeds 2 MB limit');source=await readFile(absolute,{encoding:'utf8',signal:options.signal});}
  catch(cause){if(cause instanceof FxEnvironmentError)throw cause;throw new FxEnvironmentError('SOURCE_READ',`Cannot read ${absolute}`,{cause});}
  const ast=parse(source);if(!ast.ok)return failure(ast.diagnostics);
  const sources=new Map<string,string>([[absolute,source]]),aliases=new Map<string,string>(),root=await realpath(dirname(absolute));
  let totalBytes=Buffer.byteLength(source),moduleRange:import('@aether-fx/core').SourceRange|undefined;
  const loadModules=async(text:string,importer:string,depth:number):Promise<void>=>{
    if(depth>32)throw new FxEnvironmentError('SOURCE_LIMIT','Module depth exceeds 32');
    const parsed=parse(text,{sourceId:importer});if(!parsed.ok)return;
    for(const d of parsed.value.project.children.filter(d=>d.keyword==='import')){
      moduleRange=d.range;
      const src=d.fields.find(f=>f.name==='src')?.value;
      if(src?.kind!=='scalar'||typeof src.value!=='string'||isAbsolute(src.value)||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(src.value)||src.value.includes('\0'))continue;
      const requested=resolve(dirname(importer),src.value),modulePath=await realpath(requested);
      aliases.set(requested,modulePath);
      if(!modulePath.startsWith(root+sep))throw new FxEnvironmentError('SOURCE_PATH','Module escapes authorized project root');
      if(sources.has(modulePath))continue;
      const info=await stat(modulePath);
      if(!info.isFile()||info.size>2_000_000||sources.size>=65)throw new FxEnvironmentError('SOURCE_LIMIT','Module source limit exceeded');
      const text=await readFile(modulePath,{encoding:'utf8',signal:options.signal});
      totalBytes+=Buffer.byteLength(text);if(totalBytes>2_000_000)throw new FxEnvironmentError('SOURCE_LIMIT','Combined source exceeds 2 MB');
      sources.set(modulePath,text);await loadModules(text,modulePath,depth+1);
    }
  };
  try{await loadModules(source,absolute,0);}
  catch(cause){return failure([diagnostic(cause instanceof FxEnvironmentError?cause.code:'SOURCE_READ',String(cause),{...(moduleRange?{range:moduleRange}:{})})]);}
  const sourceOptions:SourceOptions={sourceId:absolute,resolveModule:(specifier,importer)=>{
    const requested=resolve(dirname(importer),specifier),id=aliases.get(requested)??requested,text=sources.get(id);
    if(text===undefined)throw new FxEnvironmentError('SOURCE_READ','Module is unavailable');
    return {id,source:text};
  }};
  const locatedAst=parse(source,{sourceId:absolute});if(!locatedAst.ok)return failure(locatedAst.diagnostics);
  const document=normalize(locatedAst.value,sourceOptions);if(!document.ok)return failure(document.diagnostics);
  const assets=await resolveAssets(document.value,{root:dirname(absolute),...(options.signal?{signal:options.signal}:{})});
  const compiled=compile(document.value,assets.manifest);if(!compiled.ok){const located=compileSource(source,assets.manifest,sourceOptions);return failure(located.ok?compiled.diagnostics:located.diagnostics);}
  return {ok:true,value:{plan:compiled.value,assets,sources}};
}
