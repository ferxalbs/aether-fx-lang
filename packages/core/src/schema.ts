import schema from './document.schema.json' with { type: 'json' };
import { DEFAULT_LIMITS, diagnostic } from './types.js';
import type { Diagnostic } from './types.js';
type Rule = { $ref?: string; anyOf?: Rule[]; const?: unknown; enum?: unknown[]; type?: string; minimum?: number; maximum?: number; exclusiveMinimum?: number; minItems?: number; maxItems?: number; maxLength?: number; pattern?: string; prefixItems?: Rule[]; items?: Rule; properties?: Record<string, Rule>; required?: string[]; propertyNames?: Rule; additionalProperties?: boolean | Rule };
const definitions = schema.$defs as unknown as Record<string, Rule>;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

/** The checked subset of JSON Schema used by our exported schema. No coercion/default insertion. */
export function checkSchema(value: unknown, kind: 'document' | 'plan' | 'manifest', depth = DEFAULT_LIMITS.depth): Diagnostic[] {
  const errors: Diagnostic[] = [];
  let visited = 0;
  const active = new Set<object>();
  function safe(v: unknown, path: string, level: number): boolean {
    if (++visited > 2_000_000 || level > depth) { errors.push(diagnostic('LIMIT_EXCEEDED', 'JSON structural limit exceeded', { path })); return false; }
    if (typeof v === 'number' && !Number.isFinite(v)) { errors.push(diagnostic('SCHEMA_INVALID', 'Numbers must be finite', { path })); return false; }
    if (v && typeof v === 'object') {
      if (active.has(v) || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)) {
        errors.push(diagnostic('SCHEMA_INVALID', 'Expected acyclic plain JSON data', { path })); return false;
      }
      const descriptors = Object.getOwnPropertyDescriptors(v);
      const keys = Object.keys(v);
      if (Object.getOwnPropertySymbols(v).length || Object.entries(descriptors).some(([key, descriptor]) => (key !== 'length' || !Array.isArray(v)) && (!('value' in descriptor) || !descriptor.enumerable))) {
        errors.push(diagnostic('SCHEMA_INVALID', 'JSON data cannot contain accessors, symbols or hidden properties', { path })); return false;
      }
      if (Array.isArray(v) && (keys.length !== v.length || keys.some((key, index) => key !== String(index)))) {
        errors.push(diagnostic('SCHEMA_INVALID', 'JSON arrays must be dense and contain only indexed values', { path })); return false;
      }
      active.add(v);
      for (const [key, child] of Object.entries(v)) {
        if (forbidden.has(key)) { errors.push(diagnostic('UNSAFE_KEY', `Forbidden property ${key}`, { path })); active.delete(v); return false; }
        if (!safe(child, `${path}/${key}`, level + 1)) { active.delete(v); return false; }
      }
      active.delete(v);
    } else if (!['string', 'number', 'boolean'].includes(typeof v) && v !== null) {
      errors.push(diagnostic('SCHEMA_INVALID', 'Expected JSON data', { path })); return false;
    }
    return true;
  }
  if (!safe(value, '', 0)) return errors;
  function matches(v: unknown, rule: Rule, path: string, report = true): boolean {
    if (rule.$ref) return matches(v, definitions[rule.$ref.replace('#/$defs/', '')]!, path, report);
    const invalid = (message: string) => { if (report && errors.length < 100) errors.push(diagnostic('SCHEMA_INVALID', message, { path })); return false; };
    if (rule.anyOf) return rule.anyOf.some(r => matches(v,r,path,false)) || invalid('Value does not match permitted types');
    if ('const' in rule && v !== rule.const) return invalid(`Expected ${String(rule.const)}`);
    if (rule.enum && !rule.enum.includes(v)) return invalid('Value is not in the allowed enum');
    const type = rule.type;
    if (type === 'null') return v === null || invalid('Expected null');
    if (type === 'number' || type === 'integer') {
      if (typeof v !== 'number' || !Number.isFinite(v) || (type === 'integer' && !Number.isSafeInteger(v))) return invalid(`Expected finite ${type}`);
      if ((rule.minimum !== undefined && v < rule.minimum) || (rule.maximum !== undefined && v > rule.maximum) || (rule.exclusiveMinimum !== undefined && v <= rule.exclusiveMinimum)) return invalid('Number outside allowed range');
    } else if (type === 'string') {
      if (typeof v !== 'string') return invalid('Expected string');
      if ((rule.maxLength !== undefined && v.length > rule.maxLength) || (rule.pattern && !new RegExp(rule.pattern).test(v))) return invalid('Invalid string');
    } else if (type === 'boolean') { if (typeof v !== 'boolean') return invalid('Expected boolean'); }
    else if (type === 'array') {
      if (!Array.isArray(v)) return invalid('Expected array');
      if ((rule.minItems !== undefined && v.length < rule.minItems) || (rule.maxItems !== undefined && v.length > rule.maxItems)) return invalid('Invalid array length');
      let valid = true;
      v.forEach((item,i) => { const r = rule.prefixItems?.[i] ?? rule.items; if (r && !matches(item,r,`${path}/${i}`,report)) valid = false; });
      return valid;
    } else if (type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return invalid('Expected object');
      const o = v as Record<string, unknown>;
      let valid = true;
      for (const key of rule.required ?? []) if (!Object.hasOwn(o,key)) { invalid(`Missing ${key}`); valid = false; }
      for (const [key, child] of Object.entries(o)) {
        if (rule.propertyNames && !matches(key,rule.propertyNames,`${path}/${key}`,report)) valid = false;
        const r = Object.hasOwn(rule.properties ?? {},key) ? rule.properties![key] : rule.additionalProperties;
        if (r === false) { invalid(`Unknown property ${key}`); valid = false; }
        else if (r && typeof r === 'object' && !matches(child,r,`${path}/${key}`,report)) valid = false;
      }
      return valid;
    }
    return true;
  }
  const rule: Rule = kind === 'manifest' ? { type:'array', items:definitions['manifestAsset']! } : definitions[kind]!;
  if (value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 1) return [diagnostic('SCHEMA_VERSION', 'Unsupported schemaVersion')];
  matches(value,rule,'');
  return errors;
}
