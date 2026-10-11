import {fileURLToPath} from 'node:url';
import { spawnSync } from 'node:child_process';
import { queryWebExport } from '@aether-fx/export';
import { describe, it, expect, vi } from 'vitest';
import { readFile, mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, resolveAssets, wavMetadata, imageMetadata, doctor } from '@aether-fx/node';
import { compile, evaluate, serializePlan, deserializePlan } from '@aether-fx/core';
import { normalize, parse } from '@aether-fx/compiler';
import type { Result } from '@aether-fx/core';
const unwrap=<T>(result:Result<T>):T=>{if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));return result.value;};

describe('illustrated acceptance semantics',()=>{
  it('has real declared assets, thirteen character parts including a neck bridge, four poses and exact shot lengths',async()=>{
    const {plan,assets}=unwrap(await loadProject('fixtures/short/little-light.afx'));
    expect(plan.duration).toBe(480);expect(plan.document.viewport).toEqual([1280,720]);expect(plan.document.fps).toEqual({numerator:24,denominator:1});
    expect(plan.document.shots.map(s=>s.duration)).toEqual([144,192,144]);expect(plan.document.actors.find(a=>a.id==='hero')!.parts).toHaveLength(13);expect(plan.document.actors.find(a=>a.id==='hero')!.parts).toContain('neck');
    expect(plan.document.poses).toHaveLength(4);expect(plan.document.drawings).toHaveLength(2);expect(plan.document.backgrounds).toHaveLength(3);
    expect(assets.manifest.map(a=>a.kind)).toEqual(['font','image','audio']);expect(assets.manifest.find(a=>a.kind==='audio')).toMatchObject({duration:20,sampleRate:48000,channels:2});
    expect(unwrap(deserializePlan(serializePlan(plan)))).toEqual(plan);
    const expected=Array.from({length:480},(_,frame)=>evaluate(plan,{frame}));
    for(let i=0;i<480;i++){const frame=i*137%480;expect(evaluate(plan,{frame})).toEqual(expected[frame]);}
  });
  it('attaches the lantern without a position jump and preserves contact through the lift',async()=>{
    const {plan}=unwrap(await loadProject('fixtures/short/little-light.afx'));
    const object=(frame:number)=>evaluate(plan,{frame}).commands.find(c=>c.id==='lantern.lanternBody')!;
    expect(object(203).matrix[4]).toBeCloseTo(690-59*20/150);expect(object(204).matrix[4]).toBeCloseTo(690-60*20/150);expect(object(203).matrix[5]).toBe(392);expect(object(204).matrix[5]).toBe(392);
    const lifted=object(274);expect(lifted.matrix[4]).toBeCloseTo(585-130*20/150);expect(lifted.matrix[5]).toBe(315);
    const hand=evaluate(plan,{frame:274}).commands.find(c=>c.id==='hero.hand')!;
    expect(lifted.matrix[4]).toBe(hand.matrix[4]);expect(lifted.matrix[5]).toBe(hand.matrix[5]+20);
    expect(evaluate(plan,{frame:203}).commands.find(c=>c.id==='hero.frontArm')!.layer).toBeGreaterThan(evaluate(plan,{frame:193}).commands.find(c=>c.id==='hero.frontArm')!.layer);
    expect(evaluate(plan,{frame:479})).toEqual({...evaluate(plan,{frame:450}),frame:479});
  });
});
describe('explicit local asset resolver',()=>{
  it('parses the real PCM WAV and PNG metadata and rejects truncated data',async()=>{
    const wav=await readFile('fixtures/short/assets/score.wav'),png=await readFile('fixtures/short/assets/paper.png');
    expect(wavMetadata(wav)).toMatchObject({duration:20,sampleRate:48000,channels:2,bits:16,dataOffset:44,dataLength:3840000});
    expect(imageMetadata(png)).toEqual({width:128,height:128});expect(()=>wavMetadata(wav.subarray(0,100))).toThrow('RIFF WAV');expect(()=>imageMetadata(Buffer.from('not an image'))).toThrow('PNG or WebP');
  });
  it('rejects remote paths, path traversal, symlink escape and byte limits',async()=>{
    const parsed=unwrap(normalize(unwrap(parse(await readFile('fixtures/short/little-light.afx','utf8')))));
    for(const src of ['https://example.com/font.ttf','../outside.ttf']){
      const d=structuredClone(parsed);d.assets[0]!.src=src;
      await expect(resolveAssets(d,{root:'fixtures/short'})).rejects.toMatchObject({code:src.startsWith('http')?'ASSET_PATH':'ASSET_READ'});
    }
    await expect(resolveAssets(parsed,{root:'fixtures/short',maxAssetBytes:1})).rejects.toMatchObject({code:'ASSET_LIMIT'});
    await expect(resolveAssets(parsed,{root:'fixtures/short',maxTotalAssetBytes:1})).rejects.toMatchObject({code:'ASSET_LIMIT'});
    const root=await mkdtemp(join(tmpdir(),'afx paths ')),outside=await mkdtemp(join(tmpdir(),'afx outside '));
    try{await writeFile(join(outside,'font.ttf'),'font');await symlink(join(outside,'font.ttf'),join(root,'escape.ttf'));const d=structuredClone(parsed);d.assets[0]!.src='escape.ttf';await expect(resolveAssets(d,{root})).rejects.toMatchObject({code:'ASSET_PATH'});}finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
  });
  it('diagnoses missing tools without downloading or replacing tools',async()=>{
    const result=await doctor({ffmpegPath:'/nonexistent/afx-ffmpeg',chromiumExecutable:'/nonexistent/afx-chromium'});expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics.every(d=>d.code==='DEPENDENCY_MISSING')).toBe(true);
  });
});

