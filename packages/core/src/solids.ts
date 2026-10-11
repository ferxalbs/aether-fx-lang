import { IDENTITY } from './types.js';
import type { Actor, Diagnostic, Material, Part, Shape, Vec2 } from './types.js';
import { diagnostic } from './types.js';
import { authorPoint } from './authoring.js';
export type Vec3 = [number, number, number];
export interface ProjectionOptions { preset?: 'isometric'; origin?: Vec2; scale?: number; azimuth?: number; elevation?: number }
export interface SolidRecipe {
  kind: 'extrude' | 'cylinder'; height: number; z?: number; ring?: { id: string; point: Vec2 }[];
  radius?: number; center?: Vec2; steps?: number; tolerance?: number; projection?: ProjectionOptions;
  materials: { top: Material; light: Material; dark: Material }; anchors?: Record<string, Vec3>; pivot?: Vec2;
}
export interface ProjectedFace { id: string; vertices: Vec3[]; shape: Shape; material: Material }
const finite = (n: number) => { if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw new RangeError('Coordinates/dimensions must be finite and at most 1000000'); return n; };
const positive = (n: number) => { finite(n); if (n <= 0) throw new RangeError('Dimension must be positive'); return n; };
/** Angles in radians; xyz right handed, z up. No rounding of projected coordinates. */
export function orthographic(options: ProjectionOptions = {}) {
  const { origin = [0, 0], scale = 1, azimuth = Math.PI / 4, elevation = Math.atan(1 / Math.sqrt(2)) } = options;
  authorPoint(origin); positive(scale); finite(azimuth); finite(elevation);
  if (options.preset && options.preset !== 'isometric') throw new RangeError('Unknown projection preset');
  if (elevation <= 0 || elevation >= Math.PI / 2) throw new RangeError('Elevation must be strictly between 0 and pi/2');
  const ca=Math.cos(azimuth),sa=Math.sin(azimuth),ce=Math.cos(elevation),se=Math.sin(elevation);
  const viewer: Vec3 = [Math.sin(azimuth) * Math.cos(elevation), Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation)];
  const dot = (a: Vec3, b: Vec3) => a.reduce((sum, n, i) => sum + n * b[i]!, 0);
  const point = (p: Vec3): Vec2 => { if (p.length !== 3) throw new RangeError('Expected xyz point'); p.forEach(finite); return [origin[0] + scale * (ca*p[0]-sa*p[1]), origin[1] + scale * (se*(sa*p[0]+ca*p[1])-ce*p[2])]; };
  return { point, depth: (p: Vec3) => dot(p, viewer), viewer, scale };
}
function polygonShape(id: string, points: Vec2[], ids: string[]): Shape {
  return { id, contours: [{ id: 'outline', start: points[0]!, closed: true, segments: points.map((p, i) => {
    const end = points[(i + 1) % points.length]!;
    return { id: ids[i]!, control1: [p[0] + (end[0] - p[0]) / 3, p[1] + (end[1] - p[1]) / 3], control2: [p[0] + (end[0] - p[0]) * 2 / 3, p[1] + (end[1] - p[1]) * 2 / 3], end };
  }) }] };
}
/** One convex prism: visible faces have disjoint interiors, so sides then cap is a valid painter order. */
export function createSolid(id: string, recipe: SolidRecipe): { actor: Actor; shapes: Shape[]; parts: Part[]; faces: ProjectedFace[]; errorBound: number } {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,27}$/.test(id)) throw new RangeError('Solid ID must be an identifier of at most 28 characters');
  const camera = orthographic(recipe.projection), height = positive(recipe.height), z = finite(recipe.z ?? 0);
  finite(z + height);
  if (!['extrude', 'cylinder'].includes(recipe.kind)) throw new RangeError('Unknown solid kind');
  let ring = recipe.ring, errorBound = 0;
  if (recipe.kind === 'cylinder') {
    if (ring) throw new RangeError('Cylinder cannot specify a ring');
    const radius = positive(recipe.radius!), center = authorPoint(recipe.center ?? [0, 0]), tolerance = positive(recipe.tolerance ?? 0.5);
    const needed = Math.max(8, Math.ceil(Math.PI / Math.acos(1 - Math.min(1, tolerance / (radius * camera.scale)))));
    const steps = recipe.steps ?? needed;
    if (!Number.isInteger(steps) || steps < needed || steps > 256) throw new RangeError('Cylinder tolerance requires more segments than the 256/supplied steps budget');
    ring = Array.from({ length: steps }, (_, i) => ({ id: 'v' + i, point: [center[0] + radius * Math.cos(i * 2 * Math.PI / steps), center[1] + radius * Math.sin(i * 2 * Math.PI / steps)] as Vec2 }));
    errorBound = radius * camera.scale * (1 - Math.cos(Math.PI / steps));
  } else if (recipe.radius !== undefined || recipe.steps !== undefined || recipe.center !== undefined || recipe.tolerance !== undefined) throw new RangeError('Extrusion accepts ring, z and height; cylinder-only parameters are invalid');
  if (!ring || ring.length < 3 || ring.length > 256) throw new RangeError('Extrusion needs 3..256 vertices');
  const seen = new Set<string>();
  for (const v of ring) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(v.id) || seen.has(v.id)) throw new RangeError('Vertex IDs must be distinct identifiers of at most 20 characters');
    seen.add(v.id); authorPoint(v.point).forEach(finite);
  }
  // Validate every edge against all vertices, not just consecutive turns (which miss star polygons).
  let winding = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!.point, b = ring[(i + 1) % ring.length]!.point;
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (!length) throw new RangeError('Degenerate extrusion edge');
    for (let j = 0; j < ring.length; j++) if (j !== i && j !== (i + 1) % ring.length) {
      const c = ring[j]!.point, cross = dx * (c[1] - a[1]) - dy * (c[0] - a[0]);
      if (Math.abs(cross) <= 1e-10 * length * Math.max(1, Math.hypot(c[0] - a[0], c[1] - a[1]))) throw new RangeError('Degenerate/collinear extrusion vertex');
      const sign = Math.sign(cross);
      if (winding && sign !== winding) throw Object.assign(new RangeError('OCCLUSION_SPLIT_REQUIRED: use convex pieces and explicit layers for concave/crossing contours'), { code: 'OCCLUSION_SPLIT_REQUIRED' });
      winding = sign;
    }
  }
  const faces: ProjectedFace[] = [], roles: ('light' | 'dark')[] = [], visible: boolean[] = [];
  const make = (faceId: string, vertices: Vec3[], ids: string[], material: Material) => {
    const shape = polygonShape(faceId + '_shape', vertices.map(camera.point), ids);
    faces.push({ id: faceId, vertices, shape, material: structuredClone(material) });
  };
  ring.forEach((v, i) => {
    const b = ring![(i + 1) % ring!.length]!, dx = b.point[0] - v.point[0], dy = b.point[1] - v.point[1];
    const normal: Vec3 = [winding * dy, -winding * dx, 0];
    visible[i] = normal[0] * camera.viewer[0] + normal[1] * camera.viewer[1] > 1e-10 * Math.hypot(dx, dy);
    const role = normal[0] * -0.6 + normal[1] * 0.8 >= 0 ? 'light' : 'dark'; roles[i] = role;
    if (visible[i]) make(id + '_side_' + v.id, [[...v.point, z], [...b.point, z], [...b.point, z + height], [...v.point, z + height]], ['a', 'b', 'c', 'd'], recipe.materials[role]);
  });
  make(id + '_top', ring.map(v => [...v.point, z + height] as Vec3), ring.map(v => v.id), recipe.materials.top);
  const shapes = faces.map(f => f.shape), parts: Part[] = faces.map((f, i) => ({ id: f.id, parent: null, pivot: recipe.pivot ?? [0, 0], transform: { ...IDENTITY }, layer: i / Math.max(1, faces.length - 1), shape: f.shape.id, material: structuredClone(f.material), text: null, image: null }));
  // Adjacent cylinder facets of one material are painted as a single boundary, eliminating shared-edge leaks.
  if (recipe.kind === 'cylinder') {
    let run: number[] = [], group = 0;
    const flush = () => {
      if (!run.length) return;
      const indices = [...run, (run.at(-1)! + 1) % ring!.length], role = roles[run[0]!]!;
      const points = [...indices.map(i => camera.point([...ring![i]!.point, z])), ...[...indices].reverse().map(i => camera.point([...ring![i]!.point, z + height]))];
      const shape = polygonShape(id + '_band_' + group + '_shape', points, points.map((_, i) => 's' + i)); shapes.push(shape);
      for (const i of run) parts.find(p => p.id === id + '_side_' + ring![i]!.id)!.material.fill = null;
      parts.push({ id: id + '_band_' + group++, parent: null, pivot: recipe.pivot ?? [0, 0], transform: { ...IDENTITY }, layer: -0.1, shape: shape.id, material: structuredClone(recipe.materials[role]), text: null, image: null });
      run = [];
    };
    // Start on the hidden half so a visible run never wraps the array boundary.
    const start = visible.findIndex(v => !v);
    for (let j = 1; j <= ring.length; j++) { const i = (start + j) % ring.length; if (!visible[i] || (run.length && roles[i] !== roles[run[0]!])) flush(); if (visible[i]) run.push(i); }
    flush();
  }
  const anchors: Record<string, Vec2> = {};
  for (const [name, point] of Object.entries(recipe.anchors ?? {})) anchors[name] = camera.point(point);
  if (Object.keys(anchors).length) parts.find(p => p.id === id + '_top')!.anchors = anchors;
  return { actor: { id, parts: parts.map(p => p.id), transform: { ...IDENTITY }, parent: null, layer: 0, solid: structuredClone(recipe) }, parts, shapes, faces, errorBound };
}

