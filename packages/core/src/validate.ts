import { checkSchema } from './schema.js';
import { DEFAULT_LIMITS, diagnostic, IDENTITY } from './types.js';
import type { AssetManifest, Diagnostic, FxDocument, Limits, Property, Value } from './types.js';
import { topologyMatches } from './geometry.js';
import { frameSeconds } from './time.js';

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
  const errors = [...checkSchema(input, 'document', limits.depth), ...checkSchema(manifestInput, 'manifest', limits.depth)];
  if (errors.length) return errors;
  const d = input as FxDocument, manifest = manifestInput as AssetManifest;
  const fail = (code: string, message: string, id?: string) => errors.push(diagnostic(code, message, id ? { id } : {}));
  function unique(items: { id: string }[], label: string) {
    const seen = new Set<string>();
    for (const item of items) { if (seen.has(item.id)) fail('DUPLICATE_ID', `Duplicate ${label} ID`, item.id); seen.add(item.id); }
  }
  for (const [name, items] of Object.entries({ assets: d.assets, shapes: d.shapes, parts: d.parts, poses: d.poses, drawings: d.drawings, actors: d.actors, backgrounds: d.backgrounds, shots: d.shots, manifest })) unique(items, name);
  if (d.actors.some(a => a.id === 'camera')) fail('RESERVED_ID', 'Actor ID camera is reserved');
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
    for (const contour of shape.contours) { unique(contour.segments, `segment in ${shape.id}.${contour.id}`); segmentCount += contour.segments.length; }
  }
  if (d.parts.length > limits.parts || segmentCount > limits.segments || d.viewport.some(n => n > limits.resolution)) fail('LIMIT_EXCEEDED', 'Geometry or resolution limit exceeded');
  const duration = d.shots.reduce((sum, s) => sum + s.duration, 0);
  if (!d.shots.length || !Number.isSafeInteger(duration) || duration > limits.duration) fail('LIMIT_EXCEEDED', 'Movie duration must be positive and within limits');
  const trackCount = d.shots.reduce((sum, s) => sum + s.keys.length + s.morphs.length + s.exposures.length, 0);
  if (trackCount > limits.tracks) fail('LIMIT_EXCEEDED', 'Track limit exceeded');
  for (const asset of d.assets) {
    const r = resolved.get(asset.id);
    if (!r || r.version !== asset.version || r.kind !== asset.kind) fail('ASSET_UNRESOLVED', 'Manifest must match asset ID, version and kind', asset.id);
    if (asset.kind === 'audio' && (!r?.duration || !r.sampleRate || !r.channels)) fail('ASSET_METADATA', 'Audio needs duration, sample rate and channels', asset.id);
    if (asset.kind === 'image' && (!r?.width || !r.height)) fail('ASSET_METADATA', 'Image needs dimensions', asset.id);
  }
  function assetKind(id: string, kind: string, owner: string) { if (assets.get(id)?.kind !== kind) fail('REFERENCE_MISSING', `Expected ${kind} asset ${id}`, owner); }
  for (const p of d.parts) {
    if (p.parent && !parts.has(p.parent)) fail('REFERENCE_MISSING', 'Unknown parent part', p.id);
    if ([p.shape, p.text, p.image].filter(v => v !== null).length !== 1) fail('PART_CONTENT', 'Each part must have exactly one shape, text or image', p.id);
    if (p.shape && !shapes.has(p.shape)) fail('REFERENCE_MISSING', 'Unknown shape', p.id);
    if (p.text) assetKind(p.text.font, 'font', p.id);
    if (p.image) assetKind(p.image.asset, 'image', p.id);
    const seen = new Set<string>([p.id]);
    let parent = p.parent;
    while (parent && parts.has(parent)) {
      if (seen.has(parent)) { fail('HIERARCHY_CYCLE', 'Part hierarchy contains a cycle', p.id); break; }
      seen.add(parent); parent = parts.get(parent)!.parent;
    }
    if (seen.size > limits.depth) fail('LIMIT_EXCEEDED', 'Part hierarchy exceeds depth limit', p.id);
  }
  for (const actor of d.actors) {
    if (!actor.parts.length || new Set(actor.parts).size !== actor.parts.length) fail('ACTOR_PARTS', 'Actor needs distinct parts', actor.id);
    for (const id of actor.parts) {
      const part = parts.get(id);
      if (!part) fail('REFERENCE_MISSING', 'Unknown actor part', actor.id);
      else if (part.parent && !actor.parts.includes(part.parent)) fail('REFERENCE_MISSING', 'Actor must include ancestor parts', actor.id);
    }
    if (actor.parent && targetKind(d, actor.parent) !== 'part') fail('REFERENCE_MISSING', 'Actor parent must be an actor.part anchor', actor.id);
  }
  for (const bg of d.backgrounds) if (!actors.has(bg.actor)) fail('REFERENCE_MISSING', 'Unknown background actor', bg.id);
  if (new Set(d.backgrounds.map(b => b.actor)).size !== d.backgrounds.length) fail('BACKGROUND_DUPLICATE', 'Only one parallax rule per actor');
  for (const pose of d.poses) for (const [id, state] of Object.entries(pose.parts)) {
    if (!parts.has(id) || (state.shape && !shapes.has(state.shape))) fail('REFERENCE_MISSING', 'Pose refers to unknown part/shape', pose.id);
  }
  for (const drawing of d.drawings) for (const [id, shape] of Object.entries(drawing.parts)) {
    if (!parts.has(id) || !shapes.has(shape)) fail('REFERENCE_MISSING', 'Drawing refers to unknown part/shape', drawing.id);
  }
  const propertyCheck = (target: string, property: Property, value: Value, id: string) => {
    const kind = targetKind(d, target);
    if (!kind) fail('REFERENCE_MISSING', `Unknown target ${target}`, id);
    else if (!validProperty(property, value, kind)) fail('PROPERTY_TYPE', `Invalid ${property} value for ${kind}`, id);
    if (property === 'shape' && typeof value === 'string' && !shapes.has(value)) fail('REFERENCE_MISSING', 'Unknown shape', id);
    if (property === 'parent' && typeof value === 'string' && targetKind(d, value) !== 'part') fail('REFERENCE_MISSING', 'Parent must be actor.part', id);
  };
  for (const shot of d.shots) {
    unique([...shot.keys, ...shot.morphs, ...shot.exposures], `track in ${shot.id}`);
    const initial = new Set<string>();
    for (const i of shot.initial) for (const [p, value] of Object.entries(i.values)) {
      propertyCheck(i.target, p as Property, value, shot.id);
      const token = `${i.target}:${p}`;
      if (initial.has(token)) fail('PROPERTY_CONFLICT', 'Duplicate initial property', shot.id);
      initial.add(token);
    }
    const frames = new Set<string>();
    for (const key of shot.keys) {
      propertyCheck(key.target, key.property, key.value, key.id);
      if (key.frame >= shot.duration) fail('FRAME_RANGE', 'Key frame outside shot', key.id);
      const token = `${key.target}:${key.property}:${key.frame}`;
      if (frames.has(token)) fail('PROPERTY_CONFLICT', 'Multiple keys write the same property at the same frame', key.id);
      frames.add(token);
      if (typeof key.value !== 'number' && (key.easing !== 'linear' || key.rotation !== 'direct')) fail('DISCRETE_INTERPOLATION', 'Discrete properties cannot use easing/rotation interpolation', key.id);
      if (key.target === 'camera' && (key.property === 'scaleX' || key.property === 'scaleY') && key.easing !== 'linear' && (key.easing[1] < 0 || key.easing[1] > 1 || key.easing[3] < 0 || key.easing[3] > 1)) fail('CAMERA_SCALE', 'Camera scale easing must not overshoot', key.id);
    }
    const writes: { target: string; property: string; start: number; end: number; id: string }[] = [];
    for (const morph of shot.morphs) {
      const actor = actors.get(morph.actor), from = poses.get(morph.from), to = poses.get(morph.to);
      if (!actor || !from || !to) { fail('REFERENCE_MISSING', 'Morph actor/pose missing', morph.id); continue; }
      if (morph.start >= morph.end || morph.end > shot.duration) fail('FRAME_RANGE', 'Morph interval must be within shot', morph.id);
      const ids = new Set([...Object.keys(from.parts), ...Object.keys(to.parts)]);
      for (const id of ids) {
        if (!actor.parts.includes(id)) { fail('REFERENCE_MISSING', 'Pose part not in actor', morph.id); continue; }
        const a = from.parts[id] ?? {}, b = to.parts[id] ?? {};
        const fromShape = a.shape ? shapes.get(a.shape) : undefined, toShape = b.shape ? shapes.get(b.shape) : undefined;
        if (Boolean(a.shape) !== Boolean(b.shape) || (a.shape && b.shape && (!fromShape || !toShape || !topologyMatches(fromShape, toShape)))) fail('MORPH_TOPOLOGY', 'Morph requires explicit matching contour/segment IDs', morph.id);
        for (const prop of new Set([...Object.keys(a.transform ?? {}), ...Object.keys(b.transform ?? {})])) {
          if (!(prop in (a.transform ?? {})) || !(prop in (b.transform ?? {}))) fail('MORPH_CORRESPONDENCE', 'Both poses must explicitly define each interpolated property', morph.id);
          if (prop === 'visible') fail('MORPH_DISCRETE', 'Visibility must use discrete keys', morph.id);
          writes.push({ target: `${actor.id}.${id}`, property: prop, start: morph.start, end: morph.end, id: morph.id });
        }
        if (a.shape) writes.push({ target: `${actor.id}.${id}`, property: 'shape', start: morph.start, end: morph.end, id: morph.id });
        if (a.layer !== undefined || b.layer !== undefined) fail('MORPH_DISCRETE', 'Layer order must use discrete keys', morph.id);
      }
    }
    for (const exposure of shot.exposures) {
      const actor = actors.get(exposure.actor), drawing = drawings.get(exposure.drawing);
      if (!actor || !drawing) { fail('REFERENCE_MISSING', 'Exposure actor/drawing missing', exposure.id); continue; }
      if (exposure.start >= exposure.end || exposure.end > shot.duration) fail('FRAME_RANGE', 'Exposure interval must be within shot', exposure.id);
      for (const part of Object.keys(drawing.parts)) {
        if (!actor.parts.includes(part)) fail('REFERENCE_MISSING', 'Drawing part not in actor', exposure.id);
        writes.push({ target: `${actor.id}.${part}`, property: 'shape', start: exposure.start, end: exposure.end, id: exposure.id });
      }
    }
    for (let i = 0; i < writes.length; i++) {
      const a = writes[i]!;
      for (const b of writes.slice(i + 1)) if (a.target === b.target && a.property === b.property && a.start < b.end && b.start < a.end) fail('PROPERTY_CONFLICT', 'Overlapping morph/exposure writers', b.id);
      if (shot.keys.some(k => k.target === a.target && k.property === a.property)) fail('PROPERTY_CONFLICT', 'Key track conflicts with morph/exposure', a.id);
    }
  }
  if (d.audio) {
    assetKind(d.audio.asset, 'audio', d.id);
    const r = resolved.get(d.audio.asset);
    if (d.audio.offset + d.audio.duration > duration || (r?.duration !== undefined && frameSeconds(d.audio.trimStart + d.audio.duration, d.fps) > r.duration + 1e-9)) fail('AUDIO_RANGE', 'Audio exceeds movie or source duration', d.audio.asset);
  }
  return errors;
}