describe('native renderer ownership',()=>{
 it('renders real assets with repeatable pixels and rejects altered asset bytes',async()=>{const {createNativeRenderer}=await import('@aether-fx/node');const project=unwrap(await loadProject('fixtures/short/little-light.afx'));const a=await createNativeRenderer(project.plan,project.assets,{width:320,height:180}),b=await createNativeRenderer(project.plan,project.assets,{width:320,height:180});try{const before=await b.captureFrame(97);const pixels=b.pixels(),view=Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength),owned=Buffer.from(view);b.render(479);expect(view).toEqual(owned);expect(b.pixels().buffer).not.toBe(pixels.buffer);a.dispose();a.dispose();expect(await b.captureFrame(97)).toEqual(before);await expect(a.captureFrame(0)).rejects.toMatchObject({code:'RENDERER_DISPOSED'});}finally{a.dispose();b.dispose();}const files=new Map(project.assets.files),font=files.get('nunito')!;files.set('nunito',{...font,bytes:Buffer.from(font.bytes)});files.get('nunito')!.bytes[100]=files.get('nunito')!.bytes[100]!^1;await expect(createNativeRenderer(project.plan,{...project.assets,files})).rejects.toMatchObject({code:'ASSET_INTEGRITY'});});
});

describe('distributed export backend',()=>{
 it('loads optional MP4 separately and keeps it outside the default exports',async()=>{const web=await import('@aether-fx/export'),mp4=await import('@aether-fx/export/mp4');expect('exportMP4' in web).toBe(false);expect(typeof mp4.exportMP4).toBe('function');});
 it('diagnoses missing external encoder for native rendering',async()=>{const {exportVideo}=await import('@aether-fx/node');const project=unwrap(await loadProject('fixtures/short/little-light.afx'));await expect(exportVideo(project,{backend:'native',ffmpegPath:'/nonexistent/afx-ffmpeg',output:'/nonexistent/excluded.webm'})).rejects.toMatchObject({code:'ENVIRONMENT_UNSUPPORTED'});});
});

describe('CI functional regressions',()=>{
  it('rejects Opus encoders that omit delayed content on flush, despite plausible chunk durations',async()=>{
    const {plan}=unwrap(await loadProject('fixtures/short/little-light.afx'));let packets=1,closed=0;
    class Frame {close(){}}
    class Video {state='configured';constructor(private init:{output:()=>void}){}static async isConfigSupported(config:unknown){return {supported:true,config};}configure(){}encode(){this.init.output();}async flush(){}close(){this.state='closed';}}
    class Audio {state='configured';constructor(private init:{output:(chunk:EncodedAudioChunk,metadata:EncodedAudioChunkMetadata)=>void}){}static async isConfigSupported(config:unknown){return {supported:true,config};}configure(){}encode(){}async flush(){
      const header=new Uint8Array(19);header.set(new TextEncoder().encode('OpusHead'));header[8]=1;header[9]=2;header[10]=56;header[11]=1;
      for(let i=0;i<packets;i++)this.init.output({byteLength:2,timestamp:i*20000,duration:1000000,copyTo(target:Uint8Array){target.set([0xf8,0]);}} as unknown as EncodedAudioChunk,{decoderConfig:{codec:'opus',sampleRate:48000,numberOfChannels:2,description:header}});
    }close(){this.state='closed';closed++;}}
    vi.stubGlobal('isSecureContext',true);vi.stubGlobal('VideoFrame',Frame);vi.stubGlobal('AudioData',Frame);vi.stubGlobal('VideoEncoder',Video);vi.stubGlobal('AudioEncoder',Audio);
    try{const rejected=await queryWebExport(plan);expect(rejected.ok).toBe(false);if(!rejected.ok){expect(rejected.diagnostics[0]!.code).toBe('EXPORT_UNSUPPORTED');expect(rejected.diagnostics[0]!.message).toContain('lost input samples after pre-skip');}packets=2;expect((await queryWebExport(plan)).ok).toBe(true);expect(closed).toBe(2);}finally{vi.unstubAllGlobals();}
  });
  it('distinguishes absent reports, failed reports and failed acceptance without creating a candidate',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'afx assembly rejection ')),script=fileURLToPath(new URL('../scripts/prepare-candidate.mjs',import.meta.url));
    try{
      await writeFile(join(directory,'release.config.json'),await readFile('release.config.json'));
      const execute=()=>spawnSync(process.execPath,[script,'--out','candidate'],{cwd:directory,encoding:'utf8',timeout:10000});
      expect(execute().status).toBe(1);
      let report=JSON.parse(await readFile(join(directory,'artifacts/assembly/diagnostic.json'),'utf8'));expect(report.status).toBe('FAIL');expect(report.blockers.every((b:{code:string})=>b.code==='REPORT_MISSING')).toBe(true);
      await mkdir(join(directory,'artifacts/ci'),{recursive:true});await writeFile(join(directory,'artifacts/ci/acceptance-report.json'),JSON.stringify({complete:false,ranAll:true,results:[{status:'FAIL',category:'budget'}]}));
      await mkdir(join(directory,'artifacts/ci-next'),{recursive:true});await writeFile(join(directory,'artifacts/ci-next/react-next-report.json'),JSON.stringify({status:'FAIL',complete:false}));
      expect(execute().status).toBe(1);report=JSON.parse(await readFile(join(directory,'artifacts/assembly/diagnostic.json'),'utf8'));expect(report.blockers.map((b:{code:string})=>b.code)).toContain('ACCEPTANCE_FAILED');expect(report.blockers.map((b:{code:string})=>b.code)).toContain('REPORT_FAILED');expect(report.candidateCreated).toBe(false);await expect(readFile(join(directory,'candidate/manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
    }finally{await rm(directory,{recursive:true,force:true});}
  });
});
