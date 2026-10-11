import { describe, it, expect } from 'vitest';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, resolveAssets, wavMetadata, imageMetadata, doctor } from '@aether-fx/node';
import { compile, evaluate, serializePlan, deserializePlan } from '@aether-fx/core';
import { normalize, parse } from '@aether-fx/compiler';
import type { Result } from '@aether-fx/core';
const unwrap=<T>(result:Result<T>):T=>{if(!result.ok)throw new Error(JSON.stringify(result.diagnostics));return result.value;};

describe('illustrated acceptance semantics',()=>{
  it('has real declared assets, twelve character parts, four poses and exact shot lengths',async()=>{
    const {plan,assets}=unwrap(await loadProject('fixtures/short/little-light.afx'));
    expect(plan.duration).toBe(480);expect(plan.document.viewport).toEqual([1280,720]);expect(plan.document.fps).toEqual({numerator:24,denominator:1});
    expect(plan.document.shots.map(s=>s.duration)).toEqual([144,192,144]);expect(plan.document.actors.find(a=>a.id==='hero')!.parts).toHaveLength(12);
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
