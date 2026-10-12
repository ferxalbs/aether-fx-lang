import {fileURLToPath} from 'node:url';
import { spawnSync } from 'node:child_process';
import { queryWebExport } from '@aether-fx/export';
import { describe, it, expect, vi } from 'vitest';
import { readFile, mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
describe('parametric lamp/table authoring',()=>{
  const generatorPath='../scripts/create-parametric-demo.mjs';
  const geometryPath='../scripts/parametric-geometry.mjs';
  it('regenerates the canonical fixture and preserves face correspondence through dimensional edits',async()=>{
    const {createDemo,demoSource}=await import(generatorPath);
    const original=createDemo(),edited=createDemo({tableWidth:320,lampRadius:28});
    expect(await readFile('fixtures/parametric/lamp-table.afx','utf8')).toBe(demoSource(original.document));
    const loaded=unwrap(await loadProject('fixtures/parametric/lamp-table.afx'));
    expect(loaded.plan.document).toEqual(original.document);
    expect(loaded.plan.duration).toBe(384);
    expect(edited.solids.length).toBe(original.solids.length);
    for(let i=0;i<original.solids.length;i++)expect(edited.solids[i].topology).toEqual(original.solids[i].topology);
    expect(edited.document.shapes).not.toEqual(original.document.shapes);
    for(const s of edited.solids)if(s.approximation)expect(s.approximation.projectedErrorBound).toBeLessThanOrEqual(.5);
    expect(JSON.stringify(createDemo({cylinderSteps:48}).solids.find((s:{id:string})=>s.id==='base').topology)).not.toBe(JSON.stringify(original.solids.find((s:{id:string})=>s.id==='base').topology));
    expect(()=>createDemo({tableWidth:100})).toThrow('Dimensions');
    const handle=original.solids.find((s:{id:string})=>s.id==='handleTop').parameters;
    const front=original.solids.find((s:{id:string})=>s.id==='gripFront').parameters;
    const back=original.solids.find((s:{id:string})=>s.id==='gripBack').parameters;
    expect(front.ring[0].position[1]).toBe(handle.ring[2].position[1]);
    expect(back.ring[2].position[1]).toBe(handle.ring[0].position[1]);
    expect(front.z).toBeLessThan(handle.z);expect(front.z+front.height).toBeGreaterThan(handle.z+handle.height);
  });
  it('rejects unsupported outlines and cylinder approximations rather than silently exceeding their budget',async()=>{
    const {extrude,cylinder,projection}=await import(geometryPath),camera=projection();
    const palette={top:'#ffffff',light:'#aaaaaa',dark:'#555555'};
    const make=(positions:number[][])=>extrude({id:'solid',ring:positions.map((position,i)=>({id:'v'+i,position})),height:10,palette},camera);
    expect(()=>make([[0,0],[10,10],[0,10],[10,0]])).toThrow('convex');
    expect(()=>make([[0,0],[0,10],[10,10],[10,0]])).toThrow('convex');
    expect(()=>make([[0,0],[10,0],[5,3],[10,10],[0,10]])).toThrow('convex');
    expect(()=>cylinder({id:'solid',radius:100,height:10,palette,tolerance:.001,steps:32},camera)).toThrow('budget');
    expect(()=>projection({scale:0})).toThrow('positive');
  });
  it('paints same-tone cylinder joints without background leaks while retaining face IDs and silhouette',async()=>{
    const {createDemo}=await import(generatorPath),demo=createDemo();
    const {createNativeRenderer}=await import('@aether-fx/node');
    const {plan,assets}=unwrap(await loadProject('fixtures/parametric/lamp-table.afx'));
    // Isolate the surface so prepared frame posts cannot occlude sampled joints.
    const surface=structuredClone(plan.document);
    for(const p of surface.parts)if(p.id!=='wall'&&!p.id.startsWith('housing_'))p.material.fill=null;
    const renderer=await createNativeRenderer(unwrap(compile(surface,assets.manifest)),assets);
    const housing=demo.solids.find((s:{id:string})=>s.id==='housing');
    const seamSamples:{at:number;expected:number[]}[]=[];
    try{
      for(const frame of [0,156,300,383]){
        const draw=evaluate(plan,{frame}),root=draw.commands.find(c=>c.id==='lamp.'+housing.faces[0].id)!;
        renderer.render(frame);const pixels=renderer.pixels();let checked=0;
        for(let i=1;i<housing.faces.length;i++){
          const a=housing.faces[i-1],b=housing.faces[i];
          if(!a.role||a.role!==b.role||a.vertices[1].id!==b.vertices[0].id||b.vertices[0].position[1]<12)continue;
          const position=[...b.vertices[0].position];position[2]+=housing.parameters.height/2;
          const p=demo.camera.point(position),m=root.matrix;
          const x=Math.round(m[0]*p[0]+m[2]*p[1]+m[4]),y=Math.round(m[1]*p[0]+m[3]*p[1]+m[5]);
          const expected=(b.fill.match(/\w\w/g) as string[]).map(hex=>parseInt(hex,16));
          const at=(y*960+x)*4;
          if(frame===383)seamSamples.push({at,expected});
          for(let channel=0;channel<3;channel++)expect(Math.abs(pixels[at+channel]!-expected[channel]!)).toBeLessThanOrEqual(2);
          expect(draw.commands.find(c=>c.id==='lamp.'+b.id)!.material.fill).toBeNull();checked++;
        }
        expect(checked).toBeGreaterThan(0);
        for(const group of housing.paintGroups)for(const contour of group.shape.contours){
          const face=housing.faces.find((f:{id:string})=>f.id===contour.id);
          expect({...contour,id:'outline'}).toEqual(face.shape.contours[0]);
        }
      }
      const separate=structuredClone(surface);
      for(const group of housing.paintGroups)separate.parts.find(p=>p.id===group.id)!.material.fill=null;
      for(const face of housing.faces)separate.parts.find(p=>p.id===face.id)!.material.fill=face.fill;
      const previous=await createNativeRenderer(unwrap(compile(separate,assets.manifest)),assets);
      try{
        previous.render(383);const pixels=previous.pixels();
        expect(seamSamples.some(s=>s.expected.some((n,c)=>Math.abs(pixels[s.at+c]!-n)>2))).toBe(true);
      }finally{previous.dispose();}
    }finally{renderer.dispose();}
  });
  it('preserves the assembled contact pose and seek state through separation, attachment and lifting',async()=>{
    const {plan}=unwrap(await loadProject('fixtures/parametric/lamp-table.afx'));
    const frames=Array.from({length:plan.duration},(_,frame)=>evaluate(plan,{frame}));
    const serialized=frames.map(frame=>JSON.stringify(frame));
    for(let i=0;i<plan.duration;i++)expect(JSON.stringify(evaluate(plan,{frame:i*137%plan.duration}))).toBe(serialized[i*137%plan.duration]);
    for(let frame=plan.duration-1;frame>=0;frame--)expect(JSON.stringify(evaluate(plan,{frame}))).toBe(serialized[frame]);
    expect(frames[239]!.commands).toEqual(frames[0]!.commands);
    const base=(frame:number)=>frames[frame]!.commands.find(c=>c.id==='lamp.base_top')!;
    expect(base(263).matrix).toEqual(base(264).matrix);
    for(let frame=264;frame<384;frame++){
      const anchor=frames[frame]!.commands.find(c=>c.id==='grip.anchor')!;
      expect(base(frame).matrix).toEqual(anchor.matrix);
    }
    expect(base(348).matrix[5]).toBeLessThan(base(264).matrix[5]);
  },15000);
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

describe('integrated vector scenes',()=>{
  it.each(['fixtures/short/little-light-authored.afx','fixtures/short/little-light-varied.afx','fixtures/short/little-light-assembly.afx','fixtures/assembly/guide-carriage.afx'])('roundtrips public authoring and seeks contact boundaries in %s',async(file)=>{
    const {compileSource,print}=await import('@aether-fx/compiler');
    const {matrixPoint}=await import('@aether-fx/core');

      const {plan,assets,sources}=unwrap(await loadProject(file));
      const sourceOptions={sourceId:resolve(file),resolveModule:(specifier:string,importer:string)=>{const id=resolve(dirname(importer),specifier);return {id,source:sources!.get(id)!};}};
      expect(unwrap(compileSource(print(unwrap(parse(await readFile(file,'utf8')))),assets.manifest,sourceOptions))).toEqual(plan);
      const frames=file.includes('little-light-assembly')?[0,12,35,36,60,84,108,143]:file.includes('little-light')?[0,144,156,174,194,203,204,205,216,240,274,335,336,479]:[0,36,60,84,132,156,191,192,193,239];
      const expected=new Map(frames.map(frame=>[frame,evaluate(plan,{frame})]));
      for(const frame of [...frames].reverse())expect(evaluate(plan,{frame})).toEqual(expected.get(frame));
      if(file.includes('little-light')&&!file.includes('assembly'))for(const frame of [203,204,205,216,240,274,335,336,479]){
        const draw=expected.get(frame)!,hand=draw.commands.find(c=>c.id==='hero.hand')!,lamp=draw.commands.find(c=>c.id==='lantern.lanternBody')!;
        const a=matrixPoint(hand.matrix,[18,-5]),b=matrixPoint(lamp.matrix,[-2,-31]);
        if(frame>=204)expect(Math.hypot(a[0]-b[0],a[1]-b[1])).toBeLessThan(1e-8);
        expect(draw.commands.find(c=>c.id==='hero.fingers')!.layer).toBeGreaterThan(draw.commands.find(c=>c.id==='lantern.lanternHandle')!.layer);
      }
      });
  it('keeps the drawn grip on the handle, rigid sleeves, planted feet and supported bind/release poses',async()=>{
    const {createCanvas}=await import('@napi-rs/canvas'),{createRenderer}=await import('@aether-fx/canvas');
    const {matrixPoint}=await import('@aether-fx/core');
    const {plan}=unwrap(await loadProject('fixtures/short/little-light-authored.afx'));
    const world=structuredClone(plan);
    for(const item of world.shots){item.snapshot.values['camera']={x:0,y:0,scaleX:1,scaleY:1,rotation:0};item.shot.keys=item.shot.keys.filter(k=>k.target!=='camera');}
    const draw=(frame:number)=>evaluate(world,{frame}),command=(frame:number,id:string)=>draw(frame).commands.find(c=>c.id===id)!;
    const near=(a:number[],b:number[])=>{for(let i=0;i<a.length;i++)expect(a[i]).toBeCloseTo(b[i]!,8);};
    const foot=command(0,'hero.shoes').matrix;
    for(const frame of [72,143,144,174,194,203,204,216,217,240,274,298,335,336,479]){
      expect(command(frame,'hero.shoes').matrix).toEqual(foot);
      for(const id of ['hero.frontArm','hero.foreArm']){
        expect(command(frame,id).shape).toEqual(command(0,id).shape);
        expect(Math.hypot(command(frame,id).matrix[0],command(frame,id).matrix[1])).toBeCloseTo(1,10);
      }
    }
    near(command(143,'hero.head').matrix,command(144,'hero.head').matrix);
    near(command(203,'lantern.lanternBody').matrix,command(204,'lantern.lanternBody').matrix);
    near(command(204,'lantern.lanternBody').matrix,command(216,'lantern.lanternBody').matrix);
    expect(command(217,'lantern.lanternBody').matrix[5]).toBeLessThan(command(216,'lantern.lanternBody').matrix[5]);
    near(command(335,'hero.hand').matrix,command(336,'hero.hand').matrix);
    near(command(335,'lantern.lanternBody').matrix,command(336,'lantern.lanternBody').matrix);
    expect(command(193,'hero.fingers').shape).not.toEqual(command(194,'hero.fingers').shape);
    expect(command(203,'hero.fingers').shape).not.toEqual(command(204,'hero.fingers').shape);
    const canvas=createCanvas(1280,720),painter=createRenderer(canvas as unknown as HTMLCanvasElement);
    try{
      for(const frame of [204,205,216,217,240,274,335,336,479]){
        const list=draw(frame),handle=command(frame,'lantern.lanternHandle'),fingers=command(frame,'hero.fingers'),hand=command(frame,'hero.hand');
        const grip=matrixPoint(hand.matrix,[18,-5]),crown=matrixPoint(handle.matrix,[-2,-31]);near(grip,crown);
        expect(hand.layer).toBeLessThan(handle.layer);expect(fingers.layer).toBeGreaterThan(handle.layer);
        // Each drawn surface must actually cover the landmark, independently of anchor coincidence.
        for(const [part,color] of [[handle,[142,101,91]],[fingers,[239,189,153]]] as const){
          painter.render({...list,commands:[part]});
          const pixel=canvas.getContext('2d').getImageData(Math.round(crown[0]),Math.round(crown[1]),1,1).data;
          expect(pixel[3]).toBe(255);for(let c=0;c<3;c++)expect(Math.abs(pixel[c]!-color[c]!)).toBeLessThanOrEqual(2);
        }
      }
    }finally{painter.dispose();}
  });
  it('reuses a public component with changed dimensions and stable face IDs',async()=>{
    const {compileSource}=await import('@aether-fx/compiler');
    const source=await readFile('fixtures/assembly/guide-carriage.afx','utf8');
    const before=unwrap(compileSource(source)),after=unwrap(compileSource(source.replace('radius: 14; height: 55;','radius: 18; height: 55;')));
    expect(before.document.actors.find(a=>a.id==='far_post')!.solid!.radius).toBe(10);
    expect(before.document.actors.find(a=>a.id==='near_post')!.solid!.radius).toBe(14);
    expect(after.document.actors.find(a=>a.id==='near_post')!.solid!.radius).toBe(18);
    expect(after.document.shapes.map(s=>s.id)).toEqual(before.document.shapes.map(s=>s.id));
    expect(after.document.shapes.find(s=>s.id==='near_post_top_shape')).not.toEqual(before.document.shapes.find(s=>s.id==='near_post_top_shape'));
  });
  it('draws local gradients and evenodd clipping through nonuniform world/camera transforms',async()=>{
    const {compileSource}=await import('@aether-fx/compiler'),{createNativeRenderer}=await import('@aether-fx/node'),{matrixPoint}=await import('@aether-fx/core');
    const source=`project material {viewport:(320,240);fps:(24,1);
      shape rect {primitive:rect;size:(40,40);}
      shape hole {primitive:path;data:"M0 0 H40 V40 H0 Z M15 15 H25 V25 H15 Z";}
      part test {shape:@rect;clip:@hole;material:{fillRule:evenodd;fill:{type:linear;from:(0,0);to:(40,0);stops:[{offset:0;color:"#ff0000";},{offset:1;color:"#0000ff";}];};};}
      actor test {parts:[@test];transform:{x:100;y:80;scaleX:2;scaleY:1.5;rotation:30deg;};}
      scene s {shot s {duration:2f;camera c {x:20;y:15;scaleX:0.8;scaleY:1.2;rotation:10deg;}}}}
    `;
    const p=unwrap(compileSource(source)),r=await createNativeRenderer(p,{manifest:[],files:new Map()});
    try {
      r.render(0);const pixels=r.pixels(),m=evaluate(p,{frame:0}).commands[0]!.matrix;
      const at=(point:[number,number])=>{const [x,y]=matrixPoint(m,point);return Array.from(pixels.slice((Math.round(y)*320+Math.round(x))*4,(Math.round(y)*320+Math.round(x))*4+4));};
      expect(at([20,20])[3]).toBe(0);expect(at([5,20])[3]).toBe(255);
      expect(at([5,20])[0]).toBeGreaterThan(210);expect(at([35,20])[2]).toBeGreaterThan(210);
    }finally{r.dispose();}
  });
});
