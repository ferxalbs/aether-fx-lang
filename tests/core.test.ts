import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPatch, compile, deserializeDocument, deserializePlan, evaluate, frameTimestamp, serializeDocument, serializePlan, validate } from '@aether-fx/core';
import type { FxDocument, PlaybackPlan, Result } from '@aether-fx/core';
import { compileSource, normalize, parse, print } from '@aether-fx/compiler';
const source=readFileSync(new URL('../fixtures/curve.afx',import.meta.url),'utf8');
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
