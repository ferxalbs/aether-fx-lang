import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyPatch, compile, deserializeDocument, deserializePlan, evaluate, frameTimestamp, serializeDocument, serializePlan, validate } from '@aether-fx/core';
import type { FxDocument, PlaybackPlan, Result } from '@aether-fx/core';
import { compileSource, normalize, parse, print } from '@aether-fx/compiler';
const source=readFileSync(new URL('../fixtures/curve.afx',import.meta.url),'utf8');
const corpus=readFileSync(new URL('../fixtures/language/all-constructs.afx',import.meta.url),'utf8');
const shortSource=readFileSync(new URL('../fixtures/short/little-light.afx',import.meta.url),'utf8');
const shortManifest=JSON.parse(readFileSync(new URL('../fixtures/short/manifest.json',import.meta.url),'utf8'));
function unwrap<T>(r:Result<T>):T { if (!r.ok) throw new Error(JSON.stringify(r.diagnostics)); return r.value; }
const document=()=>structuredClone(unwrap(normalize(unwrap(parse(source)))));
const plan=()=>unwrap(compile(document()));
const mouth=(p:PlaybackPlan,frame:number)=>evaluate(p,{frame}).commands.find(c=>c.id==='hero.mouth')!;

describe('absolute evaluation and geometry',()=>{
  it('evaluates all 480 frames identically in shuffled, reverse and linear order',()=>{
    const p=plan(), expected=Array.from({length:480},(_,frame)=>evaluate(p,{frame}));
    for (let i=0;i<480;i++) {const frame=i*137%480;expect(evaluate(p,{frame})).toEqual(expected[frame]);}
    for (let frame=479;frame>=0;frame--) expect(evaluate(p,{frame})).toEqual(expected[frame]);
    expect(mouth(p,97).matrix[4]).toBeCloseTo(442.5);
  });
  it('carries final state across boundaries and reverts temporary exposures',()=>{
    const p=plan();
    expect([143,144,335,336,479].map(frame=>mouth(p,frame).matrix[4])).toEqual([500,500,500,500,500]);
    expect(mouth(p,174).shape!.contours[0]!.segments[0]!.control1[1]).toBe(60);
    expect(mouth(p,204).shape!.contours[0]!.segments[0]!.control1[1]).toBe(80);
    expect(mouth(p,336).shape!.contours[0]!.segments[0]!.control1[1]).toBe(80);
    expect(mouth(p,360).shape!.contours[0]!.segments[0]!.control1[1]).toBe(40);
    expect(mouth(p,362).shape!.contours[0]!.segments[0]!.control1[1]).toBe(80);
    for(const frame of [480,-1,1.5])expect(()=>evaluate(p,{frame})).toThrow(RangeError);
  });
  it('freezes the plan and gives each DrawList its own storage',()=>{
    const d=document(),p=unwrap(compile(d)),first=mouth(p,97);
    d.actors[0]!.transform.x=900;first.shape!.contours[0]!.start[0]=999;
    expect(mouth(p,97).shape!.contours[0]!.start[0]).toBe(0);
    expect(()=>{p.document.actors[0]!.transform.x=900;}).toThrow(TypeError);
    expect(mouth(p,97).matrix[4]).toBeCloseTo(442.5);
  });
  it('holds animation on twos independently of camera keys',()=>{
    const d=document();d.shots[0]!.keys[0]!.hold=2;
    d.shots[0]!.keys.push({id:'cam0',target:'camera',property:'x',frame:0,value:0,easing:'linear',rotation:'direct',hold:1},{id:'cam1',target:'camera',property:'x',frame:120,value:120,easing:'linear',rotation:'direct',hold:1});
    expect(mouth(unwrap(compile(d)),3).matrix[4]).toBe(202);
  });
  it('distinguishes direct and shortest rotation',()=>{
    const d=document(),keys=d.shots[0]!.keys;
    keys[0] = {...keys[0]!,property:'rotation',value:350*Math.PI/180,rotation:'shortest'};
    keys[1] = {...keys[1]!,property:'rotation',value:10*Math.PI/180};
    expect(mouth(unwrap(compile(d)),60).matrix[0]).toBeCloseTo(1);
    keys[0]!.rotation='direct';expect(mouth(unwrap(compile(d)),60).matrix[0]).toBeCloseTo(-1);
  });
  it('parents an object to an actor part at a discrete contact frame',()=>{
    const d=document();d.actors.push({id:'object',parts:['mouth'],transform:{...d.actors[0]!.transform,x:20,y:0},parent:null,layer:1});
    d.shots[0]!.keys.push({id:'contact',target:'object',property:'parent',frame:24,value:'hero.mouth',easing:'linear',rotation:'direct',hold:1});
    const p=unwrap(compile(d));
    expect(evaluate(p,{frame:23}).commands.find(c=>c.id==='object.mouth')!.matrix[4]).toBe(20);
    expect(evaluate(p,{frame:24}).commands.find(c=>c.id==='object.mouth')!.matrix[4]).toBe(280);
  });
});
describe('time',()=>{
  it('rounds absolute rational timestamps and audio samples without drift',()=>{
    expect(frameTimestamp(480,{numerator:24,denominator:1})).toBe(20_000_000);
    expect(frameTimestamp(30_000,{numerator:30_000,denominator:1001})).toBe(1_001_000_000);
    expect(frameTimestamp(1,{numerator:30_000,denominator:1001})).toBe(33_367);
    expect(frameTimestamp(30_000,{numerator:30_000,denominator:1001},48000)).toBe(48_048_000);
    expect(frameTimestamp(1,{numerator:2,denominator:1},1)).toBe(1);
    expect(()=>frameTimestamp(1,{numerator:0,denominator:1})).toThrow(RangeError);
  });
});
describe('validation and serialization',()=>{
  it.each([
    ['DUPLICATE_ID',(d:FxDocument)=>d.parts.push(structuredClone(d.parts[0]!))],
    ['REFERENCE_MISSING',(d:FxDocument)=>{d.parts[0]!.shape='absent';}],
    ['HIERARCHY_CYCLE',(d:FxDocument)=>{d.parts[0]!.parent='mouth';}],
    ['HIERARCHY_CYCLE',(d:FxDocument)=>{d.actors[0]!.parent='hero.mouth';}],
    ['FRAME_RANGE',(d:FxDocument)=>{d.shots[0]!.keys[0]!.frame=144;}],
    ['PROPERTY_CONFLICT',(d:FxDocument)=>{d.shots[0]!.keys.push({...d.shots[0]!.keys[0]!,id:'duplicate'});}],
    ['MORPH_TOPOLOGY',(d:FxDocument)=>{d.shapes[1]!.contours[0]!.segments[0]!.id='unmatched';}],
    ['REFERENCE_MISSING',(d:FxDocument)=>{d.poses[1]!.parts.mouth!.shape='absent';}],
    ['CAMERA_SCALE',(d:FxDocument)=>{d.shots[0]!.camera.scaleX=0;}],
    ['PROPERTY_TYPE',(d:FxDocument)=>{d.shots[0]!.keys[0]!.value=true;}],
  ] as const)('diagnoses %s without throwing',(code,change)=>{
    const d=document();change(d);const result=compile(d);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics.map(e=>e.code)).toContain(code);
  });
  it('rejects unknown schemas, malformed JSON, unsafe keys, nonfinite values and methods',()=>{
    expect(deserializeDocument('{"schemaVersion":2}')).toMatchObject({ok:false,diagnostics:[{code:'SCHEMA_VERSION'}]});
    expect(deserializeDocument('{')).toMatchObject({ok:false,diagnostics:[{code:'JSON_INVALID'}]});
    expect(deserializeDocument('{"__proto__":{}}')).toMatchObject({ok:false,diagnostics:[{code:'UNSAFE_KEY'}]});
    const d=document();d.parts[0]!.transform.x=Infinity;expect(validate(d)[0]!.code).toBe('SCHEMA_INVALID');
    expect(validate({...document(), extra:()=>0})[0]!.code).toBe('SCHEMA_INVALID');
    const cyclic:Record<string,unknown>={};cyclic.self=cyclic;expect(validate(cyclic)[0]!.code).toBe('SCHEMA_INVALID');
  });
  it('preserves semantics in document, AST and plan roundtrips; rejects corrupted snapshots',()=>{
    const d=document(),p=unwrap(compile(d));
    expect(unwrap(deserializeDocument(serializeDocument(d)))).toEqual(d);
    expect(unwrap(normalize(unwrap(parse(print(unwrap(parse(source)))))))).toEqual(d);
    expect(unwrap(deserializePlan(serializePlan(p)))).toEqual(p);
    const corrupted=JSON.parse(serializePlan(p));corrupted.shots[0].snapshot.values.hero.x=900;
    expect(deserializePlan(JSON.stringify(corrupted))).toMatchObject({ok:false,diagnostics:[{code:'PLAN_INVALID'}]});
  });
  it('accepts engine roundoff only in rebuilt contact snapshots, without trusting wire values',()=>{
    const source=readFileSync(new URL('../fixtures/short/little-light-authored.afx',import.meta.url),'utf8');
    const sourceId=fileURLToPath(new URL('../fixtures/short/little-light-authored.afx',import.meta.url));
    const p=unwrap(compileSource(source,shortManifest,{sourceId,resolveModule:(specifier,importer)=>{const id=resolve(dirname(importer),specifier);return {id,source:readFileSync(id,'utf8')};}}));
    const wire=JSON.parse(serializePlan(p));
    // Chromium and Node differ at this boundary by these ulps after rotated FK/contact.
    wire.shots[2].snapshot.values.lantern.scaleX+=Number.EPSILON;
    wire.shots[2].snapshot.values.lantern.scaleY+=Number.EPSILON;
    wire.shots[2].snapshot.values.lantern.rotation+=Number.EPSILON/8;
    expect(unwrap(deserializePlan(JSON.stringify(wire)))).toEqual(p);
    const changed=structuredClone(wire);changed.shots[2].snapshot.values.lantern.x+=1e-7;
    expect(deserializePlan(JSON.stringify(changed))).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'PLAN_INVALID'})]});
    const track=structuredClone(wire);track.shots[2].shot.camera.x+=1e-12;
    expect(deserializePlan(JSON.stringify(track))).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'PLAN_INVALID'})]});
  });
  it('enforces configurable structural and duration limits',()=>{
    expect(compile(document(),[],{duration:100})).toMatchObject({ok:false,diagnostics:[{code:'LIMIT_EXCEEDED'}]});
    expect(parse(source,{sourceBytes:10})).toMatchObject({ok:false,diagnostics:[{code:'LIMIT_EXCEEDED'}]});
    expect(parse(source,{depth:2})).toMatchObject({ok:false,diagnostics:[{code:'LIMIT_EXCEEDED'}]});
  });
});
describe('structured edits',()=>{
  it('moves an expression six frames with differences limited to its interval',()=>{
    const d=document(),before=unwrap(compile(d));
    const patch=unwrap(applyPatch(d,{baseRevision:0,operations:[{op:'updateProperty',collection:'shots',id:'second',path:['morphs','0','start'],value:6},{op:'updateProperty',collection:'shots',id:'second',path:['morphs','0','end'],value:66}]}));
    const after=unwrap(compile(patch.document));expect(patch.revision).toBe(1);expect(patch.affectedIds).toEqual(['second']);
    for(let frame=0;frame<480;frame++)if(frame<144||frame>=210)expect(evaluate(after,{frame})).toEqual(evaluate(before,{frame}));
    expect(mouth(after,150).shape).not.toEqual(mouth(before,150).shape);
  });
  it('rejects stale and invalid patches atomically',()=>{
    const d=document(),before=serializeDocument(d);
    expect(applyPatch(d,{baseRevision:3,operations:[]})).toMatchObject({ok:false,diagnostics:[{code:'REVISION_CONFLICT'}]});
    expect(applyPatch(d,{baseRevision:0,operations:[{op:'updateProperty',collection:'actors',id:'hero',path:['transform','x'],value:20},{op:'removeNode',collection:'shapes',id:'smile'}]}).ok).toBe(false);
    expect(serializeDocument(d)).toBe(before);
  });
});
describe('source diagnostics',()=>{
  const keywords=['project','asset','shape','contour','cubic','part','actor','pose','drawing','background','scene','shot','initial','key','morph','expose','camera','audio'];
  const ast=unwrap(parse(corpus));
  const declarations:(typeof ast.project)[]=[];
  const visit=(d:typeof ast.project)=>{declarations.push(d);d.children.forEach(visit);};visit(ast.project);
  const location=(input:string,start:number,end:number)=>{const lines=input.slice(0,start).split(/\r\n|\r|\n/);return {start,end,line:lines.length,column:lines.at(-1)!.length+1};};
  it('roundtrips every v0 construction, units and IDs without changing any frame',()=>{
    expect(new Set(declarations.map(d=>d.keyword))).toEqual(new Set(keywords));
    const before=unwrap(compileSource(corpus,shortManifest)),after=unwrap(compileSource(print(ast),shortManifest));
    expect(before.document).toEqual(after.document);expect(before.duration).toBe(480);
    for(let frame=0;frame<480;frame++)expect(evaluate(after,{frame})).toEqual(evaluate(before,{frame}));
  });
  it.each(keywords)('locates an invalid property inside %s',(keyword)=>{
    const declaration=declarations.find(d=>d.keyword===keyword)!,at=declaration.range.end-1,field='unexpected: 0;';
    const input=corpus.slice(0,at)+field+corpus.slice(at),result=compileSource(input,shortManifest);
    expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics.find(d=>d.code==='PROPERTY_UNKNOWN')?.range).toEqual(location(input,at,at+field.length));
  });
  it.each(keywords)('locates truncated %s at the actual EOF',(keyword)=>{
    const input=corpus.slice(0,declarations.find(d=>d.keyword===keyword)!.range.end-1)+'\r\n  ',result=parse(input);
    expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics[0]!.range).toEqual(location(input,input.length,input.length));
  });
  it.each(['','\n','\r','\r\n','// comment ☺\r\n'])('locates EOF with empty/comment-only input %j',(input)=>{
    const result=parse(input);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics[0]!.range).toEqual(location(input,input.length,input.length));
  });
  it.each([
    ['viewport: (1280, 720)','viewport: (0, 720)','/viewport/0','0'],
    ['fps: (30000, 1001)','fps: (30000, 0)','/fps/denominator','0'],
    ['opacity: 0.8; visible: true','opacity: 2; visible: true','/parts/0/transform/opacity','2'],
    ['size: 24','size: -24','/parts/1/text/size','-24'],
    ['width: 128','width: -128','/parts/2/image/width','-128'],
    ['parallax: 0.5','parallax: 2','/backgrounds/0/parallax','2'],
    ['duration: 144f','duration: 0f','/shots/0/duration','0f'],
    ['x: 200; opacity: 1','x: [200]; opacity: 1','/shots/0/initial/0/values/x','[200]'],
    ['rotationMode: shortest','rotationMode: invalid','/shots/0/keys/0/rotation','invalid'],
    ['hold: 2f','hold: 0f','/shots/0/keys/0/hold','0f'],
    ['scaleX: 1; scaleY','scaleX: "bad"; scaleY','/shots/0/camera/scaleX','"bad"'],
    ['offset: 0f','offset: -1f','/audio/offset','-1f'],
    ['version: 1;\n  revision','version: 2;\n  revision',undefined,'2'],
  ])('locates the schema value in %s',(before,after,path,highlight)=>{
    let difference=0;while(before![difference]===after![difference]&&difference<before!.length)difference++;
    const input=corpus.replace(before!,after!),result=compileSource(input,shortManifest),start=input.indexOf(after!)+after!.indexOf(highlight!,difference);
    expect(result.ok).toBe(false);if(!result.ok){const d=result.diagnostics.find(d=>d.path===path);expect(d?.range).toEqual(location(input,start,start+highlight!.length));}
  });
  it('preserves the complete unit suffix and locates missing fields at their owner',()=>{
    const bad=corpus.replace('hold: 2f','hold: 2deg'),result=compileSource(bad,shortManifest),start=bad.indexOf('2deg');
    expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics.find(d=>d.code==='UNIT_REQUIRED')?.range).toEqual(location(bad,start,start+4));
    const missing=corpus.replace('size: 24;',''),parsed=unwrap(parse(missing)),label=parsed.project.children.find(d=>d.keyword==='part'&&d.id==='label')!,text=label.fields.find(f=>f.name==='text')!;
    const invalid=compileSource(missing,shortManifest);expect(invalid.ok).toBe(false);if(!invalid.ok)expect(invalid.diagnostics.find(d=>d.path==='/parts/1/text/size')?.range).toEqual(text.value.range);
  });
  it('locates references by collection ownership when actor and part IDs match',()=>{
    const valid=corpus.replaceAll('@hero','@mouth').replace('actor hero {','actor mouth {').replace('initial hero {','initial mouth {');
    expect(compileSource(valid,shortManifest).ok).toBe(true);
    const input=valid.replace('actor mouth { parts: [@mouth, @label]','actor mouth { parts: [@absent, @label]'),start=input.indexOf('@absent');
    expect(compileSource(input,shortManifest)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'REFERENCE_MISSING',id:'mouth',path:'/actors/0/parts/0',range:location(input,start,start+7)})])});
  });
  it('locates a reused track ID in its own shot and retains its invalid frame',()=>{
    const key='key turn0 { target: @hero; property: x; frame: 192f; value: 0; }';
    const input=corpus.replace('shot second { duration: 192f;','shot second { duration: 192f; '+key),start=input.indexOf('192f',input.indexOf(key));
    expect(compileSource(input,shortManifest)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'FRAME_RANGE',id:'turn0',path:'/shots/1/keys/0/frame',frame:192,range:location(input,start,start+4)})])});
    expect(compileSource(input.replace(key,key.replace('192f','0f')),shortManifest).ok).toBe(true);
  });
  it('locates duplicate declarations at the second owner, including nested contours',()=>{
    const part='part mouth { shape: @neutralShape; }',input=corpus.replace('part texture {',part+'\n  part texture {'),start=input.indexOf(part);
    expect(compileSource(input,shortManifest)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'DUPLICATE_ID',id:'mouth',path:'/parts/2/id',range:location(input,start,start+part.length)})])});
    const parsed=unwrap(parse(corpus)),shape=parsed.project.children.find(d=>d.id==='smileShape')!;shape.children.push(structuredClone(shape.children[0]!));
    const nested=print(parsed),owners=unwrap(parse(nested)).project.children.find(d=>d.id==='smileShape')!.children;
    expect(compileSource(nested,shortManifest)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'DUPLICATE_ID',id:'outline',path:'/shapes/1/contours/1/id',range:owners[1]!.range})])});
  });
  it('maps initial property errors through their shot and retains exposure intervals',()=>{
    const input=corpus.replace('initial object { parent: null; }','initial object { x: true; }'),start=input.indexOf('true',input.indexOf('shot second'));
    expect(compileSource(input,shortManifest)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'PROPERTY_TYPE',id:'second',path:'/shots/1/initial/0/values/x',range:location(input,start,start+4)})])});
    const interval=corpus.replace('end: 74f','end: 145f'),expose=unwrap(parse(interval)).project.children.find(d=>d.keyword==='scene')!.children[0]!.children.find(d=>d.keyword==='expose')!;
    expect(compileSource(interval,shortManifest)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'FRAME_RANGE',id:'blinkOnce',path:'/shots/0/exposures/0',interval:[72,145],range:expose.range})])});
  });
  it('locates compile-time camera errors in their shot even when a shape has that ID',()=>{
    const input=corpus.replaceAll('neutralShape','second').replace('shot second { duration: 192f;','shot second { duration: 192f; camera close { scaleX: 0; }');
    const shot=unwrap(parse(input)).project.children.filter(d=>d.keyword==='scene')[1]!.children[0]!;
    expect(compileSource(input,shortManifest)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'CAMERA_SCALE',id:'second',path:'/shots/1',frame:0,range:shot.range})])});
  });
  it('keeps host manifest paths distinct without inventing a source location',()=>{
    const manifest=structuredClone(shortManifest);manifest[0].hash='invalid';
    const result=compileSource(corpus,manifest);expect(result.ok).toBe(false);
    if(!result.ok){expect(result.diagnostics[0]!.path).toBe('/manifest/0/hash');expect(result.diagnostics[0]!.range).toBeUndefined();}
  });
  it('treats JavaScript text as data and never executes invalid programs',()=>{
    const name='__aetherFxExecutionProbe',original=Object.getOwnPropertyDescriptor(globalThis,name);let executions=0;
    Object.defineProperty(globalThis,name,{configurable:true,set(){executions++;}});
    try {
      const statement=`globalThis.${name} = 1`;
      const text=corpus.replace(/content: "(?:[^"\\]|\\.)*"/,'content: '+JSON.stringify(statement));
      expect(unwrap(compileSource(text,shortManifest)).document.parts.find(p=>p.id==='label')!.text!.content).toBe(statement);
      for(const input of [statement,`import x from "module";`, `for(;;){${statement}}`, `Function("${statement}")()`,corpus.replace('x: 200; opacity: 1',`x: ${statement}; opacity: 1`)]){
        const result=compileSource(input,shortManifest);expect(result.ok).toBe(false);if(!result.ok)expect(result.diagnostics[0]!.range).toBeDefined();
      }
      expect(executions).toBe(0);
    } finally {if(original)Object.defineProperty(globalThis,name,original);else Reflect.deleteProperty(globalThis,name);}
  });
  it.each([
    ['project x { viewport: (1,1); fps: (24,1); scene s { shot a { duration: 1; } } }','UNIT_REQUIRED'],
    ['project x { viewport: (1,1); viewport: (2,2); }','DUPLICATE_PROPERTY'],
    ['project x { mystery y {} }','DECLARATION_INVALID'],
    ['project x { viewport: (1e999,1); fps:(24,1); }','NUMBER_INVALID'],
    ['project x { "__proto__": {}; }','UNSAFE_KEY'],
    ['project x { viewport: (1,1) }','PARSE_ERROR'],
    ['project x { value: `javascript`; }','LEX_ERROR'],
  ])('rejects invalid source with a location',(input,code)=>{
    const result=compileSource(input);expect(result.ok).toBe(false);if(!result.ok){expect(result.diagnostics.some(e=>e.code===code)).toBe(true);expect(result.diagnostics[0]!.range).toBeDefined();}
  });
});

