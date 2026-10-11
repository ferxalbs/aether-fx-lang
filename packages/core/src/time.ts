import type { Fps, Easing } from './types.js';

/** Round nonnegative rational values to nearest integer; ties go up. */
export function frameTimestamp(frame: number, fps: Fps, units = 1_000_000): number {
  if (![frame, fps.numerator, fps.denominator, units].every(Number.isSafeInteger) || frame < 0 || fps.numerator <= 0 || fps.denominator <= 0 || units <= 0) {
    throw new RangeError('Frame, FPS and units must be safe integers with positive FPS/units');
  }
  const numerator = BigInt(frame) * BigInt(fps.denominator) * BigInt(units);
  const denominator = BigInt(fps.numerator);
  const result = (2n * numerator + denominator) / (2n * denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Timestamp exceeds safe integer range');
  return Number(result);
}
export function frameSeconds(frame: number, fps: Fps): number { return frame * fps.denominator / fps.numerator; }
export function ease(t: number, easing: Easing): number {
  if (easing === 'linear' || t <= 0 || t >= 1) return t;
  if(typeof easing==='object'&&!Array.isArray(easing)) {
    // Normalized displacement from x(0)=0, dx/dt(0)=velocity, target=1.
    // Time is the interval fraction, frequency rad/interval, damping ratio (0,1].
    const w=easing.frequency,z=easing.damping,v=easing.velocity;
    const response=(u:number)=>{if(z===1)return 1-Math.exp(-w*u)*(1+(w-v)*u);const q=w*Math.sqrt(1-z*z);return 1-Math.exp(-z*w*u)*(Math.cos(q*u)+(z*w-v)/q*Math.sin(q*u));};
    return response(t)/response(1);
  }
  if(typeof easing==='string') {
    const back=(u:number)=>u*u*(2.70158*u-1.70158);
    if(easing==='back-in')return back(t);
    if(easing==='back-out')return 1-back(1-t);
    if(easing==='back-in-out')return t<0.5?back(2*t)/2:1-back(2-2*t)/2;
    if(easing==='bounce-out'){let u=t;if(u<1/2.75)return 7.5625*u*u;if(u<2/2.75){u-=1.5/2.75;return 7.5625*u*u+0.75;}if(u<2.5/2.75){u-=2.25/2.75;return 7.5625*u*u+0.9375;}u-=2.625/2.75;return 7.5625*u*u+0.984375;}
    return ease(t,easing==='ease-in'?[0.42,0,1,1]:easing==='ease-out'?[0,0,0.58,1]:[0.42,0,0.58,1]);
  }
  const [x1, y1, x2, y2] = easing;
  const cubic = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (cubic(mid, x1, x2) < t) low = mid; else high = mid;
  }
  return cubic((low + high) / 2, y1, y2);
}

export function mayOvershoot(easing:Easing):boolean {
 if(Array.isArray(easing))return easing[1]<0||easing[1]>1||easing[3]<0||easing[3]>1;
 return typeof easing==='object'||easing.startsWith('back-');
}
