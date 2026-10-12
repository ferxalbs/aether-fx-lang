import { diagnostic, failure, success } from '@aether-fx/core';
import type { Result } from '@aether-fx/core';
import type { AstField, AstValue, Declaration, DocumentAST } from './parser.js';
import { timeFrames } from './expand.js';
import { resolveAnchors } from './anchors.js';

/** Compact syntax lowers to ordinary keys, morphs, exposures and contacts. */
export function expandTemporal(ast: DocumentAST): Result<DocumentAST> {
  const clips = new Map<string, Declaration>();
  const fps = ast.project.fields.find(f => f.name === 'fps')?.value;
  const rate: [number, number] = fps?.kind === 'array' && fps.items.length === 2 && fps.items.every(v => v.kind === 'scalar' && typeof v.value === 'number' && Number.isSafeInteger(v.value) && v.value > 0)
    ? fps.items.map(v => Number((v as { value: number }).value)) as [number, number] : [24, 1];
  let owner = ast.project, count = 0;
  const get = (d: Declaration, name: string) => d.fields.find(f => f.name === name)?.value;
  const error = (message: string, code = 'TEMPORAL_INVALID'): never => { throw Object.assign(new Error(message), { code }); };
  const check = (d: Declaration, names: string[]) => {
    owner = d;
    const seen = new Set<string>();
    for (const f of d.fields) {
      if (!names.includes(f.name) || (seen.has(f.name) && f.name !== 'repeatOffset')) error('Unknown or duplicate ' + d.keyword + ' field ' + f.name);
      seen.add(f.name);
    }
  };
  const time = (v: AstValue | undefined): number => {
    if (!v || v.kind !== 'scalar' || typeof v.value !== 'number' || !['f', 's', 'ms'].includes(v.unit ?? '')) error('Expected a time', 'UNIT_REQUIRED');
    const n = timeFrames(v as Extract<AstValue, { kind: 'scalar' }>, rate);
    if (!Number.isSafeInteger(n) || n < 0) error('Expected nonnegative integer frame', 'FRAME_RANGE');
    return n;
  };
  const field = (name: string, value: AstValue): AstField => ({ name, value, range: value.range });
  const scalar = (value: string | number, d: Declaration, unit?: string): AstValue => ({ kind: 'scalar', value, range: d.range, ...(unit ? { unit } : {}) });
  const ref = (value: string, d: Declaration): AstValue => ({ kind: 'reference', value, range: d.range });
  try {
    for (const d of ast.project.children.filter(d => d.keyword === 'clip')) {
      check(d, ['duration', 'params']);
      if (clips.has(d.id)) error('Duplicate clip ' + d.id);
      if (time(get(d, 'duration')) < 1) error('Clip duration must be positive');
      const params = get(d, 'params');
      if (params && params.kind !== 'object') error('Clip params must be object');
      if (params?.kind === 'object' && new Set(params.fields.map(f => f.name)).size !== params.fields.length) error('Duplicate clip parameter');
      for (const child of d.children) if (!['track', 'key', 'morph', 'expose', 'contact', 'anchor', 'play'].includes(child.keyword)) error('Unsupported clip declaration ' + child.keyword);
      clips.set(d.id, d);
    }
    const done = new Set<string>(), active = new Set<string>();
    const cycle = (id: string, depth = 0): void => {
      const d = clips.get(id); if (!d) error('Missing clip ' + id, 'REFERENCE_MISSING');
      owner = d!;
      if (depth > 32) error('Clip depth exceeds 32', 'LIMIT_EXCEEDED');
      if (active.has(id)) error('Clip cycle ' + id, 'EXPANSION_CYCLE');
      if (done.has(id)) return;
      active.add(id);
      for (const play of d!.children.filter(c => c.keyword === 'play')) {
        const reference = get(play, 'clip');
        if (reference?.kind !== 'reference') error('play requires clip reference');
        cycle((reference as Extract<AstValue, { kind: 'reference' }>).value, depth + 1);
      }
      active.delete(id); done.add(id);
    };
    for (const id of clips.keys()) cycle(id);
    const lower = (list: Declaration[], depth = 0): Declaration[] => {
      if (depth > 32) error('Temporal expansion depth exceeds 32', 'LIMIT_EXCEEDED');
      const out: Declaration[] = [];
      for (const d of list) {
        owner = d;
        if (++count > 20000) error('Temporal expansion exceeds 20000 declarations', 'LIMIT_EXCEEDED');
        if (d.keyword === 'track') {
          check(d, ['target', 'property', 'keys', 'easing', 'rotationMode', 'hold', 'repeatOffset']);
          const keys = get(d, 'keys');
          if (d.children.length || !get(d, 'target') || !get(d, 'property') || keys?.kind !== 'array' || !keys.items.length) error('track requires target, property and nonempty keys');
          const ids = new Set<string>();
          for (const [index, item] of (keys as Extract<AstValue, { kind: 'array' }>).items.entries()) {
            if (++count > 20000) error('Temporal expansion exceeds 20000 declarations', 'LIMIT_EXCEEDED');
            if (item.kind !== 'object') error('Track key must be object');
            const fields = (item as Extract<AstValue, { kind: 'object' }>).fields;
            if (fields.filter(f => f.name === 'id').length > 1) error('Duplicate track key id field');
            const id = fields.find(f => f.name === 'id')?.value;
            if (id && (id.kind !== 'scalar' || typeof id.value !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id.value))) error('Track key id must be an identifier');
            const label = id?.kind === 'scalar' ? String(id.value) : String(index);
            if (ids.has(label)) error('Duplicate track key id'); ids.add(label);
            const key: Declaration = { keyword: 'key', id: d.id + '_' + label, fields: fields.filter(f => f.name !== 'id'), children: [], range: item.range };
            check(key, ['frame', 'value', 'easing', 'rotationMode', 'hold', 'offset']);
            if (!get(key, 'frame') || !get(key, 'value')) error('Track key requires frame and value');
            for (const f of d.fields.filter(f => !['keys'].includes(f.name))) if (f.name === 'repeatOffset' || !key.fields.some(k => k.name === f.name)) key.fields.push(f);
            out.push(key);
          }
        } else if (d.keyword === 'play') {
          check(d, ['clip', 'start', 'duration', 'args', 'repeatOffset']);
          const reference = get(d, 'clip'), clip = reference?.kind === 'reference' ? clips.get(reference.value) : undefined;
          if (!clip) error('Missing clip', 'REFERENCE_MISSING');
          if (d.children.length || !get(d, 'start')) error('play requires start and no children');
          const duration = time(get(clip!, 'duration'));
          if (get(d, 'duration') && time(get(d, 'duration')) !== duration) error('play duration must equal clip duration; no implicit retiming');
          const args = get(d, 'args'), defaults = get(clip!, 'params'), params = new Map<string, AstValue>();
          if (args && args.kind !== 'object') error('Clip args must be object');
          if (defaults?.kind === 'object') for (const f of defaults.fields) params.set(f.name, f.value);
          if (args?.kind === 'object') for (const f of args.fields) {
            if (!params.has(f.name)) error('Unknown clip parameter ' + f.name);
            if (args.fields.filter(x => x.name === f.name).length > 1) error('Duplicate clip argument');
            params.set(f.name, f.value);
          }
          const ids = new Map(clip!.children.filter(c => c.keyword === 'anchor').map(c => [c.id, d.id + '_' + c.id]));
          const substitute = (v: AstValue): AstValue => {
            if (v.kind === 'reference') return params.has(v.value) ? { ...params.get(v.value)!, range: v.range } : { ...v, value: ids.get(v.value) ?? v.value };
            if (v.kind === 'array') return { ...v, items: v.items.map(substitute) };
            if (v.kind === 'object') return { ...v, fields: v.fields.map(f => ({ ...f, value: substitute(f.value) })) };
            return { ...v };
          };
          const local = lower(clip!.children.map(c => ({ ...c, id: d.id + '_' + c.id, fields: c.fields.map(f => ({ ...f, value: substitute(f.value) })) })), depth + 1);
          const anchored = resolveAnchors({ keyword: 'shot', id: d.id, fields: [field('duration', scalar(duration, d, 'f'))], children: local, range: d.range }, rate);
          if (!anchored.ok) throw { diagnostics: anchored.diagnostics };
          const origin = d.id + '_origin', start = get(d, 'start')!;
          out.push({ keyword: 'anchor', id: origin, fields: [field(start.kind === 'reference' ? 'after' : 'at', start), ...d.fields.filter(f => f.name === 'repeatOffset')], children: [], range: d.range });
          for (const c of anchored.value.children) {
            for (const f of c.fields.filter(f => ['frame', 'start', 'end'].includes(f.name))) {
              const n = time(f.value);
              if (n > duration) { owner = c; error('Clip event outside declared duration', 'FRAME_RANGE'); }
              const id = c.id + '_' + f.name;
              out.push({ keyword: 'anchor', id, fields: [field('after', ref(origin, c)), field('offset', scalar(n, c, 'f'))], children: [], range: f.range });
              f.value = { kind: 'reference', value: id, range: f.value.range };
            }
            out.push(c);
          }
          // Check the complete declared span even when its last event occurs earlier.
          out.push({ keyword: 'anchor', id: d.id + '_end', fields: [field('after', ref(origin, d)), field('offset', scalar(duration, d, 'f'))], children: [], range: d.range });
        } else {
          const next = { ...d, children: lower(d.children, depth + 1) };
          if (d.keyword === 'shot') {
            const anchored = resolveAnchors(next, rate);
            if (!anchored.ok) throw { diagnostics: anchored.diagnostics };
            out.push(anchored.value);
          } else out.push(next);
        }
      }
      return out;
    };
    return success({ ...ast, project: { ...ast.project, children: lower(ast.project.children.filter(d => d.keyword !== 'clip')) } });
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'diagnostics' in cause) return failure((cause as { diagnostics: import('@aether-fx/core').Diagnostic[] }).diagnostics);
    return failure([diagnostic((cause as { code?: string }).code ?? 'TEMPORAL_INVALID', String(cause), { range: owner.range })]);
  }
}