describe('sequential morph and asset regression gates',()=>{
  it.each(['contour order','segment order','closure','segment count'])('rejects morph %s changes without geometric remapping',(change)=>{
    const d=document();
    for(const shape of d.shapes){const contour=shape.contours[0]!;contour.segments.push({...structuredClone(contour.segments[0]!),id:'second'});shape.contours.push({...structuredClone(contour),id:'other'});}
    expect(compile(d).ok).toBe(true);
    const shape=d.shapes[1]!;
    if(change==='contour order')shape.contours.reverse();
    else if(change==='segment order')shape.contours[0]!.segments.reverse();
    else if(change==='closure')shape.contours[0]!.closed=!shape.contours[0]!.closed;
    else shape.contours[0]!.segments.pop();
    expect(compile(d)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'MORPH_TOPOLOGY'})])});
  });
  it('advances the illustrated expression six frames within its pose dependencies',()=>{
    const before=unwrap(compileSource(shortSource,shortManifest)),serialized=serializeDocument(before.document);
    const shot=before.document.shots.find(s=>s.id==='keep')!,index=shot.morphs.findIndex(m=>m.id==='expression'),expression=shot.morphs[index]!;
    const patch=unwrap(applyPatch(before.document,{baseRevision:before.document.revision,operations:[{op:'updateProperty',collection:'shots',id:shot.id,path:['morphs',String(index),'start'],value:expression.start-6},{op:'updateProperty',collection:'shots',id:shot.id,path:['morphs',String(index),'end'],value:expression.end-6}]},shortManifest));
    const after=unwrap(compile(patch.document,shortManifest));expect(serializeDocument(before.document)).toBe(serialized);
    expect(patch.revision).toBe(before.document.revision+1);expect(patch.affectedIds).toEqual(['keep']);expect(after.duration).toBe(480);
    const changed:number[]=[];
    for(let frame=0;frame<480;frame++){
      const a=evaluate(before,{frame}),b=evaluate(after,{frame});
      for(let i=0;i<a.commands.length;i++)if(!['hero.mouth','hero.frontArm','hero.hand'].includes(a.commands[i]!.id))expect(b.commands[i]).toEqual(a.commands[i]);
      if(JSON.stringify(a)!==JSON.stringify(b))changed.push(frame);
      if(frame<342||frame>=408)expect(b).toEqual(a);
    }
    expect(changed.length).toBeGreaterThan(0);expect(changed[0]).toBe(342);expect(changed.at(-1)).toBe(407);
    expect(unwrap(deserializePlan(serializePlan(after)))).toEqual(after);
    expect(applyPatch(patch.document,{baseRevision:before.document.revision,operations:[{op:'removeNode',collection:'drawings',id:'eyesClosed'}]},shortManifest)).toMatchObject({ok:false,diagnostics:[{code:'REVISION_CONFLICT'}]});
  });
  it('orders nonoverlapping morphs by time and retains the last destination',()=>{
    const d=document(),shot=d.shots[1]!;
    shot.morphs.unshift({...shot.morphs[0]!,id:'return',from:'grin',to:'neutral',start:90,end:120});
    const p=unwrap(compile(d));
    expect(mouth(p,204).shape!.contours[0]!.segments[0]!.control1[1]).toBe(80);
    expect(mouth(p,249).shape!.contours[0]!.segments[0]!.control1[1]).toBe(60);
    expect(mouth(p,264).shape!.contours[0]!.segments[0]!.control1[1]).toBe(40);
    expect(mouth(p,336).shape!.contours[0]!.segments[0]!.control1[1]).toBe(40);
    shot.morphs[0]!.start=30;
    expect(compile(d)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'PROPERTY_CONFLICT'})])});
  });
  it('validates manifest identity and blocks edits to locked asset definitions',()=>{
    const d=document();d.assets.push({id:'font',kind:'font',version:1,src:'font.woff2',locked:true});
    const manifest=[{id:'font',kind:'font' as const,version:1,hash:'0'.repeat(64)}];
    expect(compile(d,[])).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'ASSET_UNRESOLVED'})])});
    expect(compile(d,manifest).ok).toBe(true);
    expect(applyPatch(d,{baseRevision:0,operations:[{op:'updateProperty',collection:'assets',id:'font',path:['src'],value:'other.woff2'}]},manifest)).toMatchObject({ok:false,diagnostics:[{code:'ASSET_LOCKED'}]});
    expect(d.assets[0]!.src).toBe('font.woff2');
  });
  it('supports addNode, insertKey and removeNode with candidate compilation',()=>{
    const d=document();
    const added=unwrap(applyPatch(d,{baseRevision:0,operations:[{op:'addNode',collection:'drawings',node:{id:'alternate',parts:{mouth:'happy'}}},{op:'insertKey',shot:'first',key:{id:'thirdX',target:'hero',property:'x',frame:130,value:600,easing:'linear',rotation:'direct',hold:1}}]}));
    expect(mouth(unwrap(compile(added.document)),143).matrix[4]).toBe(600);
    const removed=unwrap(applyPatch(added.document,{baseRevision:1,operations:[{op:'removeNode',collection:'drawings',id:'alternate'}]}));
    expect(removed.document.drawings.map(d=>d.id)).not.toContain('alternate');
    expect(d.revision).toBe(0);
  });
});

