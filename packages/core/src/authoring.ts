import type { Contour, CurveNode, Vec2 } from './types.js';

const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** Authoring only: two rigid segments on +x, explicit elbow side, radians. */
export function twoSegmentArm(shoulder: Vec2, target: Vec2, lengths: Vec2, elbow: 'positive' | 'negative'): { upper: number; fore: number } {
  authorPoint(shoulder); authorPoint(target); authorPoint(lengths);
  if (lengths.some(n => n <= 0 || n > 1e6) || !['positive', 'negative'].includes(elbow)) throw new RangeError('ARM_INVALID: Positive lengths and explicit elbow side required');
  const dx = target[0] - shoulder[0], dy = target[1] - shoulder[1], distance = Math.hypot(dx, dy);
  const [a, b] = lengths;
  if (distance < 1e-9 || distance > a + b + 1e-9 || distance < Math.abs(a - b) - 1e-9) throw new RangeError('ARM_UNREACHABLE: Target outside two-segment reach');
  const fore = (elbow === 'positive' ? 1 : -1) * Math.acos(Math.max(-1, Math.min(1, (distance * distance - a * a - b * b) / (2 * a * b))));
  return { upper: Math.atan2(dy, dx) - Math.atan2(b * Math.sin(fore), a + b * Math.cos(fore)), fore };
}
export function authorPoint(value: Vec2): Vec2 {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) throw new RangeError('Expected finite xy point');
  return [...value];
}
function checkNodes(nodes: CurveNode[], closed: boolean) {
  if (nodes.length < (closed ? 3 : 2) || nodes.length > 256) throw new RangeError('Curve needs 2..256 nodes (3 for closed curves)');
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!identifier.test(n.id) || ids.has(n.id)) throw new RangeError('Node IDs must be distinct identifiers');
    ids.add(n.id); authorPoint(n.point);
    if (n.in) authorPoint(n.in);
    if (n.out) authorPoint(n.out);
    if (n.mode && !['corner', 'aligned', 'mirrored'].includes(n.mode)) throw new RangeError('Unknown handle mode');
  }
}
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
/** Handles are offsets from the node. The outgoing handle controls aligned/mirrored direction. */
export function nodeContour(id: string, nodes: CurveNode[], closed = false): Contour {
  checkNodes(nodes, closed);
  const handles = nodes.map(n => {
    const coupled = n.mode === 'aligned' || n.mode === 'mirrored';
    let incoming: Vec2 = n.in ?? (coupled && n.out ? mul(n.out, -1) : [0, 0]);
    const outgoing = n.out ?? (coupled ? mul(incoming, -1) : [0, 0]);
    if (n.mode === 'mirrored') incoming = mul(outgoing, -1);
    if (n.mode === 'aligned') {
      const length = Math.hypot(...outgoing);
      if (length) incoming = mul(outgoing, -Math.hypot(...incoming) / length);
      else if (Math.hypot(...incoming)) throw new RangeError('Aligned outgoing handle cannot be zero with a nonzero incoming handle');
    }
    return { incoming, outgoing };
  });
  return { id, closed, start: [...nodes[0]!.point], authoring: { kind: 'nodes', nodes: structuredClone(nodes) }, segments: nodes.slice(0, closed ? nodes.length : -1).map((n, i) => {
    const next = (i + 1) % nodes.length;
    return { id: n.id, control1: add(n.point, handles[i]!.outgoing), control2: add(nodes[next]!.point, handles[next]!.incoming), end: [...nodes[next]!.point] };
  }) };
}
/** Centripetal knots, analytic nonuniform tangents, clamped endpoints; zero spans stay zero. */
export function catmullRomContour(id: string, nodes: CurveNode[], closed = false): Contour {
  checkNodes(nodes, closed);
  if (nodes.some(n => n.in || n.out || n.mode)) throw new RangeError('Catmull-Rom nodes accept only id and point');
  const points = nodes.map(n => n.point);
  const get = (i: number): Vec2 => closed ? points[(i + points.length) % points.length]! : points[Math.max(0, Math.min(points.length - 1, i))]!;
  const knot = (a: Vec2, b: Vec2) => Math.sqrt(Math.hypot(...sub(b, a)));
  const tangent = (a: Vec2, b: Vec2, c: Vec2, left: number, right: number): Vec2 => {
    if (!left || !right) return [0, 0];
    return mul(add(mul(sub(b, a), right / left), mul(sub(c, b), left / right)), 1 / (left + right));
  };
  const segments = nodes.slice(0, closed ? nodes.length : -1).map((n, i) => {
    const a = get(i - 1), b = get(i), c = get(i + 1), d = get(i + 2);
    const span = knot(b, c);
    const startTangent = !closed && i === 0 ? sub(c, b) : mul(tangent(a, b, c, knot(a, b), span), span);
    const endTangent = !closed && i === nodes.length - 2 ? sub(c, b) : mul(tangent(b, c, d, span, knot(c, d)), span);
    return { id: n.id, control1: add(b, mul(startTangent, 1 / 3)), control2: sub(c, mul(endTangent, 1 / 3)), end: [...c] as Vec2 };
  });
  return { id, start: [...points[0]!], closed, segments, authoring: { kind: 'catmull-rom', nodes: structuredClone(nodes) } };
}
export function rebuildContour(contour: Contour): Contour {
  const source = contour.authoring;
  return !source ? structuredClone(contour) : source.kind === 'nodes' ? nodeContour(contour.id, source.nodes, contour.closed) : catmullRomContour(contour.id, source.nodes, contour.closed);
}
/** Editing by landmark ID rebuilds controls atomically; insertion/removal changes segment correspondence. */
export function editContourNode(contour: Contour, id: string, change: Partial<Omit<CurveNode, 'id'>>): Contour {
  if (!contour.authoring) throw new RangeError('Contour has no editable nodes');
  const next = structuredClone(contour), node = next.authoring!.nodes.find(n => n.id === id);
  if (!node) throw new RangeError('Unknown node ID');
  Object.assign(node, change);
  return rebuildContour(next);
}
