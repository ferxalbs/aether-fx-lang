import { IDENTITY } from './types.js';
import type { DrawList, FxDocument, Matrix, PlaybackPlan, Property, Shape, Shot, Snapshot, Transform, Value } from './types.js';
import { interpolateShape, multiply, transformMatrix } from './geometry.js';
import { contactState } from './contact.js';
import { ease } from './time.js';

/** Copy validated numeric geometry directly; preserve editable nodes and owned arrays. */
function ownedShape(shape: Shape): Shape {
  return { ...shape, contours: shape.contours.map(c => ({
    ...c, start: [...c.start],
    ...(c.authoring ? { authoring: { ...c.authoring, nodes: c.authoring.nodes.map(n => ({
      ...n, point: [...n.point], ...(n.in ? { in: [...n.in] } : {}), ...(n.out ? { out: [...n.out] } : {})
    })) } } : {}),
    segments: c.segments.map(s => ({ ...s, control1: [...s.control1], control2: [...s.control2], end: [...s.end] }))
  })) };
}
function ownedMaterial(material: import('./types.js').Material): import('./types.js').Material {
  const fill = material.fill;
  return { ...material, fill: fill && typeof fill === 'object' ? {
    ...fill, from: [...fill.from], to: [...fill.to], stops: fill.stops.map(stop => ({ ...stop }))
  } : fill };
}

