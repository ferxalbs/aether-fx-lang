// Offline authoring only: projected solids reduce to canonical cubic Shapes.
const finite = (n, name) => { if (!Number.isFinite(n)) throw new RangeError(`${name} must be finite`); return n; };
const positive = (n, name) => { finite(n, name); if (n <= 0) throw new RangeError(`${name} must be positive`); return n; };
export function projection({ origin = [0, 0], scale = 1, azimuth = Math.PI / 4, elevation = Math.atan(1 / Math.sqrt(2)) } = {}) {
  positive(scale, 'scale'); finite(azimuth, 'azimuth'); finite(elevation, 'elevation');
  if (elevation <= 0 || elevation >= Math.PI / 2) throw new RangeError('elevation must be between 0 and pi/2');
  if (!Array.isArray(origin) || origin.length !== 2) throw new RangeError('origin must be a point');
  origin.forEach(n => finite(n, 'origin'));
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth), ce = Math.cos(elevation), se = Math.sin(elevation);
  const point = ([x, y, z]) => {
    [x, y, z].forEach(n => finite(n, 'coordinate'));
    return [origin[0] + scale * (ca * x - sa * y), origin[1] + scale * (se * (sa * x + ca * y) - ce * z)];
  };
  return { point, depth: ([x, y, z]) => ce * (sa * x + ca * y) + se * z, viewer: [ce * sa, ce * ca, se], scale };
}
function shapeOf(id, vertices, camera) {
  const points = vertices.map(v => camera.point(v.position));
  return { id, contours: [{ id: 'outline', closed: true, start: points[0], segments: points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return { id: vertices[i].id, control1: p.map((n, j) => n + (q[j] - n) / 3), control2: p.map((n, j) => n + 2 * (q[j] - n) / 3), end: q };
  }) }] };
}
/** Convex, counterclockwise xy ring; IDs belong to landmarks, not rounded coordinates. */
export function extrude({ id, ring, z = 0, height, palette }, camera) {
  finite(z, 'z'); positive(height, 'height');
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) throw new RangeError('Invalid object ID');
  if (!Array.isArray(ring) || ring.length < 3 || ring.length > 256) throw new RangeError('ring needs 3..256 vertices');
  if (new Set(ring.map(v => v.id)).size !== ring.length || ring.some(v => !/^[A-Za-z][A-Za-z0-9_]*$/.test(v.id))) throw new RangeError('Vertex IDs must be unique identifiers');
  for (const v of ring) { if (!Array.isArray(v.position) || v.position.length !== 2) throw new RangeError('Expected xy point'); v.position.forEach(n => finite(n, 'vertex')); }
  // Every other point must lie strictly left of every edge: rejects concavity,
  // self-crossings, duplicate/collinear vertices and clockwise winding.
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i].position, b = ring[(i + 1) % ring.length].position;
    for (let j = 0; j < ring.length; j++) if (j !== i && j !== (i + 1) % ring.length) {
      const c = ring[j].position;
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-9) throw new RangeError('Expected strictly convex counterclockwise ring');
    }
  }
  if (!palette || !['top', 'light', 'dark'].every(role => /^#[0-9a-f]{6}$/i.test(palette[role]))) throw new RangeError('Expected top/light/dark RGB palette');
  const faces = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.position[0] - a.position[0], dy = b.position[1] - a.position[1], length = Math.hypot(dx, dy);
    const normal = [dy / length, -dx / length, 0];
    const facing = normal[0] * camera.viewer[0] + normal[1] * camera.viewer[1];
    if (facing <= 1e-9) continue;
    const vertices = [
      { id: a.id + '_bottom', position: [...a.position, z] }, { id: b.id + '_bottom', position: [...b.position, z] },
      { id: b.id + '_top', position: [...b.position, z + height] }, { id: a.id + '_top', position: [...a.position, z + height] }
    ];
    const faceId = `${id}_side_${a.id}`;
    const role = normal[0] * -0.6 + normal[1] * 0.8 > 0 ? 'light' : 'dark';
    faces.push({ id: faceId, shape: shapeOf(faceId + '_shape', vertices, camera), normal, vertices, role, fill: palette[role] });
  }
  const vertices = ring.map(v => ({ id: v.id, position: [...v.position, z + height] }));
  const faceId = id + '_top';
  faces.push({ id: faceId, shape: shapeOf(faceId + '_shape', vertices, camera), normal: [0, 0, 1], vertices, fill: palette.top });
  return { id, parameters: structuredClone({ ring, z, height, palette }), faces, topology: faces.map(f => [f.id, f.shape.contours[0].segments.map(s => s.id)]) };
}
/** Inscribed polygon with projected chord error <= tolerance; explicit steps retain topology across edits. */
export function cylinder({ id, center = [0, 0], radius, z = 0, height, palette, tolerance = 0.5, steps }, camera) {
  positive(radius, 'radius'); positive(tolerance, 'tolerance');
  if (!Array.isArray(center) || center.length !== 2) throw new RangeError('Expected xy center');
  center.forEach(n => finite(n, 'center'));
  const required = Math.max(8, Math.ceil(Math.PI / Math.acos(1 - Math.min(1, tolerance / (camera.scale * radius)))));
  steps ??= required;
  if (!Number.isInteger(steps) || steps < required || steps > 256) throw new RangeError('Cylinder tolerance exceeds segment budget or supplied steps');
  const ring = Array.from({ length: steps }, (_, i) => ({ id: 'v' + i, position: [center[0] + radius * Math.cos(i * 2 * Math.PI / steps), center[1] + radius * Math.sin(i * 2 * Math.PI / steps)] }));
  const solid = extrude({ id, ring, z, height, palette }, camera);
  solid.parameters = { center: [...center], radius, z, height, palette: { ...palette }, tolerance, steps };
  solid.approximation = { steps, projectedErrorBound: camera.scale * radius * (1 - Math.cos(Math.PI / steps)) };
  // Fill shared edges once. Individual face geometry/IDs remain available for authoring.
  solid.paintGroups = ['light', 'dark'].flatMap(role => {
    const faces = solid.faces.filter(f => f.role === role);
    if (!faces.length) return [];
    const id = solid.id + '_sides_' + role;
    return [{ id, fill: palette[role], shape: { id: id + '_shape', contours: faces.map(f => ({ ...structuredClone(f.shape.contours[0]), id: f.id })) } }];
  });
  return solid;
}