describe('JSON boundary safety',()=>{
  it('rejects sparse arrays and accessors without invoking user getters',()=>{
    const d=document();Reflect.deleteProperty(d.shapes[0]!.contours[0]!.start,'0');
    expect(compile(d)).toMatchObject({ok:false,diagnostics:[{code:'SCHEMA_INVALID'}]});
    let called=false;
    const accessor=Object.defineProperty(document(),'viewport',{enumerable:true,get(){called=true;return [1,1];}});
    expect(compile(accessor)).toMatchObject({ok:false,diagnostics:[{code:'SCHEMA_INVALID'}]});expect(called).toBe(false);
  });
  it('rejects IDs that would introduce unsafe dictionary keys',()=>{
    const d=document();d.actors[0]!.id='constructor';
    expect(compile(d).ok).toBe(false);
  });
});

describe('bounded compositing',()=>{
  it('clamps opacity overshoot from key and pose easing to the Canvas range',()=>{
    const d=document();d.shots[0]!.keys[0] = {...d.shots[0]!.keys[0]!,property:'opacity',value:0,easing:[0,2,1,2]};d.shots[0]!.keys[1] = {...d.shots[0]!.keys[1]!,property:'opacity',value:1};
    d.poses[0]!.parts.mouth!.transform={opacity:0.2};d.poses[1]!.parts.mouth!.transform={opacity:0.8};d.shots[1]!.morphs[0]!.easing=[0,2,1,2];
    const p=unwrap(compile(d));expect(mouth(p,60).opacity).toBe(1);expect(mouth(p,174).opacity).toBe(1);
  });
});