/** Convex face intersection in projected space, with depth tested over the entire overlap. */
export function orderProjectedFaces(faces: ProjectedFace[], projection: ProjectionOptions = {}): { order: string[]; diagnostics: Diagnostic[] } {
  if (faces.length > 256) throw new RangeError('Occlusion audit budget is 256 faces');
  const camera = orthographic(projection), errors: Diagnostic[] = [], edges = faces.map(() => new Set<number>());
  const cross = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const projected = faces.map(f => f.vertices.map(camera.point));
  function intersection(subject: Vec2[], clip: Vec2[]): Vec2[] {
    const sign = Math.sign(clip.reduce((s, p, i) => s + cross([0, 0], p, clip[(i + 1) % clip.length]!), 0));
    let result = subject;
    for (let i = 0; i < clip.length && result.length; i++) {
      const a = clip[i]!, b = clip[(i + 1) % clip.length]!, input = result; result = [];
      input.forEach((p, j) => { const q = input[(j + 1) % input.length]!, dp = cross(a, b, p) * sign, dq = cross(a, b, q) * sign; if (dp >= -1e-8) result.push(p); if ((dp < 0) !== (dq < 0)) { const t = dp / (dp - dq); result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } });
    }
    return result;
  }
  function depth(index: number, p: Vec2): number {
    const points = projected[index]!, vertices = faces[index]!.vertices, a = points[0]!, b = points[1]!;
    const k = points.findIndex((c, i) => i > 1 && Math.abs(cross(a, b, c)) > 1e-8);
    if (k < 0) throw new RangeError('Degenerate projected face');
    const c = points[k]!, denominator = cross(a, b, c), u = cross(a, p, c) / denominator, v = cross(a, b, p) / denominator;
    return camera.depth(vertices[0]!) * (1 - u - v) + camera.depth(vertices[1]!) * u + camera.depth(vertices[k]!) * v;
  }
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const overlap = intersection(projected[i]!, projected[j]!);
    if (overlap.length < 3 || Math.abs(overlap.reduce((s, p, k) => s + cross([0, 0], p, overlap[(k + 1) % overlap.length]!), 0)) < 1e-8) continue;
    const delta = overlap.map(p => depth(i, p) - depth(j, p)), low = Math.min(...delta), high = Math.max(...delta);
    if (low < -1e-7 && high > 1e-7) errors.push(diagnostic('OCCLUSION_SPLIT_REQUIRED', `Faces ${faces[i]!.id} and ${faces[j]!.id} exchange depth inside their overlap; split the pieces`, { id: faces[i]!.id }));
    else if (high > 1e-7) edges[j]!.add(i);
    else if (low < -1e-7) edges[i]!.add(j);
    else errors.push(diagnostic('OCCLUSION_LAYER_REQUIRED', 'Coplanar overlapping faces require an explicit layer', { id: faces[i]!.id }));
  }
  const remaining = new Set(faces.map((_, i) => i)), order: string[] = [];
  while (remaining.size) {
    const next = [...remaining].find(i => ![...remaining].some(j => edges[j]!.has(i)));
    if (next === undefined) { errors.push(diagnostic('OCCLUSION_SPLIT_REQUIRED', 'Painter order contains a cycle; split pieces or define separate drawing layers')); break; }
    remaining.delete(next); order.push(faces[next]!.id);
  }
  return { order, diagnostics: errors };
}
