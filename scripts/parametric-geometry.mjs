// Compatibility adapter for the historical offline fixture. Geometry is authored by the public core API.
import { createSolid, orthographic } from '@aether-fx/core';
const settings = new WeakMap();
export function projection(options = {}) {
  const camera = orthographic(options); settings.set(camera, structuredClone(options)); return camera;
}
function legacySolid(parameters, camera, kind) {
  const { id, palette, ...dimensions } = parameters;
  if (!palette || !['top', 'light', 'dark'].every(role => /^#[0-9a-f]{6}$/i.test(palette[role]))) throw new RangeError('Expected top/light/dark RGB palette');
  const materials = Object.fromEntries(Object.entries(palette).map(([role, fill]) => [role, { fill, stroke: null, strokeWidth: 0, fillRule: 'nonzero' }]));
  const recipe = { kind, ...dimensions, materials, projection: settings.get(camera) };
  if (kind === 'extrude') {
    recipe.ring = parameters.ring.map(v => ({ id: v.id, point: v.position }));
    const area = recipe.ring.reduce((s, v, i) => { const next = recipe.ring[(i + 1) % recipe.ring.length].point; return s + v.point[0] * next[1] - v.point[1] * next[0]; }, 0);
    if (area <= 0) throw new RangeError('Expected strictly convex counterclockwise ring');
  }
  let solid;
  try { solid = createSolid(id, recipe); } catch (cause) { throw new RangeError('Expected convex geometry within the dimension/segment budget: ' + cause.message); }
  const faces = solid.faces.map(f => {
    const top = f.id === id + '_top', sideId = f.id.slice((id + '_side_').length);
    const index = kind === 'extrude' ? parameters.ring.findIndex(v => v.id === sideId) : Number(sideId.slice(1));
    const nextId = kind === 'extrude' ? parameters.ring[(index + 1) % parameters.ring.length]?.id : 'v' + ((index + 1) % solid.faces.at(-1).vertices.length);
    const landmarkIds = top ? (kind === 'extrude' ? parameters.ring.map(v => v.id) : f.vertices.map((_, i) => 'v' + i)) : [sideId + '_bottom', nextId + '_bottom', nextId + '_top', sideId + '_top'];
    const vertices = f.vertices.map((position, i) => ({ id: landmarkIds[i], position }));
    const shape = structuredClone(f.shape); shape.contours[0].segments.forEach((s, i) => { s.id = vertices[i].id; });
    let normal = [0, 0, 1], role;
    if (!top) { const a = f.vertices[0], b = f.vertices[1], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy); normal = [dy / length, -dx / length, 0]; role = normal[0] * -0.6 + normal[1] * 0.8 > 0 ? 'light' : 'dark'; }
    return { id: f.id, shape, normal, vertices, ...(role ? { role } : {}), fill: palette[role ?? 'top'] };
  });
  return { id, parameters: structuredClone(parameters), faces, topology: faces.map(f => [f.id, f.shape.contours[0].segments.map(s => s.id)]), ...(kind === 'cylinder' ? { approximation: { steps: faces.at(-1).vertices.length, projectedErrorBound: solid.errorBound } } : {}) };
}
export function extrude(parameters, camera) {
  const solid = legacySolid(parameters, camera, 'extrude'); delete solid.parameters.id;
  return solid;
}
export function cylinder(parameters, camera) {
  const solid = legacySolid(parameters, camera, 'cylinder'); delete solid.parameters.id;
  solid.parameters = { center: parameters.center ?? [0, 0], radius: parameters.radius, z: parameters.z ?? 0, height: parameters.height, palette: parameters.palette, tolerance: parameters.tolerance ?? 0.5, steps: solid.approximation.steps };
  solid.paintGroups = ['light', 'dark'].flatMap(role => {
    const faces = solid.faces.filter(f => f.role === role); if (!faces.length) return [];
    const id = solid.id + '_sides_' + role;
    return [{ id, fill: parameters.palette[role], shape: { id: id + '_shape', contours: faces.map(f => ({ ...structuredClone(f.shape.contours[0]), id: f.id })) } }];
  });
  return solid;
}