describe('v0.1 authoring extensions',()=>{
 const example=(body:string,shot='duration: 2s;')=>`project demo { viewport: (640,360); fps:(24,1); ${body} scene movie { shot intro { ${shot} } } }`;
 it.each([
  ['rect','size:(120,80);',4],['roundedRect','size:(120,80); radius:10;',8],['circle','radius:30;',4],['ellipse','radius:(30,20);',4],['line','from:(0,0); to:(90,60);',1],['polygon','points:[(0,0),(90,0),(45,60)];',3],['star','radius:30; innerRadius:15; count:5;',10],['path','data:"M0 0 L90 0 Q90 60 45 60 T0 0 Z";',3],['path','data:"M0 0 a30 20 0 0 1 60 0";',2]
 ])('normalizes %s with stable cubic topology',(kind,fields,segments)=>{const p=unwrap(compileSource(example(`shape g { primitive:${kind}; ${fields} } part p { shape:@g; } actor a { parts:[@p]; }`)));expect(p.duration).toBe(48);expect(p.document.shapes[0]!.contours[0]!.segments).toHaveLength(segments);expect(unwrap(compileSource(example(`shape g { primitive:${kind}; ${fields} } part p { shape:@g; } actor a { parts:[@p]; }`))).document).toEqual(p.document);});
 it('uses exact rational rounding for absolute seconds and milliseconds',()=>{const p=unwrap(compileSource(example('', 'duration: 1000ms;')));expect(p.duration).toBe(24);expect(unwrap(compileSource('project p { viewport:(1,1); fps:(30000,1001); scene s { shot a { duration:1.001s; } } }')).duration).toBe(30);expect(unwrap(compileSource(example('','duration:0.0625s;'))).duration).toBe(2);});
 it('resolves common anchors and offsets and rejects unused cycles and missing references',()=>{const p=unwrap(compileSource(example('shape g {primitive:circle; radius:10;} part p {shape:@g;} actor a { parts:[@p]; }','duration:2s; anchor start { at:250ms; } anchor beat { after:@start; offset:125ms; } key k { target:@a; property:x; frame:@beat; value:10; }')));expect(p.document.shots[0]!.keys[0]!.frame).toBe(9);for(const anchors of ['anchor x { after:@y; } anchor y { after:@x; }','anchor x { after:@absent; }','anchor x { at:3s; }'])expect(compileSource(example('',`duration:2s; ${anchors}`)).ok).toBe(false);});
 it('expands parameterized components, theme tokens and bounded repetitions',()=>{const p=unwrap(compileSource(example('const width { value:40; } theme colors { main:"#abcdef"; } component dot { params:{x:0;}; shape g { primitive:rect; size:(@width,20); } part p { shape:@g; material:{fill:@colors.main;}; } actor a { parts:[@p]; transform:{x:@x;}; } } repeat dots { count:3; instance dot { component:@dot; args:{x:@index;}; } }')));expect(p.document.actors.map(a=>a.transform.x)).toEqual([0,1,2]);expect(p.document.parts.every(p=>p.material.fill==='#abcdef')).toBe(true);expect(new Set(p.document.shapes.map(s=>s.id)).size).toBe(3);});
 it('rejects cyclic definitions before expanding and excessive counts',()=>{for(const body of ['const a { value:@b; } const b { value:@a; }','component a { instance b { component:@b; } } component b { instance a { component:@a; } }','repeat many { count:100000000; actor a { parts:[]; } }'])expect(compileSource(example(body)).ok).toBe(false);});
 it('evaluates analytic spring independently of seeking order and guards camera overshoot',()=>{const p=unwrap(compileSource(example('shape g {primitive:circle; radius:10;} part p {shape:@g;} actor a { parts:[@p]; }','duration:48f; key a {target:@a; property:x; frame:0f; value:0; easing:{type:spring; frequency:12; damping:0.7; velocity:0;};} key b {target:@a; property:x; frame:47f; value:100;}')));const frames=[47,25,0,12,25];const states=frames.map(frame=>evaluate(p,{frame}));expect(states[1]).toEqual(states[4]);expect(compileSource(example('','duration:48f; key a {target:camera; property:scaleX; frame:0f; value:1; easing:back-out;} key b {target:camera; property:scaleX; frame:47f; value:2;}')).ok).toBe(false);});
});