export function initialSnapshot(d: FxDocument): Snapshot {
  const values: Snapshot['values'] = {}, shapes: Snapshot['shapes'] = {};
  for (const actor of d.actors) {
    values[actor.id] = {...actor.transform,layer:actor.layer,parent:actor.parent};
    for (const id of actor.parts) {
      const part = d.parts.find(p=>p.id===id)!;
      const target = `${actor.id}.${id}`;
      values[target] = {...part.transform,layer:part.layer,shape:part.shape};
    }
  }
  values['camera'] = {x:0,y:0,scaleX:1,scaleY:1,rotation:0};
  return {values,shapes};
}
export function shotSnapshot(base: Snapshot, shot: Shot): Snapshot {
  const snapshot = structuredClone(base);
  snapshot.values['camera'] = {...shot.camera};
  for (const initial of shot.initial) {
    Object.assign(snapshot.values[initial.target]!,initial.values);
    if (initial.values.shape !== undefined) delete snapshot.shapes[initial.target];
  }
  return snapshot;
}
function interpolate(a: Value,b: Value,t:number,shortest=false): Value {
  if (typeof a !== 'number' || typeof b !== 'number') return t < 1 ? a : b;
  const delta = shortest ? ((b-a+Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI)-Math.PI : b-a;
  return a+delta*t;
}
/** Values are fresh per call. Discrete exposures revert to the underlying drawing at end. */
function rawState(d:FxDocument,shot:Shot,snapshot:Snapshot,frame:number): Snapshot {
  const state = structuredClone(snapshot);
  const tracks = new Map<string, typeof shot.keys>();
  for (const key of shot.keys) {
    const token = `${key.target}:${key.property}`;
    const keys = tracks.get(token) ?? [];
    keys.push(key); tracks.set(token,keys);
  }
  for (const keys of tracks.values()) {
    keys.sort((a,b)=>a.frame-b.frame);
    let left = keys[0]!;
    if (frame < left.frame) continue;
    let right: typeof left | undefined;
    for (let i=1;i<keys.length;i++) {
      if (keys[i]!.frame > frame) { right=keys[i]; break; }
      left=keys[i]!;
    }
    const sampled = left.frame+Math.floor((frame-left.frame)/left.hold)*left.hold;
    const t = right ? ease((sampled-left.frame)/(right.frame-left.frame),left.easing) : 1;
    state.values[left.target]![left.property] = left.property==='layer' ? left.value : right ? interpolate(left.value,right.value,t,left.property==='rotation' && left.rotation==='shortest') : left.value;
    if (left.property==='shape') delete state.shapes[left.target];
  }
  for (const morph of [...shot.morphs].sort((a,b)=>a.start-b.start)) {
    if (frame < morph.start) continue;
    const t = ease(Math.min(1,(frame-morph.start)/(morph.end-morph.start)),morph.easing);
    const a = d.poses.find(p=>p.id===morph.from)!, b = d.poses.find(p=>p.id===morph.to)!;
    for (const id of new Set([...Object.keys(a.parts),...Object.keys(b.parts)])) {
      const from = a.parts[id] ?? {}, to = b.parts[id] ?? {};
      const target = `${morph.actor}.${id}`;
      for (const property of Object.keys(from.transform ?? {}) as (keyof Transform)[]) {
        state.values[target]![property] = interpolate(from.transform![property]!,to.transform![property]!,t);
      }
      if (from.shape && to.shape) {
        const source = d.shapes.find(s=>s.id===from.shape)!, destination = d.shapes.find(s=>s.id===to.shape)!;
        state.shapes[target] = interpolateShape(source,destination,t);
        state.values[target]!.shape = t===1 ? to.shape : from.shape;
      }
    }
  }
  for (const exposure of shot.exposures) if (frame >= exposure.start && frame < exposure.end) {
    const drawing = d.drawings.find(p=>p.id===exposure.drawing)!;
    for (const [id,shape] of Object.entries(drawing.parts)) { const target=`${exposure.actor}.${id}`; state.values[target]!.shape=shape; delete state.shapes[target]; }
  }
  // Cubic easing may overshoot geometry, but Canvas opacity is always bounded.
  for (const values of Object.values(state.values)) if (typeof values.opacity === 'number') values.opacity = Math.max(0, Math.min(1, values.opacity));
  return state;
}
export function evaluateState(d:FxDocument,shot:Shot,snapshot:Snapshot,frame:number): Snapshot {
  return shot.contacts?.length ? contactState(d,shot.contacts,t=>rawState(d,shot,snapshot,t),frame) : rawState(d,shot,snapshot,frame);
}
export function actorParentsValid(d:FxDocument,state:Snapshot,maxDepth:number): boolean {
  for (const actor of d.actors) {
    const seen = new Set<string>([actor.id]);
    let parent = state.values[actor.id]!.parent;
    while (typeof parent === 'string') {
      const owner = parent.split('.')[0]!;
      if (seen.has(owner) || seen.size > maxDepth) return false;
      seen.add(owner); parent = state.values[owner]?.parent;
    }
  }
  return true;
}
function inverse(m:Matrix): Matrix {
  const determinant=m[0]*m[3]-m[1]*m[2];
  if (determinant===0) throw new RangeError('Camera transform is singular');
  return [m[3]/determinant,-m[1]/determinant,-m[2]/determinant,m[0]/determinant,(m[2]*m[5]-m[3]*m[4])/determinant,(m[1]*m[4]-m[0]*m[5])/determinant];
}
export function evaluate(plan:PlaybackPlan,options:{frame:number}): DrawList {
  const frame=options.frame;
  if (!Number.isSafeInteger(frame) || frame<0 || frame>=plan.duration) throw new RangeError(`Frame must be in [0, ${plan.duration})`);
  const item = plan.shots.find(s=>frame>=s.start && frame<s.start+s.shot.duration)!;
  const d=plan.document, state=evaluateState(d,item.shot,item.snapshot,frame-item.start);
  const parts=new Map(d.parts.map(p=>[p.id,p])), actors=new Map(d.actors.map(a=>[a.id,a]));
  const matrices=new Map<string,{matrix:Matrix;opacity:number;visible:boolean}>();
  function world(target:string): {matrix:Matrix;opacity:number;visible:boolean} {
    const cached=matrices.get(target); if (cached) return cached;
    const [actorId,partId]=target.split('.');
    const actor=actors.get(actorId!)!;
    const part=partId ? parts.get(partId)! : null;
    const values=state.values[target]!;
    const t={...IDENTITY,...values} as Transform;
    const parent=part ? (part.parent ? `${actorId}.${part.parent}` : actorId!) : values.parent as string|null;
    const ancestor=parent ? world(parent) : {matrix:[1,0,0,1,0,0] as Matrix,opacity:1,visible:true};
    const result={matrix:multiply(ancestor.matrix,transformMatrix(t,part?.pivot)),opacity:ancestor.opacity*t.opacity,visible:ancestor.visible&&t.visible};
    matrices.set(target,result); return result;
  }
  const camera=state.values['camera']! as unknown as Transform;
  const commands:DrawList['commands']=[];
  for (const actor of d.actors) for (const id of actor.parts) {
    const part=parts.get(id)!, target=`${actor.id}.${id}`, w=world(target), v=state.values[target]!;
    if (!w.visible || w.opacity<=0) continue;
    const parallax=d.backgrounds.find(b=>b.actor===actor.id)?.parallax ?? 1;
    const cameraMatrix=inverse(transformMatrix({...camera,x:camera.x*parallax,y:camera.y*parallax}));
    const shape=state.shapes[target] ?? d.shapes.find(s=>s.id===v.shape) ?? null;
    commands.push({...(part.clip ? {clip:ownedShape(d.shapes.find(s=>s.id===part.clip)!)} : {}),id:target,matrix:multiply(cameraMatrix,w.matrix),opacity:w.opacity,layer:(state.values[actor.id]!.layer as number)+(v.layer as number),shape:shape ? ownedShape(shape) : null,material:ownedMaterial(part.material),text:part.text ? {...part.text} : null,image:part.image ? {...part.image} : null});
  }
  commands.sort((a,b)=>a.layer-b.layer);
  return {frame,shot:item.shot.id,viewport:[...d.viewport],commands};
}
