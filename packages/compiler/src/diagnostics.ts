import { diagnostic, failure, success } from '@aether-fx/core';
import type { Diagnostic, Result, SourceRange } from '@aether-fx/core';
import { parse } from './parser.js';
export interface TextEdit { range:SourceRange; expected:string; replacement:string }
export interface AuthorDiagnostic extends Diagnostic { canonicalPath:string; expected?:string; found?:string; edits?:TextEdit[] }
/** Missing final property semicolons have exactly one insertion; no units/values are inferred. */
export function safeEdits(source:string):TextEdit[]{
 const parsed=parse(source);if(parsed.ok)return [];
 const error=parsed.diagnostics[0];if(error?.code!=='PARSE_ERROR'||!error.range||!error.message.includes("token of type --> Semi <--"))return [];
 const at=error.range.start,edit={range:{...error.range,end:at},expected:'',replacement:';'};
 const candidate=source.slice(0,at)+';'+source.slice(at);
 return parse(candidate).ok?[edit]:[];
}
export function applySafeEdits(source:string,expectedSource:string,edits:TextEdit[]):Result<string>{
 if(source!==expectedSource)return failure([diagnostic('SOURCE_CHANGED','Source changed since diagnostics')]);
 const ordered=[...edits].sort((a,b)=>a.range.start-b.range.start);let previous=-1;
 for(const edit of ordered){if(!Number.isSafeInteger(edit.range.start)||!Number.isSafeInteger(edit.range.end)||edit.range.start<0||edit.range.end<edit.range.start||edit.range.end>source.length||edit.range.start<=previous||source.slice(edit.range.start,edit.range.end)!==edit.expected)return failure([diagnostic('EDIT_CONFLICT','Overlapping, invalid or stale edit')]);previous=edit.range.end;}
 let text=source;for(const edit of ordered.reverse())text=text.slice(0,edit.range.start)+edit.replacement+text.slice(edit.range.end);return success(text);
}
export function authorDiagnostics(source:string,diagnostics:Diagnostic[],sourceId?:string):AuthorDiagnostic[]{const edits=safeEdits(source);return diagnostics.map((d,i)=>({...d,canonicalPath:d.path??'/source',...(['UNIT_REQUIRED','UNIT_INVALID','SCHEMA_INVALID','PROPERTY_TYPE','REFERENCE_MISSING','PARSE_ERROR'].includes(d.code)?{expected:d.code==='PARSE_ERROR'?(/token of type --> (.*?) <--/.exec(d.message)?.[1]??d.message):d.message,found:d.range&&(!d.range.source||d.range.source===sourceId)?source.slice(d.range.start,d.range.end):'missing'}:{}),...(i===0&&edits.length&&(!d.range?.source||d.range.source===sourceId)?{edits}:{})}));}