describe('compact temporal authoring',()=>{
  const source=(definitions:string,events:string)=>`project p {viewport:(100,100);fps:(24,1);
    shape dot {primitive:circle;radius:5;} part dot {shape:@dot;} actor a {parts:[@dot];}
    pose idle {parts:{dot:{transform:{x:0;};};};}
    pose raised {parts:{dot:{transform:{x:10;};};};}
    drawing closed {parts:{dot:@dot;};}
    ${definitions} scene scene {shot shot {duration:48f;${events}}}}`;
  it('lowers tracks exactly to expanded keys, preserving key IDs, units and seeking',()=>{
    const compact=source('',`anchor beat {at:12f;} track travel {target:@a;property:rotation;hold:2f;
      keys:[{id:start;frame:0f;value:0deg;easing:ease-in-out;},{id:end;frame:@beat;value:90deg;}];}`);
    const expanded=source('',`key travel_start {target:@a;property:rotation;hold:2f;frame:0f;value:0deg;easing:ease-in-out;}
      key travel_end {target:@a;property:rotation;hold:2f;frame:12f;value:90deg;}`);
    const p=unwrap(compileSource(compact)),q=unwrap(compileSource(expanded));expect(p).toEqual(q);
    expect(unwrap(compileSource(print(unwrap(parse(compact)))))).toEqual(p);
    for(const frame of [47,12,0,3,23,3])expect(evaluate(p,{frame})).toEqual(evaluate(q,{frame}));
  });
  it('reuses pose/drawing clips with offsets and instance-local anchors without capturing pose names',()=>{
    const definitions=`clip gesture {duration:12f;params:{actor:@a;};anchor touch {at:6f;}
      morph idle {actor:@actor;from:@idle;to:@raised;start:0f;end:@touch;}
      expose closed {actor:@actor;drawing:@closed;start:@touch;end:12f;}}`;
    const compact=source(definitions,`anchor entry {at:12f;} play first {clip:@gesture;start:@entry;duration:12f;}
      play second {clip:@gesture;start:30f;args:{actor:@a;};}`);
    const expanded=source('',`morph first_idle {actor:@a;from:@idle;to:@raised;start:12f;end:18f;}
      expose first_closed {actor:@a;drawing:@closed;start:18f;end:24f;}
      morph second_idle {actor:@a;from:@idle;to:@raised;start:30f;end:36f;}
      expose second_closed {actor:@a;drawing:@closed;start:36f;end:42f;}`);
    expect(unwrap(compileSource(compact))).toEqual(unwrap(compileSource(expanded)));
  });
  it('diagnoses compact key locations, incompatible writers, unused clip cycles and expansion limits',()=>{
    const broken=source('',`track travel {target:@absent;property:x;keys:[{frame:0f;value:0;}];}`);
    const result=compileSource(broken);expect(result.ok).toBe(false);
    if(!result.ok){const diagnostic=result.diagnostics.find(d=>d.code==='REFERENCE_MISSING');expect(diagnostic?.range?.start).toBe(broken.indexOf('@absent'));}
    expect(compileSource(source('', 'track t {target:@a;property:x;keys:[{id:first;id:second;frame:0f;value:0;}];}'))).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'TEMPORAL_INVALID'})]});
    for(const definitions of [
      'clip a {duration:1f;play b {clip:@b;start:0f;}} clip b {duration:1f;play a {clip:@a;start:0f;}}',
      'clip a {duration:1f;play missing {clip:@absent;start:0f;}}'
    ])expect(compileSource(source(definitions,''))).toMatchObject({ok:false});
    const clip='clip c {duration:12f;track t {target:@a;property:y;keys:[{frame:0f;value:0;},{frame:12f;value:1;}];}}';
    for(const play of ['play c {clip:@c;start:42f;}','play c {clip:@c;start:0f;duration:6f;}','play c {clip:@c;start:0f;args:{unknown:1;};}'])expect(compileSource(source(clip,play)).ok).toBe(false);
    expect(compileSource(source(clip,'play c {clip:@c;start:0f;} key clash {target:@a;property:y;frame:0f;value:3;}'))).toMatchObject({ok:false});
    const many=Array.from({length:20001},(_,i)=>`{frame:${i}f;value:0;}`).join(',');
    expect(compileSource(source('',`track many {target:@a;property:x;keys:[${many}];}`))).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'LIMIT_EXCEEDED'})]});
  });
  it('requires explicit module resolution, deduplicates canonical dependencies and retains imported locations',()=>{
    const entry='project p {viewport:(100,100);fps:(24,1);import art {src:"art.afx";}import again {src:"art.afx";}scene s {shot s {duration:1f;}}}';
    expect(compileSource(entry)).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'MODULE_RESOLVER_REQUIRED'})]});
    const options={sourceId:'/scene/main.afx',resolveModule:()=>({id:'/scene/art.afx',source:'module art {shape dot {primitive:circle;radius:5;}part p {shape:@dot;}actor a {parts:[@p];}}'})};
    expect(unwrap(compileSource(entry,[],options)).document.actors).toHaveLength(1);
    expect(compileSource(entry,[],{...options,resolveModule:()=>({id:'/scene/art.afx',source:'module art {part p {shape:@missing;}}'})})).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({range:expect.objectContaining({source:'/scene/art.afx',line:1})})])});
    expect(compileSource(entry,[],{...options,resolveModule:()=>({id:'/scene/main.afx',source:'module art {}'})})).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'MODULE_CYCLE'})]});
    expect(compileSource(entry,[],{...options,sourceBytes:entry.length+10})).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'LIMIT_EXCEEDED'})]});
    expect(compileSource(entry,[],{...options,resolveModule:()=>({id:'/scene/art.afx',source:'module art {'})})).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'PARSE_ERROR',range:expect.objectContaining({source:'/scene/art.afx'})})]});
    for (const source of ['project p {', 'project p { # }']) {
      const result = compileSource(source, [], { sourceId: '/scene/main.afx' });
      expect(result).toMatchObject({ok:false,diagnostics:[expect.objectContaining({range:expect.objectContaining({source:'/scene/main.afx'})})]});
    }
    expect(parse(entry, { sourceId: '/scene/main.afx', depth: 1 })).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'LIMIT_EXCEEDED',range:expect.objectContaining({source:'/scene/main.afx'})})]});
  });
  it('solves a bounded two-segment arm in either elbow direction and rejects unreachable goals',async()=>{
    const {twoSegmentArm}=await import('@aether-fx/core');
    for(const elbow of ['positive','negative'] as const){const p=twoSegmentArm([10,20],[60,60],[40,30],elbow);
      expect(10+40*Math.cos(p.upper)+30*Math.cos(p.upper+p.fore)).toBeCloseTo(60,10);
      expect(20+40*Math.sin(p.upper)+30*Math.sin(p.upper+p.fore)).toBeCloseTo(60,10);
      expect(Math.sign(p.fore)).toBe(elbow==='positive'?1:-1);
    }
    expect(()=>twoSegmentArm([0,0],[80,0],[40,30],'negative')).toThrow(/ARM_UNREACHABLE/);
    expect(()=>twoSegmentArm([0,0],[0,0],[40,30],'negative')).toThrow(/ARM_UNREACHABLE/);
    const rigWithParts=(parts:string)=>`project arm {viewport:(100,100);fps:(24,1);shape dot {primitive:circle;radius:1;}part upper {shape:@dot;}part fore {shape:@dot;parent:@upper;transform:{x:4;};}part hand {shape:@dot;parent:@fore;transform:{x:3;};}actor a {parts:[@upper,@fore,@hand];}pose pose {parts:${parts};arm solve {actor:@a;upper:@upper;fore:@fore;hand:@hand;lengths:(4,3);target:(5,0);elbow:negative;rotation:0deg;}}scene s {shot s {duration:1f;}}}`;
    expect(compileSource(rigWithParts('{}')).ok).toBe(true);
    const recipe = rigWithParts('{}')
      .replace('arm solve {actor:@a;upper:@upper;fore:@fore;hand:@hand;lengths:(4,3);target:(5,0);elbow:negative;rotation:0deg;}',
        'instance goal {component:@chain;args:{target:(5,0);};}')
      .replace('scene s {', 'component chain {params:{target:(4,0);};arm solve {actor:@a;upper:@upper;fore:@fore;hand:@hand;lengths:(4,3);target:@target;elbow:negative;rotation:0deg;}}scene s {');
    expect(unwrap(compileSource(recipe))).toEqual(unwrap(compileSource(rigWithParts('{}'))));
    for(const parts of ['{upper:null;}','{upper:0;}','{upper:{transform:null;};}','{upper:{transform:{rotation:0deg;};};}'])expect(compileSource(rigWithParts(parts)).ok).toBe(false);
    const rig=`project rig {viewport:(100,100);fps:(24,1);shape dot {primitive:circle;radius:1;}
      part upper {shape:@dot;}part fore {shape:@dot;parent:@upper;transform:{x:4;};}part hand {shape:@dot;parent:@fore;transform:{x:3;};}
      actor a {parts:[@upper,@fore,@hand];}
      pose pose {parts:{};arm arm {actor:@a;upper:@upper;fore:@fore;hand:@hand;lengths:(4,3);target:(5,0);elbow:negative;rotation:0deg;}}
      scene s {shot s {duration:1f;}}}`;
    expect(compileSource(rig).ok).toBe(true);
    for(const state of ['{transform:null;}','null','0','[]'])expect(compileSource(rig.replace('parts:{};',`parts:{upper:${state};};`)).ok).toBe(false);

  });
});

