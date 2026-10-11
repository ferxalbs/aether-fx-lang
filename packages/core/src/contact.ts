import { IDENTITY } from './types.js';
import type { Contact, FxDocument, Matrix, Snapshot, Transform } from './types.js';
import { inverseMatrix, matrixPoint, multiply, transformMatrix } from './geometry.js';

export function worldMatrix(d: FxDocument, state: Snapshot, target: string, active = new Set<string>()): Matrix {
  if (active.has(target) || active.size > 64) throw new RangeError('HIERARCHY_CYCLE: contact hierarchy');
  active.add(target);
  const [owner, id] = target.split('.'), actor = d.actors.find(a => a.id === owner)!;
  const part = id ? d.parts.find(p => p.id === id)! : null, values = state.values[target]!;
  const parent = part ? part.parent ? `${owner}.${part.parent}` : actor.id : values.parent as string | null;
  const local = transformMatrix({ ...IDENTITY, ...values } as Transform, part?.pivot);
  return parent ? multiply(worldMatrix(d, state, parent, active), local) : local;
}
function transformOf(m: Matrix): Pick<Transform, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'> {
  const scaleX = Math.hypot(m[0], m[1]);
  if (scaleX < 1e-12) throw new RangeError('TRANSFORM_SINGULAR: contact scale');
  const scaleY = (m[0] * m[3] - m[1] * m[2]) / scaleX;
  if (Math.abs(scaleY) < 1e-12) throw new RangeError('TRANSFORM_SINGULAR: contact scale');
  if (Math.abs(m[0] * m[2] + m[1] * m[3]) > 1e-8 * scaleX * Math.hypot(m[2], m[3])) throw new RangeError('CONTACT_SHEAR: contact matrix cannot be represented by a 2D transform');
  return { x: m[4], y: m[5], scaleX, scaleY, rotation: Math.atan2(m[1], m[0]) };
}
/** Stateless bind/release: each boundary is sampled from the same absolute tracks. */
export function contactState(d: FxDocument, contacts: Contact[], sample: (frame: number) => Snapshot, frame: number, checkGap = false): Snapshot {
  const ordered = [...contacts].sort((a, b) => a.start - b.start), cache = new Map<string, Snapshot>();
  function stage(count: number, time: number): Snapshot {
    const key = count + ':' + time, cached = cache.get(key); if (cached) return cached;
    if (!count) { const state = sample(time); cache.set(key, state); return state; }
    const contact = ordered[count - 1]!;
    if(time<contact.start)return stage(count-1,time);
    const state = structuredClone(stage(count - 1, time));
    if (time >= contact.start) {
      for(const probe of [state,stage(count-1,contact.start)]) {
        let owner=contact.anchor.split('.')[0]!,depth=0;
        while(owner) {
          if(ordered.some(c=>c.target===owner))throw new RangeError('CONTACT_CHAIN: anchor cannot descend from a constrained actor');
          const parent=probe.values[owner]?.parent;
          owner=typeof parent==='string'?parent.split('.')[0]!:'';
          if(++depth>64)throw new RangeError('HIERARCHY_CYCLE: anchor ancestry');
        }
      }
      const bound = stage(count - 1, contact.start), anchorStart = worldMatrix(d, bound, contact.anchor), targetStart = worldMatrix(d, bound, contact.target);
      if (checkGap) {
        const a = matrixPoint(anchorStart, contact.anchorPoint), b = matrixPoint(targetStart, contact.targetPoint);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01) throw new RangeError('CONTACT_GAP: anchors must coincide within 0.01 project units at bind');
      }
      const offset = multiply(inverseMatrix(anchorStart), targetStart), stop = Math.min(time, contact.end);
      let desired = multiply(worldMatrix(d, stage(count - 1, stop), contact.anchor), offset);
      if (time > contact.end) {
        // Motion authored after release is relative to the unconstrained boundary pose.
        desired = multiply(multiply(desired, inverseMatrix(worldMatrix(d, stage(count - 1, contact.end), contact.target))), worldMatrix(d, state, contact.target));
      }
      const parent = state.values[contact.target]!.parent as string | null;
      const local = parent ? multiply(inverseMatrix(worldMatrix(d, state, parent)), desired) : desired;
      Object.assign(state.values[contact.target]!, transformOf(local));
    }
    cache.set(key, state); return state;
  }
  return stage(ordered.length, frame);
}
