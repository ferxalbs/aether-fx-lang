import { DEFAULT_LIMITS, diagnostic, failure, success } from '@aether-fx/core';
import type { Diagnostic, Limits, Result } from '@aether-fx/core';
import { parse } from './parser.js';
import type { Declaration, DocumentAST } from './parser.js';

export interface SourceOptions extends Partial<Limits> {
  sourceId?: string;
  /** Host owns resolution. Return a stable, canonical ID and text; no implicit IO. */
  resolveModule?: (specifier: string, importer: string) => { id: string; source: string };
}
/** Modules export declarations into a shared project scope. No headers, assets or execution are inferred. */
export function resolveModules(ast: DocumentAST, options: SourceOptions = {}, entryBytes = ast.sourceBytes ?? ast.project.range.end): Result<DocumentAST> {
  const active = new Set<string>([options.sourceId ?? '<text>']);
  const included = new Set<string>();
  let bytes = 0, owner = ast.project;
  try {
    const visit = (root: Declaration, importer: string, depth: number): Declaration[] => {
      if (depth > 32) throw new Error('LIMIT_EXCEEDED: Module depth exceeds 32');
      const out: Declaration[] = [];
      for (const d of root.children) {
        if (d.keyword !== 'import') { out.push(d); continue; }
        owner = d;
        if (d.children.length || d.fields.length !== 1 || d.fields[0]?.name !== 'src') throw new Error('MODULE_INVALID: import requires only src');
        const value = d.fields[0].value;
        if (value.kind !== 'scalar' || typeof value.value !== 'string' || !value.value || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/|\\)/.test(value.value) || value.value.includes('\0')) throw new Error('MODULE_INVALID: src must be a relative module path');
        if (!options.resolveModule) throw new Error('MODULE_RESOLVER_REQUIRED: Text compilation needs an explicit resolver');
        const resolved = options.resolveModule(value.value, importer);
        if (!resolved?.id || typeof resolved.source !== 'string') throw new Error('MODULE_INVALID: Resolver must return canonical id and source');
        if (active.has(resolved.id)) throw new Error('MODULE_CYCLE: ' + resolved.id);
        if (included.has(resolved.id)) continue;
        if (included.size >= 64) throw new Error('LIMIT_EXCEEDED: Module count exceeds 64');
        included.add(resolved.id);
        bytes += new TextEncoder().encode(resolved.source).length;
        if (bytes > (options.sourceBytes ?? DEFAULT_LIMITS.sourceBytes)) throw new Error('LIMIT_EXCEEDED: Combined module source exceeds byte limit');
        const parsed = parse(resolved.source, { ...options, sourceId: resolved.id });
        if (!parsed.ok) throw { diagnostics: parsed.diagnostics.map(e => ({ ...e, ...(e.range ? { range: { ...e.range, source: resolved.id } } : {}) })) };
        if (parsed.value.project.keyword !== 'module' || parsed.value.project.fields.length) throw new Error('MODULE_INVALID: Imported root must be module with declarations only');
        active.add(resolved.id);
        out.push(...visit(parsed.value.project, resolved.id, depth + 1));
        active.delete(resolved.id);
      }
      return out;
    };
    // Include the entry in the same byte budget as its dependencies.
    bytes = entryBytes;
    return success({ ...ast, project: { ...ast.project, children: visit(ast.project, options.sourceId ?? '<text>', 0) } });
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'diagnostics' in cause) return failure((cause as { diagnostics: Diagnostic[] }).diagnostics);
    const message = String(cause);
    return failure([diagnostic(/(MODULE_[A-Z_]+|LIMIT_EXCEEDED)/.exec(message)?.[1] ?? 'MODULE_READ', message, { range: owner.range })]);
  }
}
