import { checkSchema } from './schema.js';
import { validate } from './validate.js';
import { DEFAULT_LIMITS, diagnostic, failure, success } from './types.js';
import type { AssetManifest, FxDocument, Limits, PlaybackPlan, Result } from './types.js';
import { actorParentsValid, evaluateState, initialSnapshot, shotSnapshot } from './evaluate.js';
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function compile(document: unknown, manifest: unknown = [], options: Partial<Limits> = {}): Result<PlaybackPlan> {
  const diagnostics = validate(document, manifest, options);
  if (diagnostics.length) return failure(diagnostics);
  const d = structuredClone(document as FxDocument), m = structuredClone(manifest as AssetManifest);
  const shots: PlaybackPlan['shots'] = [];
  let snapshot = initialSnapshot(d), start = 0;
  for (const shot of d.shots) {
    snapshot = shotSnapshot(snapshot, shot);
    for (const key of shot.keys) if (snapshot.values[key.target]![key.property] === undefined && key.frame !== 0) {
      diagnostics.push(diagnostic('INITIAL_MISSING', 'Property needs an initial value before its first key', { id: key.id }));
    }
    // Parent/visibility are discrete; validating every change boundary covers the entire shot.
    const frames = new Set([0, ...shot.keys.filter(k => k.property === 'parent').map(k => k.frame)]);
    for (const frame of frames) {
      const state = evaluateState(d, shot, snapshot, frame);
      if (!actorParentsValid(d, state, options.depth ?? DEFAULT_LIMITS.depth)) diagnostics.push(diagnostic('HIERARCHY_CYCLE', 'Actor parenting creates a cycle or exceeds depth', { id: shot.id, frame }));
    }
    const cameraFrames = new Set([0, ...shot.keys.filter(k => k.target === 'camera' && (k.property === 'scaleX' || k.property === 'scaleY')).map(k => k.frame)]);
    for (const frame of cameraFrames) {
      const state = evaluateState(d, shot, snapshot, frame);
      if ((state.values['camera']!.scaleX as number) <= 0 || (state.values['camera']!.scaleY as number) <= 0) diagnostics.push(diagnostic('CAMERA_SCALE', 'Camera scales must be positive', { id: shot.id, frame }));
    }
    shots.push({ start, shot, snapshot: structuredClone(snapshot) });
    // Boundary time is duration, so a morph ending at the boundary reaches its destination.
    // Exposures are temporary and therefore are inactive at the boundary.
    snapshot = evaluateState(d, shot, snapshot, shot.duration);
    start += shot.duration;
  }
  return diagnostics.length ? failure(diagnostics) : success(freeze({ schemaVersion: 1, document: d, manifest: m, duration: start, shots }));
}
export function serializeDocument(document: FxDocument): string {
  const errors = checkSchema(document, 'document');
  if (errors.length) throw new TypeError(errors[0]!.message);
  return JSON.stringify(document);
}
export function deserializeDocument(json: string): Result<FxDocument> {
  try { const value: unknown = JSON.parse(json); const errors = checkSchema(value, 'document'); return errors.length ? failure(errors) : success(value as FxDocument); }
  catch (cause) { return failure([diagnostic('JSON_INVALID', cause instanceof Error ? cause.message : 'Invalid JSON')]); }
}
export function serializePlan(plan: PlaybackPlan): string {
  const errors = checkSchema(plan, 'plan');
  if (errors.length) throw new TypeError(errors[0]!.message);
  return JSON.stringify(plan);
}
export function deserializePlan(json: string): Result<PlaybackPlan> {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return failure([diagnostic('JSON_INVALID', 'Invalid plan JSON')]); }
  const errors = checkSchema(value, 'plan'); if (errors.length) return failure(errors);
  const p = value as PlaybackPlan, result = compile(p.document, p.manifest);
  if (!result.ok) return result;
  // Never trust externally supplied snapshots/indices. Compare to a rebuilt plan.
  if (!equalJSON(p, result.value)) return failure([diagnostic('PLAN_INVALID', 'Plan does not match its compiled document')]);
  return result;
}
export function equalJSON(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equalJSON(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>, keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(k => Object.hasOwn(right, k) && equalJSON(left[k], right[k]));
  }
  return false;
}