describe('safe diagnostic edits',()=>{
 it('repairs only an unequivocal semicolon and rejects stale/overlapping edits',async()=>{const {safeEdits,applySafeEdits,authorDiagnostics}=await import('@aether-fx/compiler');const source='project x { viewport:(1,1); fps:(24,1); scene s { shot a { duration:1f } } }';const edits=safeEdits(source);expect(edits).toHaveLength(1);const result=applySafeEdits(source,source,edits);expect(result.ok).toBe(true);if(result.ok)expect(compileSource(result.value).ok).toBe(true);expect(applySafeEdits(source+' ',source,edits).ok).toBe(false);expect(applySafeEdits(source,source,[...edits,...edits]).ok).toBe(false);const invalid=compileSource(source);if(!invalid.ok)expect(authorDiagnostics(source,invalid.diagnostics)[0]).toMatchObject({canonicalPath:'/source',edits});expect(safeEdits('project x {duration:2;}')).toEqual([]);});
});

describe('stagger and geometry boundary regressions',()=>{
 it('rounds each rational stagger once and supports offsets on shared anchors',()=>{const source='project p {viewport:(100,100);fps:(24,1);shape g {primitive:circle;radius:10;}part p {shape:@g;}actor a {parts:[@p];}scene s {shot a {duration:48f;anchor beat {at:0f;}repeat keys {count:3;stagger:62.5ms;key k {target:@a;property:x;frame:@beat;offset:1f;value:@index;}}}}}';const result=unwrap(compileSource(source));expect(result.document.shots[0]!.keys.map(k=>k.frame)).toEqual([1,3,4]);
    const tracked=source.replace('key k {target:@a;property:x;frame:@beat;offset:1f;value:@index;}', 'track k {target:@a;property:x;keys:[{frame:@beat;value:@index;}];}');
    expect(unwrap(compileSource(tracked)).document.shots[0]!.keys.map(k=>k.frame)).toEqual([0,2,3]);});
 it('rejects malformed SVG and rounds arcs into stable cubic subdivisions',()=>{for(const data of ['L0 0','M0 0 Z 4','M0 0 A20 20 0 2 1 40 0','M0 0 X20 20','M0 0 L1e999 0'])expect(compileSource(`project p {viewport:(100,100);fps:(24,1);shape g {primitive:path;data:${JSON.stringify(data)};}scene s {shot a {duration:1f;}}}`).ok).toBe(false);});
});

