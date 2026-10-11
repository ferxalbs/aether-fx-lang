import { checkSchema } from './schema.js';
import { DEFAULT_LIMITS, diagnostic, IDENTITY } from './types.js';
import type { AssetManifest, Diagnostic, FxDocument, Limits, Property, Value } from './types.js';
import { createSolid } from './solids.js';
import { rebuildContour } from './authoring.js';
import { topologyMatches } from './geometry.js';
import { frameSeconds, mayOvershoot } from './time.js';

function authoringEqual(a:unknown,b:unknown):boolean {
  if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=1e-9+1e-12*Math.max(Math.abs(a),Math.abs(b));
  if(a===b)return true;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>authoringEqual(v,b[i]));
  if(a&&b&&typeof a==='object'&&typeof b==='object') {
    const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);
    return keys.length===Object.keys(y).length&&keys.every(k=>Object.hasOwn(y,k)&&authoringEqual(x[k],y[k]));
  }
  return false;
}
export function validProperty(property: Property, value: Value, kind: 'actor' | 'part' | 'camera'): boolean {
  if (property === 'shape') return kind === 'part' && typeof value === 'string';
  if (property === 'parent') return kind === 'actor' && (value === null || typeof value === 'string');
  if (property === 'visible') return kind !== 'camera' && typeof value === 'boolean';
  if (property === 'opacity') return kind !== 'camera' && typeof value === 'number' && value >= 0 && value <= 1;
  if (property === 'layer') return kind !== 'camera' && typeof value === 'number';
  return property in IDENTITY && typeof value === 'number' && Number.isFinite(value);
}
export function targetKind(document: FxDocument, target: string): 'actor' | 'part' | 'camera' | null {
  if (target === 'camera') return 'camera';
  const [actor, part, extra] = target.split('.');
  const instance = document.actors.find(a => a.id === actor);
  if (!instance || extra !== undefined) return null;
  return part === undefined ? 'actor' : instance.parts.includes(part) ? 'part' : null;
}
export function validate(input: unknown, manifestInput: unknown = [], options: Partial<Limits> = {}): Diagnostic[] {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const errors = [...checkSchema(input, 'document', limits.depth), ...checkSchema(manifestInput, 'manifest', limits.depth).map(e => ({...e,path:'/manifest'+(e.path??'')}))];
  if (errors.length) return errors;
  const d = input as FxDocument, manifest = manifestInput as AssetManifest;
  // Construct ownership indices only for failures; valid compilation does no extra walk.
  let paths: WeakMap<object,string> | undefined;
  function ownerPath(owner:object):string {
    if (!paths) {
      paths = new WeakMap();
      for (const [name,items] of Object.entries({assets:d.assets,shapes:d.shapes,parts:d.parts,poses:d.poses,drawings:d.drawings,actors:d.actors,backgrounds:d.backgrounds,shots:d.shots,manifest})) {
        items.forEach((item,index)=>paths!.set(item,`/${name}/${index}`));
      }
      d.shapes.forEach((shape,si)=>shape.contours.forEach((contour,ci)=>{
        paths!.set(contour,`/shapes/${si}/contours/${ci}`);
        contour.segments.forEach((segment,index)=>paths!.set(segment,`/shapes/${si}/contours/${ci}/segments/${index}`));
      }));
      d.shots.forEach((shot,si)=>{
        for (const name of ['keys','morphs','exposures'] as const) shot[name].forEach((item,index)=>paths!.set(item,`/shots/${si}/${name}/${index}`));
      });
    }
    return paths.get(owner)??'';
  }
  const fail = (code:string,message:string,owner?:{id:string},suffix='',context:{id?:string;frame?:number;interval?:[number,number]}={}) => errors.push(diagnostic(code,message,{...(owner?{id:owner.id}:{}),path:(owner?ownerPath(owner):'')+suffix,...context}));
  function unique(items: { id:string }[], label: string) {
    const seen = new Set<string>();
    for (const item of items) { if (seen.has(item.id)) fail('DUPLICATE_ID', `Duplicate ${label} ID`, item, '/id'); seen.add(item.id); }
  }
  for (const [name, items] of Object.entries({ assets: d.assets, shapes: d.shapes, parts: d.parts, poses: d.poses, drawings: d.drawings, actors: d.actors, backgrounds: d.backgrounds, shots: d.shots, manifest })) unique(items, name);
  for(const actor of d.actors)if(actor.id==='camera')fail('RESERVED_ID','Actor ID camera is reserved',actor,'/id');
  const shapes = new Map(d.shapes.map(s => [s.id, s]));
  const parts = new Map(d.parts.map(p => [p.id, p]));
  const actors = new Map(d.actors.map(a => [a.id, a]));
  const poses = new Map(d.poses.map(p => [p.id, p]));
  const drawings = new Map(d.drawings.map(p => [p.id, p]));
  const assets = new Map(d.assets.map(a => [a.id, a]));
  const resolved = new Map(manifest.map(a => [a.id, a]));
  let segmentCount = 0;
  for (const shape of d.shapes) {
    unique(shape.contours, `contour in ${shape.id}`);
    for (const contour of shape.contours) {
      if(contour.authoring)try {
        const rebuilt=rebuildContour(contour);
        if(!authoringEqual([rebuilt.start,rebuilt.segments],[contour.start,contour.segments]))fail('CURVE_STALE','Rebuild node controls after an authoring edit',shape);
      }catch(cause){fail('CURVE_INVALID',String(cause),shape);}
      unique(contour.segments, `segment in ${shape.id}.${contour.id}`); segmentCount += contour.segments.length; }
  }
  if (d.parts.length > limits.parts || segmentCount > limits.segments || d.viewport.some(n => n > limits.resolution)) fail('LIMIT_EXCEEDED', 'Geometry or resolution limit exceeded');
  const duration = d.shots.reduce((sum, s) => sum + s.duration, 0);
  if (!d.shots.length || !Number.isSafeInteger(duration) || duration > limits.duration) fail('LIMIT_EXCEEDED', 'Movie duration must be positive and within limits');
  const trackCount = d.shots.reduce((sum, s) => sum + s.keys.length + s.morphs.length + s.exposures.length + (s.contacts?.length??0), 0);
  if (trackCount > limits.tracks) fail('LIMIT_EXCEEDED', 'Track limit exceeded');
  for (const asset of d.assets) {
    const r = resolved.get(asset.id);
    if (!r || r.version !== asset.version || r.kind !== asset.kind) fail('ASSET_UNRESOLVED', 'Manifest must match asset ID, version and kind', asset);
    if (asset.kind === 'audio' && (!r?.duration || !r.sampleRate || !r.channels)) fail('ASSET_METADATA', 'Audio needs duration, sample rate and channels', asset);
    if (asset.kind === 'image' && (!r?.width || !r.height)) fail('ASSET_METADATA', 'Image needs dimensions', asset);
  }
  function assetKind(id: string, kind: string, owner: {id:string}, suffix:string) { if (assets.get(id)?.kind !== kind) fail('REFERENCE_MISSING', `Expected ${kind} asset ${id}`, owner, suffix); }
  for (const p of d.parts) {
    if (p.parent && !parts.has(p.parent)) fail('REFERENCE_MISSING', 'Unknown parent part', p, '/parent');
    if ([p.shape, p.text, p.image].filter(v => v !== null).length !== 1) fail('PART_CONTENT', 'Each part must have exactly one shape, text or image', p);
    if (p.clip && !shapes.has(p.clip)) fail('REFERENCE_MISSING','Unknown local clip shape',p,'/clip');
    const gradient=p.material.fill;
    if(gradient&&typeof gradient==='object') {
      if(gradient.stops.some((stop,i)=>i>0&&stop.offset<gradient.stops[i-1]!.offset))fail('MATERIAL_INVALID','Gradient stops must be ordered',p,'/material/fill/stops');
      if(gradient.type==='radial'&&(gradient.radius0===undefined||gradient.radius1===undefined||gradient.radius0>=gradient.radius1))fail('MATERIAL_INVALID','Radial gradient requires 0 <= radius0 < radius1',p,'/material/fill');
      if(gradient.type==='linear'&&(gradient.radius0!==undefined||gradient.radius1!==undefined||gradient.from.every((n,i)=>n===gradient.to[i])))fail('MATERIAL_INVALID','Linear gradient requires distinct endpoints and no radii',p,'/material/fill');
    }
    if (p.shape && !shapes.has(p.shape)) fail('REFERENCE_MISSING', 'Unknown shape', p, '/shape');
    if (p.text) assetKind(p.text.font, 'font', p, '/text/font');
    if (p.image) assetKind(p.image.asset, 'image', p, '/image/asset');
    const seen = new Set<string>([p.id]);
    let parent = p.parent;
    while (parent && parts.has(parent)) {
      if (seen.has(parent)) { fail('HIERARCHY_CYCLE', 'Part hierarchy contains a cycle', p); break; }
      seen.add(parent); parent = parts.get(parent)!.parent;
    }
    if (seen.size > limits.depth) fail('LIMIT_EXCEEDED', 'Part hierarchy exceeds depth limit', p);
  }
  for (const actor of d.actors) {
    if(actor.solid)try {
      const generated=createSolid(actor.id,actor.solid);
      for(const shape of generated.shapes)if(!authoringEqual(shapes.get(shape.id),shape))fail('SOLID_STALE','Regenerate solid geometry after a parameter edit',actor,'/solid');
      for(const part of generated.parts)if(!actor.parts.includes(part.id))fail('SOLID_STALE','Solid must retain generated face IDs',actor,'/solid');
    }catch(cause){fail((cause as {code?:string}).code??'SOLID_INVALID',String(cause),actor,'/solid');}
    if (!actor.parts.length || new Set(actor.parts).size !== actor.parts.length) fail('ACTOR_PARTS', 'Actor needs distinct parts', actor, '/parts');
    for (const [index,id] of actor.parts.entries()) {
      const part = parts.get(id);
      if (!part) fail('REFERENCE_MISSING', 'Unknown actor part', actor, `/parts/${index}`);
      else if (part.parent && !actor.parts.includes(part.parent)) fail('REFERENCE_MISSING', 'Actor must include ancestor parts', actor, `/parts/${index}`);
    }
    if (actor.parent && targetKind(d, actor.parent) !== 'part') fail('REFERENCE_MISSING', 'Actor parent must be an actor.part anchor', actor, '/parent');
  }
  for (const bg of d.backgrounds) if (!actors.has(bg.actor)) fail('REFERENCE_MISSING', 'Unknown background actor', bg, '/actor');
  if (new Set(d.backgrounds.map(b => b.actor)).size !== d.backgrounds.length) fail('BACKGROUND_DUPLICATE', 'Only one parallax rule per actor');
  for (const pose of d.poses) for (const [id, state] of Object.entries(pose.parts)) {
    if (!parts.has(id) || (state.shape && !shapes.has(state.shape))) fail('REFERENCE_MISSING', 'Pose refers to unknown part/shape', pose, `/parts/${id}`);
  }
  for (const drawing of d.drawings) for (const [id, shape] of Object.entries(drawing.parts)) {
    if (!parts.has(id) || !shapes.has(shape)) fail('REFERENCE_MISSING', 'Drawing refers to unknown part/shape', drawing, `/parts/${id}`);
  }
  const propertyCheck = (target: string, property: Property, value: Value, owner:{id:string}, valuePath:string, targetPath:string) => {
    const kind = targetKind(d, target);
    if (!kind) fail('REFERENCE_MISSING', `Unknown target ${target}`, owner, targetPath);
    else if (!validProperty(property, value, kind)) fail('PROPERTY_TYPE', `Invalid ${property} value for ${kind}`, owner, valuePath);
    if (property === 'shape' && typeof value === 'string' && !shapes.has(value)) fail('REFERENCE_MISSING', 'Unknown shape', owner, valuePath);
    if (property === 'parent' && typeof value === 'string' && targetKind(d, value) !== 'part') fail('REFERENCE_MISSING', 'Parent must be actor.part', owner, valuePath);
  };
  for (const shot of d.shots) {
    unique([...shot.keys, ...shot.morphs, ...shot.exposures, ...(shot.contacts??[])], `track in ${shot.id}`);
    const contacts=shot.contacts??[];
    if(contacts.length>16||contacts.length&&shot.duration>4096)fail('LIMIT_EXCEEDED','Contact audit budget: 16 constraints and 4096 frames per shot',shot);
    for(const contact of contacts) {
      if(targetKind(d,contact.target)!=='actor'||targetKind(d,contact.anchor)!=='part')fail('REFERENCE_MISSING','Contact target must be actor and anchor actor.part',shot,'/contacts');
      if(contact.start>=contact.end||contact.end>shot.duration)fail('FRAME_RANGE','Contact interval must be within shot',shot,'/contacts');
      if(contact.target===contact.anchor.split('.')[0]||contacts.some(c=>c.target===contact.anchor.split('.')[0]))fail('CONTACT_CHAIN','Contact anchors must belong to unconstrained actors; split a chained assembly into explicit relations',shot,'/contacts');
      if(d.actors.some(a=>a.id===contact.anchor.split('.')[0]&&a.parent?.split('.')[0]===contact.target))fail('HIERARCHY_CYCLE','Contact anchor cannot descend from its target',shot,'/contacts');
      if(contacts.some(c=>c!==contact&&c.target===contact.target&&c.start<contact.end&&contact.start<c.end))fail('PROPERTY_CONFLICT','Contact intervals for a target cannot overlap',shot,'/contacts');
      if(shot.keys.some(k=>k.target===contact.target&&k.property==='parent'))fail('PROPERTY_CONFLICT','Use contact bind/release without a concurrent parent track',shot,'/contacts');
      if(shot.keys.some(k=>k.target===contact.target&&['x','y','rotation','scaleX','scaleY'].includes(k.property)&&k.frame>contact.start&&k.frame<contact.end))fail('PROPERTY_CONFLICT','Contact owns target transform during its interval',shot,'/contacts');
    }
    const initial = new Set<string>();
    for (const [index,i] of shot.initial.entries()) for (const [p, value] of Object.entries(i.values)) {
      propertyCheck(i.target, p as Property, value, shot, `/initial/${index}/values/${p}`, `/initial/${index}/target`);
      const token = `${i.target}:${p}`;
      if (initial.has(token)) fail('PROPERTY_CONFLICT', 'Duplicate initial property', shot, `/initial/${index}/values/${p}`);
      initial.add(token);
    }
    const frames = new Set<string>();
    for (const key of shot.keys) {
      propertyCheck(key.target, key.property, key.value, key, '/value', '/target');
      if (key.frame >= shot.duration) fail('FRAME_RANGE', 'Key frame outside shot', key, '/frame', {frame:key.frame});
      const token = `${key.target}:${key.property}:${key.frame}`;
      if (frames.has(token)) fail('PROPERTY_CONFLICT', 'Multiple keys write the same property at the same frame', key);
      frames.add(token);
      if ((typeof key.value !== 'number'||key.property==='layer') && (key.easing !== 'linear' || key.rotation !== 'direct')) fail('DISCRETE_INTERPOLATION', 'Discrete properties cannot use easing/rotation interpolation', key);
      if (key.target === 'camera' && (key.property === 'scaleX' || key.property === 'scaleY') && mayOvershoot(key.easing)) fail('CAMERA_SCALE', 'Camera scale easing must not overshoot', key);
    }
    const writes: { target: string; property: string; start: number; end: number; owner:{id:string} }[] = [];
    for (const morph of shot.morphs) {
      const actor = actors.get(morph.actor), from = poses.get(morph.from), to = poses.get(morph.to);
      if (!actor || !from || !to) { fail('REFERENCE_MISSING', 'Morph actor/pose missing', morph); continue; }
      if (morph.start >= morph.end || morph.end > shot.duration) fail('FRAME_RANGE', 'Morph interval must be within shot', morph, '', {interval:[morph.start,morph.end]});
      const ids = new Set([...Object.keys(from.parts), ...Object.keys(to.parts)]);
      for (const id of ids) {
        if (!actor.parts.includes(id)) { fail('REFERENCE_MISSING', 'Pose part not in actor', morph); continue; }
        const a = from.parts[id] ?? {}, b = to.parts[id] ?? {};
        const fromShape = a.shape ? shapes.get(a.shape) : undefined, toShape = b.shape ? shapes.get(b.shape) : undefined;
        if (Boolean(a.shape) !== Boolean(b.shape) || (a.shape && b.shape && (!fromShape || !toShape || !topologyMatches(fromShape, toShape)))) fail('MORPH_TOPOLOGY', 'Morph requires explicit matching contour/segment IDs', morph);
        for (const prop of new Set([...Object.keys(a.transform ?? {}), ...Object.keys(b.transform ?? {})])) {
          if (!(prop in (a.transform ?? {})) || !(prop in (b.transform ?? {}))) fail('MORPH_CORRESPONDENCE', 'Both poses must explicitly define each interpolated property', morph);
          if (prop === 'visible') fail('MORPH_DISCRETE', 'Visibility must use discrete keys', morph);
          writes.push({ target: `${actor.id}.${id}`, property: prop, start: morph.start, end: morph.end, owner:morph });
        }
        if (a.shape) writes.push({ target: `${actor.id}.${id}`, property: 'shape', start: morph.start, end: morph.end, owner:morph });
        if (a.layer !== undefined || b.layer !== undefined) fail('MORPH_DISCRETE', 'Layer order must use discrete keys', morph);
      }
    }
    for (const exposure of shot.exposures) {
      const actor = actors.get(exposure.actor), drawing = drawings.get(exposure.drawing);
      if (!actor || !drawing) { fail('REFERENCE_MISSING', 'Exposure actor/drawing missing', exposure); continue; }
      if (exposure.start >= exposure.end || exposure.end > shot.duration) fail('FRAME_RANGE', 'Exposure interval must be within shot', exposure, '', {interval:[exposure.start,exposure.end]});
      for (const part of Object.keys(drawing.parts)) {
        if (!actor.parts.includes(part)) fail('REFERENCE_MISSING', 'Drawing part not in actor', exposure);
        writes.push({ target: `${actor.id}.${part}`, property: 'shape', start: exposure.start, end: exposure.end, owner:exposure });
      }
    }
    for (let i = 0; i < writes.length; i++) {
      const a = writes[i]!;
      for (const b of writes.slice(i + 1)) if (a.target === b.target && a.property === b.property && a.start < b.end && b.start < a.end) fail('PROPERTY_CONFLICT', 'Overlapping morph/exposure writers', b.owner);
      if (shot.keys.some(k => k.target === a.target && k.property === a.property)) fail('PROPERTY_CONFLICT', 'Key track conflicts with morph/exposure', a.owner);
    }
  }
  if (d.audio) {
    assetKind(d.audio.asset, 'audio', d, '/audio/asset');
    const r = resolved.get(d.audio.asset);
    if (d.audio.offset + d.audio.duration > duration || (r?.duration !== undefined && frameSeconds(d.audio.trimStart + d.audio.duration, d.fps) > r.duration + 1e-9)) fail('AUDIO_RANGE', 'Audio exceeds movie or source duration', d, '/audio', {id:d.audio.asset,interval:[d.audio.offset,d.audio.offset+d.audio.duration]});
  }
  return errors;
}
