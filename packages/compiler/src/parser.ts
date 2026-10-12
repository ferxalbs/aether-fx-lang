import { createToken, EmbeddedActionsParser, Lexer, EOF } from 'chevrotain';
import type { IToken } from 'chevrotain';
import { DEFAULT_LIMITS, diagnostic, failure, success } from '@aether-fx/core';
import type { Diagnostic, Result, SourceRange } from '@aether-fx/core';
export type AstValue =
  | { kind: 'scalar'; value: string | number | boolean | null; unit?: string; raw?: string; range: SourceRange }
  | { kind: 'reference'; value: string; range: SourceRange }
  | { kind: 'array'; items: AstValue[]; range: SourceRange }
  | { kind: 'object'; fields: AstField[]; range: SourceRange };
export interface AstField { name: string; value: AstValue; range: SourceRange }
export interface Declaration { keyword: string; id: string; fields: AstField[]; children: Declaration[]; range: SourceRange }
export interface DocumentAST { schemaVersion: 1; project: Declaration; sourceBytes?: number }
const Space = createToken({ name: 'Space', pattern: /\s+/, group: Lexer.SKIPPED });
const Comment = createToken({ name: 'Comment', pattern: /\/\/[^\r\n]*|\/\*[\s\S]*?\*\//, group: Lexer.SKIPPED, line_breaks: true });
const StringToken = createToken({ name: 'String', pattern: /"(?:[^"\\\r\n]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/ });
const NumberToken = createToken({ name: 'Number', pattern: /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/ });
const Identifier = createToken({ name: 'Identifier', pattern: /[A-Za-z][A-Za-z0-9_-]*/ });
const LBrace = createToken({ name: 'LBrace', pattern: /\{/ }), RBrace = createToken({ name: 'RBrace', pattern: /\}/ });
const LBracket = createToken({ name: 'LBracket', pattern: /\[/ }), RBracket = createToken({ name: 'RBracket', pattern: /\]/ });
const LParen = createToken({ name: 'LParen', pattern: /\(/ }), RParen = createToken({ name: 'RParen', pattern: /\)/ });
const Colon = createToken({ name: 'Colon', pattern: /:/ }), Semi = createToken({ name: 'Semi', pattern: /;/ }), Comma = createToken({ name: 'Comma', pattern: /,/ });
const At = createToken({ name: 'At', pattern: /@/ }), Dot = createToken({ name: 'Dot', pattern: /\./ });
const vocabulary = [Space, Comment, StringToken, NumberToken, Identifier, LBrace, RBrace, LBracket, RBracket, LParen, RParen, Colon, Semi, Comma, At, Dot];
const lexer = new Lexer(vocabulary, { ensureOptimizations: false });
function range(token: IToken, end: IToken = token): SourceRange { return { start: token.startOffset, end: Number.isFinite(end.endOffset) ? end.endOffset! + 1 : token.startOffset, line: token.startLine ?? 1, column: token.startColumn ?? 1 }; }
class Parser extends EmbeddedActionsParser {
  constructor() { super(vocabulary, { recoveryEnabled: false, maxLookahead: 3 }); this.performSelfAnalysis(); }
  path = this.RULE('path', () => {
    const first = this.CONSUME(Identifier); let value = first.image;
    this.MANY(() => { this.CONSUME(Dot); const next = this.CONSUME2(Identifier); this.ACTION(() => { value += '.' + next.image; }); });
    return value;
  });
  value = this.RULE('value', (): AstValue => this.OR([
    { ALT: () => { const token = this.CONSUME(StringToken); return this.ACTION(() => ({ kind: 'scalar' as const, value: JSON.parse(token.image) as string, range: range(token) })); } },
    { ALT: () => { const token = this.CONSUME(NumberToken); let unit: string | undefined, end = token; this.OPTION(() => { const u = this.CONSUME(Identifier); this.ACTION(() => { unit = u.image; end = u; }); }); return this.ACTION(() => ({ kind: 'scalar' as const, value: Number(token.image), raw: token.image, ...(unit ? { unit } : {}), range: range(token, end) })); } },
    { ALT: () => { const token = this.CONSUME2(Identifier); return this.ACTION(() => ({ kind: 'scalar' as const, value: token.image === 'true' ? true : token.image === 'false' ? false : token.image === 'null' ? null : token.image, range: range(token) })); } },
    { ALT: () => { const token = this.CONSUME(At); const value = this.SUBRULE(this.path); return this.ACTION(() => ({ kind: 'reference' as const, value, range: range(token, this.LA(0)) })); } },
    { ALT: () => { const token = this.CONSUME(LBracket); const items: AstValue[] = []; this.MANY_SEP({ SEP: Comma, DEF: () => { const item = this.SUBRULE(this.value); this.ACTION(() => items.push(item)); } }); const end = this.CONSUME(RBracket); return this.ACTION(() => ({ kind: 'array' as const, items, range: range(token, end) })); } },
    { ALT: () => { const token = this.CONSUME(LParen); const items: AstValue[] = []; this.MANY_SEP2({ SEP: Comma, DEF: () => { const item = this.SUBRULE2(this.value); this.ACTION(() => items.push(item)); } }); const end = this.CONSUME(RParen); return this.ACTION(() => ({ kind: 'array' as const, items, range: range(token, end) })); } },
    { ALT: () => { const token = this.CONSUME(LBrace); const fields: AstField[] = []; this.MANY(() => { const f = this.SUBRULE(this.field); this.ACTION(() => fields.push(f)); }); const end = this.CONSUME(RBrace); return this.ACTION(() => ({ kind: 'object' as const, fields, range: range(token, end) })); } }
  ]));
  field = this.RULE('field', () => {
    const token = this.OR([{ ALT: () => this.CONSUME(Identifier) }, { ALT: () => this.CONSUME(StringToken) }]);
    this.CONSUME(Colon); const value = this.SUBRULE(this.value); const end = this.CONSUME(Semi);
    return this.ACTION(() => ({ name: token.tokenType === StringToken ? JSON.parse(token.image) as string : token.image, value, range: range(token, end) }));
  });
  declaration = this.RULE('declaration', (): Declaration => {
    const keyword = this.CONSUME(Identifier); const id = this.SUBRULE(this.path); this.CONSUME(LBrace);
    const fields: AstField[] = [], children: Declaration[] = [];
    this.MANY(() => this.OR([
      { GATE: () => this.LA(2).tokenType === Colon || this.LA(1).tokenType === StringToken, ALT: () => { const field = this.SUBRULE(this.field); this.ACTION(() => fields.push(field)); } },
      { ALT: () => { const child = this.SUBRULE(this.declaration); this.ACTION(() => children.push(child)); } }
    ]));
    const end = this.CONSUME(RBrace);
    return this.ACTION(() => ({ keyword: keyword.image, id, fields, children, range: range(keyword, end) }));
  });
  document = this.RULE('document', () => { const project = this.SUBRULE(this.declaration); this.CONSUME(EOF); return this.ACTION(() => ({ schemaVersion: 1 as const, project })); });
}
const parser = new Parser();
export function parse(source: string, options: { sourceBytes?: number; depth?: number; sourceId?: string } = {}): Result<DocumentAST> {
  const failed = (diagnostics: Diagnostic[]): Result<DocumentAST> => failure(diagnostics.map(d =>
    options.sourceId && d.range ? { ...d, range: { ...d.range, source: options.sourceId } } : d));
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > (options.sourceBytes ?? DEFAULT_LIMITS.sourceBytes)) return failed([diagnostic('LIMIT_EXCEEDED', 'Source byte limit exceeded')]);
  const lexed = lexer.tokenize(source);
  if (lexed.errors.length) return failed(lexed.errors.map(e => diagnostic('LEX_ERROR', e.message, { range: { start: e.offset, end: e.offset + e.length, line: e.line ?? 1, column: e.column ?? 1 } })));
  let depth = 0;
  for (const token of lexed.tokens) {
    if ([LBrace, LBracket, LParen].includes(token.tokenType)) depth++;
    if (depth > (options.depth ?? DEFAULT_LIMITS.depth)) return failed([diagnostic('LIMIT_EXCEEDED', 'Source nesting limit exceeded', { range: range(token) })]);
    if ([RBrace, RBracket, RParen].includes(token.tokenType)) depth--;
  }
  parser.input = lexed.tokens;
  try {
    const ast = parser.document();
    if (parser.errors.length) return failed(parser.errors.map(e => {
      const lines = source.split(/\r\n|\r|\n/);
      const location = e.token.tokenType === EOF ? { start: source.length, end: source.length, line: lines.length, column: lines.at(-1)!.length + 1 } : range(e.token);
      return diagnostic('PARSE_ERROR', e.message, { range: location });
    }));
    if (options.sourceId) {
      const sourceId = options.sourceId;
      const mark = (value: unknown): void => {
        if (!value || typeof value !== 'object') return;
        if ('range' in value) (value as { range: SourceRange }).range.source = sourceId;
        for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(mark); else if (child && typeof child === 'object') mark(child);
      };
      mark(ast);
    }
    return success({...ast,sourceBytes:bytes});
  } catch (cause) { return failed([diagnostic('PARSE_ERROR', cause instanceof Error ? cause.message : 'Invalid source')]); }
}
export function print(ast: DocumentAST): string {
  function value(v: AstValue): string {
    if (v.kind === 'scalar') return JSON.stringify(v.value) + (v.unit ?? '');
    if (v.kind === 'reference') return '@' + v.value;
    if (v.kind === 'array') return '[' + v.items.map(value).join(', ') + ']';
    return '{ ' + v.fields.map(f => `${JSON.stringify(f.name)}: ${value(f.value)};`).join(' ') + ' }';
  }
  function declaration(d: Declaration, level: number): string {
    const pad = '  '.repeat(level);
    const lines = [`${pad}${d.keyword} ${d.id} {`, ...d.fields.map(f => `${pad}  ${JSON.stringify(f.name)}: ${value(f.value)};`), ...d.children.map(c => declaration(c, level + 1)), `${pad}}`];
    return lines.join('\n');
  }
  return declaration(ast.project, 0) + '\n';
}
