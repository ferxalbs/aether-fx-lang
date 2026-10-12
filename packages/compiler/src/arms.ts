import { IDENTITY, inverseMatrix, matrixPoint, multiply, transformMatrix, twoSegmentArm } from '@aether-fx/core';
import type { FxDocument, Matrix, Pose, Transform, Vec2 } from '@aether-fx/core';

export interface ArmAuthoring {
  actor: string; upper: string; fore: string; hand: string; lengths: Vec2;
  target: string | Vec2; point?: Vec2; offsetPoint?: Vec2; grip?: Vec2;
  elbow: 'positive' | 'negative'; rotation: number; initial?: boolean;
}
/** Lower a pose's one rigid arm. No iterative solver or playback constraint is installed. */
export function armPose(document: FxDocument, pose: Pose, arm: ArmAuthoring): void {
  const actor = document.actors.find(a => a.id === arm.actor);
  const upper = document.parts.find(p => p.id === arm.upper), fore = document.parts.find(p => p.id === arm.fore), hand = document.parts.find(p => p.id === arm.hand);
  if (!actor || !upper || !fore || !hand || ![upper.id, fore.id, hand.id].every(id => actor.parts.includes(id))) throw new RangeError('REFERENCE_MISSING: Arm actor/parts missing');
  if (fore.parent !== upper.id || hand.parent !== fore.id || [upper, fore, hand].some(p => p.pivot.some(n => n !== 0) || p.transform.scaleX !== 1 || p.transform.scaleY !== 1) || !Array.isArray(arm.lengths) || arm.lengths.length !== 2 || fore.transform.x !== arm.lengths[0] || hand.transform.x !== arm.lengths[1] || fore.transform.y !== 0 || hand.transform.y !== 0) throw new RangeError('ARM_INVALID: Arm requires zero pivots, +x segment placements and unit scales');
  if (!Number.isFinite(arm.rotation)) throw new RangeError('ARM_INVALID: Explicit hand rotation required');
  for (const id of [upper.id, fore.id, hand.id]) {
    const state = Object.hasOwn(pose.parts, id) ? pose.parts[id] : undefined;
    if (state !== undefined && (!state || typeof state !== 'object' || Array.isArray(state))) throw new RangeError('ARM_INVALID: Arm pose part state must be an object');
    if (state && Object.hasOwn(state, 'transform')) throw new RangeError('PROPERTY_CONFLICT: Arm and explicit pose transform write the same part');
  }
  const world = (target: string, active = new Set<string>()): Matrix => {
    if (active.has(target) || active.size > 64) throw new RangeError('HIERARCHY_CYCLE: Arm hierarchy');
    active.add(target);
    const [owner, id] = target.split('.'), a = document.actors.find(a => a.id === owner), p = id ? document.parts.find(p => p.id === id) : undefined;
    if (!a || (id && (!p || !a.parts.includes(id)))) throw new RangeError('REFERENCE_MISSING: Arm target missing');
    const t = p ? { ...p.transform, ...(owner === arm.actor ? pose.parts[p.id]?.transform : {}) } : a.transform;
    const parent = p ? p.parent ? owner + '.' + p.parent : owner! : a.parent;
    return parent ? multiply(world(parent, active), transformMatrix(t, p?.pivot)) : transformMatrix(t, p?.pivot);
  };
  const parent = world(upper.parent ? actor.id + '.' + upper.parent : actor.id);
  if (Math.abs(Math.hypot(parent[0], parent[1]) - 1) > 1e-9 || Math.abs(Math.hypot(parent[2], parent[3]) - 1) > 1e-9 || Math.abs(parent[0] * parent[2] + parent[1] * parent[3]) > 1e-9 || parent[0] * parent[3] - parent[1] * parent[2] < 0) throw new RangeError('ARM_INVALID: Arm parent must be rigid, unit scale');
  const target = typeof arm.target === 'string' ? matrixPoint(world(arm.target), arm.point ?? [0, 0]) : arm.target;
  const offset = arm.offsetPoint ?? [0, 0], grip = arm.grip ?? [0, 0];
  const wrist = matrixPoint(transformMatrix({ ...IDENTITY, rotation: arm.rotation }), grip);
  const goal = matrixPoint(inverseMatrix(parent), [target[0] + offset[0] - wrist[0], target[1] + offset[1] - wrist[1]]);
  const angles = twoSegmentArm([upper.transform.x, upper.transform.y], goal, arm.lengths, arm.elbow);
  pose.parts[upper.id] = { ...pose.parts[upper.id], transform: { rotation: angles.upper } as Transform };
  pose.parts[fore.id] = { ...pose.parts[fore.id], transform: { rotation: angles.fore } as Transform };
  pose.parts[hand.id] = { ...pose.parts[hand.id], transform: { rotation: arm.rotation - Math.atan2(parent[1], parent[0]) - angles.upper - angles.fore } as Transform };
  if (arm.initial !== undefined && typeof arm.initial !== 'boolean') throw new RangeError('ARM_INVALID: initial must be boolean');
  if (arm.initial) for (const part of [upper, fore, hand]) part.transform.rotation = pose.parts[part.id]!.transform!.rotation!;
}