describe('public vector authoring',()=>{
  it('roundtrips solids, node handles, gradients, clips and contacts from source',async()=>{
    const source=`project authored {viewport:(320,240);fps:(24,1);
      solid block {kind:extrude;height:12;ring:[{id:a;point:(0,0);},{id:b;point:(40,0);},{id:c;point:(40,30);},{id:d;point:(0,30);}];materials:{top:"#eeeeee";light:"#aaaaaa";dark:"#555555";};}
      shape curve {contour outline {closed:false;node a {point:(0,0);out:(20,0);mode:mirrored;}node b {point:(50,30);in:(-15,0);out:(10,0);mode:aligned;}}}
      part hand {shape:@curve;anchors:{grip:(0,0);};clip:@curve;material:{fill:{type:linear;from:(0,0);to:(50,0);stops:[{offset:0;color:"#ffffff";},{offset:1;color:"#000000";}];};};}
      actor hero {parts:[@hand];}
      scene movie {shot move {duration:24f;contact bind {target:@block;anchor:@hero.hand;start:0f;end:12f;}key a {target:@hero;property:x;frame:0f;value:0;}key b {target:@hero;property:x;frame:12f;value:100;}}}
    }`;
    const p=unwrap(compileSource(source));
    expect(unwrap(compileSource(print(unwrap(parse(source)))))).toEqual(p);
    expect(unwrap(deserializePlan(serializePlan(p)))).toEqual(p);
    expect(p.document.actors.find(a=>a.id==='block')!.solid!.height).toBe(12);
    const stale=structuredClone(p.document);stale.actors.find(a=>a.id==='block')!.solid!.height=20;expect(validate(stale).map(d=>d.code)).toContain('SOLID_STALE');
    const expectedDraw=evaluate(p,{frame:0}),owned=evaluate(p,{frame:0}),hand=owned.commands.find(c=>c.id==='hero.hand')!;
    hand.shape!.contours[0]!.authoring!.nodes[0]!.point[0]=999;
    hand.clip!.contours[0]!.segments[0]!.control1[0]=999;
    if(typeof hand.material.fill==='object'&&hand.material.fill)hand.material.fill.stops[0]!.color='#ff0000';
    expect(evaluate(p,{frame:0})).toEqual(expectedDraw);
    const staleCurve=structuredClone(p.document);staleCurve.shapes.find(s=>s.id==='curve')!.contours[0]!.authoring!.nodes[0]!.point=[3,0];expect(validate(staleCurve).map(d=>d.code)).toContain('CURVE_STALE');
    const expected=Array.from({length:24},(_,frame)=>evaluate(p,{frame}));
    for(const frame of [23,0,12,11,1,13,7])expect(evaluate(p,{frame})).toEqual(expected[frame]);
    const object=(f:number)=>evaluate(p,{frame:f}).commands.find(c=>c.id==='block.block_top')!;
    expect(object(0).matrix[4]).toBe(0);expect(object(12).matrix[4]).toBe(100);expect(object(23).matrix[4]).toBe(100);
    expect(evaluate(p,{frame:0}).commands.find(c=>c.id==='hero.hand')!.clip).toBeDefined();
  });
  it('edits handles by node ID, preserves winding and rejects topology edits affecting morphs',async()=>{
    const {nodeContour,editContourNode,catmullRomContour,topologyMatches}=await import('@aether-fx/core');
    const nodes=[{id:'a',point:[0,0] as [number,number],out:[6,0] as [number,number],mode:'mirrored' as const},{id:'b',point:[20,20] as [number,number],in:[-4,0] as [number,number],out:[8,0] as [number,number],mode:'aligned' as const},{id:'c',point:[0,40] as [number,number]}];
    const c=nodeContour('outline',nodes,true),edited=editContourNode(c,'b',{point:[25,20],out:[0,8]});
    expect(edited.segments[0]!.control2).toEqual([25,16]);expect(edited.segments[1]!.control1).toEqual([25,28]);expect(topologyMatches({id:'a',contours:[c]},{id:'b',contours:[edited]})).toBe(true);
    expect(topologyMatches({id:'a',contours:[c]},{id:'b',contours:[nodeContour('outline',[...nodes].reverse(),true)]})).toBe(false);
    const d=document();d.shapes[0]!.contours=[c];d.shapes[1]!.contours=[nodeContour('outline',[...nodes,{id:'d',point:[-10,20]}],true)];
    expect(compile(d)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'MORPH_TOPOLOGY'})])});
    const repeats=catmullRomContour('line',[{id:'a',point:[0,0]},{id:'b',point:[0,0]},{id:'c',point:[10,10]},{id:'d',point:[10,10]}]);
    expect(repeats.segments[0]!.control1).toEqual([0,0]);expect(repeats.segments.every(s=>[...s.control1,...s.control2,...s.end].every(Number.isFinite))).toBe(true);
    const allSame=catmullRomContour('ring',[{id:'a',point:[1,1]},{id:'b',point:[1,1]},{id:'c',point:[1,1]}],true);expect(allSame.segments.every(s=>s.end[0]===1)).toBe(true);
    expect(()=>nodeContour('line',[{id:'a',point:[0,0]},{id:'a',point:[1,1]}])).toThrow('IDs');
    const corner=nodeContour('line',[{id:'a',point:[0,0],out:[8,0]},{id:'b',point:[20,0],out:[6,0]}]);
    expect(corner.segments[0]!.control2).toEqual([20,0]);
  });
  it('bounds cylinder error, accepts either winding, and diagnoses incompatible occlusion',async()=>{
    const {createSolid,orderProjectedFaces,orthographic}=await import('@aether-fx/core');
    const mat={fill:'#ffffff',stroke:null,strokeWidth:0,fillRule:'nonzero' as const},materials={top:mat,light:mat,dark:mat};
    const ring=[{id:'a',point:[0,0] as [number,number]},{id:'b',point:[20,0] as [number,number]},{id:'c',point:[20,20] as [number,number]},{id:'d',point:[0,20] as [number,number]}];
    const a=createSolid('one',{kind:'extrude',height:10,ring,materials});
    const b=createSolid('two',{kind:'extrude',height:20,ring:[...ring].reverse(),materials});expect(a.parts).toHaveLength(3);expect(b.parts).toHaveLength(3);
    expect(orderProjectedFaces(a.faces).diagnostics).toEqual([]);
    expect(createSolid('round',{kind:'cylinder',radius:50,height:20,steps:64,tolerance:.1,materials}).errorBound).toBeLessThanOrEqual(.1);
    expect(()=>createSolid('bad',{kind:'cylinder',radius:500,height:20,steps:8,tolerance:.001,materials})).toThrow('budget');
    expect(()=>createSolid('bad',{kind:'extrude',height:0,ring,materials})).toThrow('positive');
    expect(()=>createSolid('bad',{kind:'extrude',height:20,ring:[ring[0]!,ring[2]!,ring[1]!,ring[3]!],materials})).toThrow();
    expect(()=>orthographic({scale:Infinity})).toThrow();
    // Both planes project onto the same quad, but opposite slopes exchange front/back.
    const camera=orthographic(),v=camera.viewer;
    const front=a.faces.at(-1)!;
    const shifted={...front,id:'cross',vertices:front.vertices.map((p,i)=>p.map((n,j)=>n+v[j]!*(i<2?-12:12)) as [number,number,number])};
    expect(orderProjectedFaces([front,shifted]).diagnostics.map(d=>d.code)).toContain('OCCLUSION_SPLIT_REQUIRED');
    expect(orderProjectedFaces([front,{...front,id:'coplanar'}]).diagnostics[0]!.code).toBe('OCCLUSION_LAYER_REQUIRED');
  });
  it('rejects stale authoring, invalid gradients, contact gaps, singular transforms and writer conflicts',async()=>{
    const valid=`project demo {viewport:(100,100);fps:(24,1);shape s {primitive:circle;radius:5;}part p {shape:@s;}actor hand {parts:[@p];}actor lamp {parts:[@p];}scene s {shot s {duration:24f;contact bind {target:@lamp;anchor:@hand.p;start:4f;end:12f;}}}}`;
    const plan=unwrap(compileSource(valid)),d=structuredClone(plan.document);
    d.actors[0]!.transform.scaleX=0;expect(compile(d)).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'TRANSFORM_SINGULAR'})]});
    const gap=structuredClone(plan.document);gap.actors[1]!.transform.x=10;expect(compile(gap)).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'CONTACT_GAP'})]});
    const gradient=structuredClone(plan.document);gradient.parts[0]!.material.fill={type:'radial',from:[0,0],to:[0,0],stops:[{offset:0,color:'#ffffff'},{offset:1,color:'#000000'}]};expect(validate(gradient).map(d=>d.code)).toContain('MATERIAL_INVALID');
    const conflict=valid.replace('contact bind','key move {target:@lamp;property:x;frame:8f;value:20;}contact bind');expect(compileSource(conflict)).toMatchObject({ok:false,diagnostics:expect.arrayContaining([expect.objectContaining({code:'PROPERTY_CONFLICT'})])});
  });
});

