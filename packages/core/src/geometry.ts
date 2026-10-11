import type { Matrix, Shape, Transform, Vec2 } from './types.js';
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformMatrix(t: Pick<Transform, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>, pivot: Vec2 = [0,0]): Matrix {
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  const a = c*t.scaleX, b = s*t.scaleX, d = c*t.scaleY, e = -s*t.scaleY;
  return [a,b,e,d,t.x+pivot[0]-a*pivot[0]-e*pivot[1],t.y+pivot[1]-b*pivot[0]-d*pivot[1]];
}
export function topologyMatches(a: Shape, b: Shape): boolean {
  return a.contours.length === b.contours.length && a.contours.every((c,i) => {
    const d = b.contours[i]!;
    return c.id === d.id && c.closed === d.closed && (!c.closed || Math.sign(contourArea(c)) === Math.sign(contourArea(d))) && c.segments.length === d.segments.length && c.segments.every((s,j) => s.id === d.segments[j]!.id);
  });
}
export function interpolateShape(a: Shape, b: Shape, t: number): Shape {
  if (!topologyMatches(a,b)) throw new RangeError('Morph topology does not match');
  const point = (p: Vec2,q: Vec2): Vec2 => [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
  return { id: a.id, contours: a.contours.map((c,i) => {
    const d = b.contours[i]!;
    return { id:c.id, start:point(c.start,d.start), closed:c.closed, segments:c.segments.map((s,j) => {
      const r = d.segments[j]!;
      return {id:s.id,control1:point(s.control1,r.control1),control2:point(s.control2,r.control2),end:point(s.end,r.end)};
    }) };
  }) };
}
export function inverseMatrix(m: Matrix): Matrix {
  const determinant = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new RangeError('TRANSFORM_SINGULAR: matrix cannot be inverted');
  return [m[3]/determinant,-m[1]/determinant,-m[2]/determinant,m[0]/determinant,(m[2]*m[5]-m[3]*m[4])/determinant,(m[1]*m[4]-m[0]*m[5])/determinant];
}
export function matrixPoint(m: Matrix, p: Vec2): Vec2 { return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]]; }
/** Exact signed area of the cubic contour, including the implicit close edge. */
export function contourArea(c: import('./types.js').Contour): number {
  if (!c.closed) return 0;
  let area = 0, start = c.start;
  const polynomial = (a:number,b:number,c:number,d:number) => [a,3*(b-a),3*(c-2*b+a),d-3*c+3*b-a];
  for (const s of c.segments) {
    const x=polynomial(start[0],s.control1[0],s.control2[0],s.end[0]), y=polynomial(start[1],s.control1[1],s.control2[1],s.end[1]);
    for(let i=0;i<4;i++)for(let j=1;j<4;j++)area+=(x[i]!*j*y[j]!-y[i]!*j*x[j]!)/(i+j);
    start=s.end;
  }
  area+=start[0]*c.start[1]-start[1]*c.start[0];
  return area/2;
}
