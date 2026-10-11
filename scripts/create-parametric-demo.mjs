import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { compile, IDENTITY } from '@aether-fx/core';
import { projection, extrude, cylinder } from './parametric-geometry.mjs';

const wood = { top: '#c89e74', light: '#ae795a', dark: '#765747' };
const brass = { top: '#efc775', light: '#c6914d', dark: '#7d5d3e' };
const enamel = { top: '#547f80', light: '#41676f', dark: '#2b4653' };
const glass = { top: '#fff0b2', light: '#f4d68b', dark: '#d8ae69' };
// Piece order is authored for this non-intersecting assembly, not inferred from centers.
export function createDemo({ tableWidth = 280, lampRadius = 24, cylinderSteps = 32 } = {}) {
  if (!Number.isFinite(tableWidth) || !Number.isFinite(lampRadius) || lampRadius < 14 || tableWidth < 2 * (45 + lampRadius + 7)) throw new RangeError('Dimensions must keep the lamp on the table and support its handle');
  const camera = projection({ origin: [440, 490], scale: 1.35 });
  const d = { schemaVersion: 1, revision: 0, id: 'parametricLamp', viewport: [960, 720], fps: { numerator: 24, denominator: 1 }, assets: [], shapes: [], parts: [], poses: [], drawings: [], actors: [], backgrounds: [], shots: [], audio: null };
  const solids = [], assemblies = [];
  const actor = (id, layer) => { const a = { id, parts: [], transform: { ...IDENTITY }, parent: null, layer }; d.actors.push(a); return a; };
  const table = actor('table', 10), lamp = actor('lamp', 1000), grip = actor('grip', 2000);
  grip.transform.visible = false;
  const part = (owner, id, shape, fill, layer) => {
    if (shape) d.shapes.push(shape);
    d.parts.push({ id, parent: null, pivot: [0, 0], transform: { ...IDENTITY }, layer, shape: shape?.id ?? null, material: { fill, stroke: null, strokeWidth: 0, fillRule: 'nonzero' }, text: null, image: null });
    owner.parts.push(id);
  };
  const add = (owner, solid, separation) => {
    const layer = owner.parts.length;
    for (const [i, face] of solid.faces.entries()) part(owner, face.id, face.shape, face.fill, layer + i);
    for (const face of solid.faces.slice(1)) d.parts.find(p => p.id === face.id).parent = solid.faces[0].id;
    if (solid.paintGroups) {
      for (const face of solid.faces.filter(f => f.normal[2] === 0)) d.parts.find(p => p.id === face.id).material.fill = null;
      for (const [i, group] of solid.paintGroups.entries()) {
        part(owner, group.id, group.shape, group.fill, layer + i);
        d.parts.find(p => p.id === group.id).parent = solid.faces[0].id;
      }
    }
    solids.push(solid); assemblies.push({ owner: owner.id, id: solid.id, parts: solid.faces.map(f => f.id), separation });
  };
  const box = (id, x, y, w, depth, z, height, palette) => extrude({ id, z, height, palette, ring: [[x, y], [x + w, y], [x + w, y + depth], [x, y + depth]].map((position, i) => ({ id: ['sw', 'se', 'ne', 'nw'][i], position })) }, camera);
  const round = (id, z, height, radius, palette) => cylinder({ id, center: [45, 0], radius, z, height, palette, tolerance: 0.5, steps: cylinderSteps }, camera);
  // Back legs first; all legs terminate exactly at the underside of the tabletop.
  const half = tableWidth / 2;
  for (const [id, x, y, delta] of [['legBack', -half + 18, -60, [-65, -20]], ['legLeft', -half + 18, 42, [-100, 45]], ['legRight', half - 36, -60, [100, 35]], ['legFront', half - 36, 42, [55, 80]]]) add(table, box(id, x, y, 18, 18, 0, 140, wood), delta);
  add(table, box('tabletop', -half, -78, tableWidth, 156, 140, 12, wood), [0, -55]);
  // Lamp starts on the z=152 tabletop; glass is opaque prepared artwork.
  add(lamp, round('base', 152, 8, lampRadius + 7, enamel), [-30, -35]);
  add(lamp, round('housing', 160, 50, lampRadius, glass), [0, -95]);
  add(lamp, box('postLeft', 45 - lampRadius - 3, -3, 6, 6, 160, 50, brass), [-40, -95]);
  add(lamp, box('postRight', 45 + lampRadius - 3, -3, 6, 6, 160, 50, brass), [40, -95]);
  add(lamp, round('cap', 210, 7, lampRadius + 5, enamel), [0, -145]);
  // Three solid bars form an open handle; no boolean/hole operation is needed.
  add(lamp, box('handleLeft', 26, -3, 5, 6, 217, 31, brass), [-20, -185]);
  add(lamp, box('handleRight', 59, -3, 5, 6, 217, 31, brass), [20, -185]);
  add(lamp, box('handleTop', 26, -3, 38, 6, 248, 5, brass), [0, -190]);
  const anchorShape = box('anchor', 0, 0, 1, 1, 0, 1, enamel).faces.at(-1).shape;
  part(grip, 'anchor', anchorShape, null, 0);
  // Prepared mechanical grip: palm/arm, back finger and front finger around the bar.
  add(grip, box('gripArm', 48, -8, 100, 16, 259, 12, enamel), [0, 0]);
  add(grip, box('gripBack', 42, -7, 8, 4, 246, 18, enamel), [0, 0]);
  add(grip, box('gripFront', 42, 3, 8, 4, 246, 18, enamel), [0, 0]);
  for (const p of d.parts.filter(p => p.id.startsWith('gripBack_'))) p.layer -= 1100;
  const background = actor('background', -100);
  const wall = { id: 'wall_shape', contours: [{ id: 'outline', start: [0, 0], closed: true, segments: [[960, 0], [960, 720], [0, 720], [0, 0]].map((end, i) => { const start = [[0, 0], [960, 0], [960, 720], [0, 720]][i]; return { id: 's' + i, control1: start.map((n, j) => n + (end[j] - n) / 3), control2: start.map((n, j) => n + 2 * (end[j] - n) / 3), end }; }) }] };
  part(background, 'wall', wall, '#eee7da', 0);
  d.backgrounds.push({ id: 'wallDepth', actor: 'background', parallax: 0 });
  const shot = (id, duration, camera = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }) => ({ id, duration, camera, initial: [], keys: [], morphs: [], exposures: [] });
  const key = (s, target, property, frame, value, easing = 'ease-in-out') => s.keys.push({ id: `${s.id}_${s.keys.length}`, target, property, frame, value, easing, rotation: 'direct', hold: 1 });
  const assembled = shot('assembled', 96), separated = shot('separated', 144), lift = shot('lift', 144, { x: 70, y: 50, scaleX: 0.85, scaleY: 0.85, rotation: 0 });
  for (const a of assemblies.filter(a => a.owner !== 'grip')) for (const [i, property] of ['x', 'y'].entries()) {
    for (const [frame, amount] of [[0, 0], [48, 1], [84, 1], [132, 0]]) key(separated, `${a.owner}.${a.parts[0]}`, property, frame, amount ? a.separation[i] : 0);
  }
  lift.initial.push({ target: 'grip', values: { visible: true } });
  // Both parent and child transforms are identity at attachment; world pose is preserved.
  key(lift, 'lamp', 'parent', 24, 'grip.anchor', 'linear');
  for (const [property, values] of [['x', [0, 0, -35, -85, -85]], ['y', [0, 0, -55, -100, -100]]]) for (const [i, frame] of [0, 24, 60, 108, 143].entries()) key(lift, 'grip', property, frame, values[i]);
  d.shots.push(assembled, separated, lift);
  const compiled = compile(d); if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  return { document: d, plan: compiled.value, solids, assemblies, camera };
}
const ref = id => ({ reference: id });
function field(v, key = '') {
  if (v && typeof v === 'object' && 'reference' in v) return '@' + v.reference;
  if (Array.isArray(v)) return '(' + v.map(x => field(x)).join(', ') + ')';
  if (v && typeof v === 'object') return '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${field(x, k)};`).join(' ') + ' }';
  if (typeof v === 'number') return String(v) + (['frame', 'duration'].includes(key) ? 'f' : key === 'rotation' ? 'rad' : '');
  return JSON.stringify(v);
}
function declaration(kind, id, fields, children = []) { return `${kind} ${id} {\n${Object.entries(fields).map(([k, v]) => `  ${k}: ${field(v, k)};`).join('\n')}\n${children.map(c => c.split('\n').map(l => '  ' + l).join('\n')).join('\n')}\n}`; }
export function demoSource(document) {
  const children = document.shapes.map(s => declaration('shape', s.id, {}, s.contours.map(c => declaration('contour', c.id, { start: c.start, closed: c.closed }, c.segments.map(s => declaration('cubic', s.id, { control1: s.control1, control2: s.control2, end: s.end }))))));
  for (const p of document.parts) children.push(declaration('part', p.id, { ...(p.shape ? { shape: ref(p.shape) } : {}), ...(p.parent ? { parent: ref(p.parent) } : {}), transform: p.transform, material: p.material, layer: p.layer }));
  for (const a of document.actors) children.push(declaration('actor', a.id, { parts: a.parts.map(ref), transform: a.transform, layer: a.layer }));
  for (const b of document.backgrounds) children.push(declaration('background', b.id, { actor: ref(b.actor), parallax: b.parallax }));
  children.push(declaration('scene', 'demonstration', {}, document.shots.map(s => declaration('shot', s.id, { duration: s.duration }, [declaration('camera', 'view', s.camera), ...s.initial.map(v => declaration('initial', v.target, v.values)), ...s.keys.map(k => declaration('key', k.id, { target: ref(k.target), property: k.property, frame: k.frame, value: k.property === 'parent' ? ref(k.value) : k.value, easing: k.easing }))]))));
  return '// Generated original artwork. Edit parameters in scripts/create-parametric-demo.mjs.\n' + declaration('project', document.id, { version: 1, viewport: document.viewport, fps: [24, 1] }, children) + '\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('fixtures/parametric', { recursive: true });
  await writeFile('fixtures/parametric/lamp-table.afx', demoSource(createDemo().document));
  console.log('Generated fixtures/parametric/lamp-table.afx (384 frames, no external assets)');
}