describe('absolute contact and layer boundaries',()=>{
  it('keeps a rotated scaled bind/release pose with random seek and subsequent free motion',()=>{
    const s=`project contact {viewport:(300,200);fps:(24,1);shape dot {primitive:circle;radius:5;}part dot {shape:@dot;}
      actor hand {parts:[@dot];transform:{rotation:30deg;scaleX:2;scaleY:2;};}actor lamp {parts:[@dot];}
      scene s {shot first {duration:24f;contact grip {target:@lamp;anchor:@hand.dot;start:4f;end:12f;}
      key rotate0 {target:@hand;property:rotation;frame:0f;value:30deg;}key rotate1 {target:@hand;property:rotation;frame:12f;value:90deg;}
      key move0 {target:@lamp;property:x;frame:12f;value:0;}key move1 {target:@lamp;property:x;frame:23f;value:11;}
      key layer0 {target:@lamp;property:layer;frame:0f;value:0;}key layer1 {target:@lamp;property:layer;frame:12f;value:50;}
      }shot next {duration:2f;}}}`;
    const p=unwrap(compileSource(s)),matrix=(f:number)=>evaluate(p,{frame:f}).commands.find(c=>c.id==='lamp.dot')!;
    expect(matrix(3).matrix).toEqual(matrix(4).matrix);expect(matrix(11).layer).toBe(0);expect(matrix(12).layer).toBe(50);
    expect(matrix(12).matrix[0]).toBeCloseTo(Math.cos(40*Math.PI/180));
    expect(matrix(13).matrix[4]).toBeCloseTo(Math.cos(40*Math.PI/180));
    expect(matrix(13).matrix[5]).toBeCloseTo(Math.sin(40*Math.PI/180));
    expect(matrix(23).matrix).toEqual(matrix(24).matrix);
    const expected=Array.from({length:p.duration},(_,frame)=>evaluate(p,{frame}));
    for(let i=0;i<p.duration;i++)expect(evaluate(p,{frame:i*7%p.duration})).toEqual(expected[i*7%p.duration]);
  });
  it('diagnoses a zero scale between keys and a sheared contact, including interval ends',()=>{
    const s=`project c {viewport:(100,100);fps:(24,1);shape dot {primitive:circle;radius:5;}part dot {shape:@dot;}actor hand {parts:[@dot];}actor lamp {parts:[@dot];}scene s {shot s {duration:24f;contact c {target:@lamp;anchor:@hand.dot;start:0f;end:12f;}key a {target:@hand;property:scaleX;frame:0f;value:1;}key b {target:@hand;property:scaleX;frame:12f;value:-1;}}}}`;
    const r=compileSource(s);expect(r).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'TRANSFORM_SINGULAR',frame:6})]});
    expect(compileSource(s.replace('frame:0f;value:1;', 'frame:0f;value:0;'))).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'TRANSFORM_SINGULAR',frame:0})]});
    const shear=s.replace('actor hand {parts:[@dot];}','actor hand {parts:[@dot];transform:{scaleX:2;rotation:30deg;};}').replace('property:scaleX;frame:0f;value:1;','property:scaleX;frame:0f;value:2;').replace('property:scaleX;frame:12f;value:-1;','property:scaleX;frame:12f;value:3;');
    // A change in nonuniform scale relative to a rotated target requires a shear.
    const sheared=shear.replace('actor lamp {parts:[@dot];}','actor lamp {parts:[@dot];transform:{rotation:20deg;scaleX:2;};}');
    expect(compileSource(sheared)).toMatchObject({ok:false,diagnostics:[expect.objectContaining({code:'CONTACT_SHEAR'})]});
  });
});
