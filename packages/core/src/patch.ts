import { compile, equalJSON } from './compile.js';
import { validate } from './validate.js';
import { diagnostic, failure, success } from './types.js';
import type { AssetManifest, FxDocument, Key, Result } from './types.js';
export type Collection = 'assets'|'shapes'|'parts'|'poses'|'drawings'|'actors'|'backgrounds'|'shots';
export type PatchOperation =
  | { op:'addNode'; collection:Collection; node:unknown }
  | { op:'removeNode'; collection:Collection; id:string }
  | { op:'updateProperty'; collection:Collection; id:string; path:string[]; value:unknown }
  | { op:'insertKey'; shot:string; key:Key };
export interface DocumentPatch { baseRevision:number; operations:PatchOperation[] }
export interface PatchResult { document:FxDocument; revision:number; affectedIds:string[]; dependencies:string[] }
export function applyPatch(document:FxDocument,patch:DocumentPatch,manifest:AssetManifest=[],options:{allowLockedAssetRevision?:boolean}={}): Result<PatchResult> {
  const existing=validate(document,manifest); if (existing.length) return failure(existing);
  if (!Number.isSafeInteger(patch.baseRevision)||patch.baseRevision!==document.revision) return failure([diagnostic('REVISION_CONFLICT','Patch baseRevision does not match document')]);
  if (!Array.isArray(patch.operations)||!patch.operations.length||patch.operations.length>10_000) return failure([diagnostic('PATCH_INVALID','Patch needs 1–10000 operations')]);
  const next=structuredClone(document), affected=new Set<string>();
  const collections:Collection[]=['assets','shapes','parts','poses','drawings','actors','backgrounds','shots'];
  try {
    for (const operation of patch.operations) {
      if (operation.op==='insertKey') {
        const shot=next.shots.find(s=>s.id===operation.shot); if (!shot) throw new Error('Unknown shot');
        shot.keys.push(structuredClone(operation.key)); affected.add(operation.shot); affected.add(operation.key.id); continue;
      }
      if (!collections.includes(operation.collection)) throw new Error('Unknown collection');
      const nodes=next[operation.collection] as {id:string}[];
      if (operation.op==='addNode') {
        if (!operation.node||typeof operation.node!=='object'||typeof (operation.node as {id?:unknown}).id!=='string') throw new Error('New node needs ID');
        const node=structuredClone(operation.node) as {id:string};
        if (nodes.some(n=>n.id===node.id)) throw new Error('Duplicate node ID');
        nodes.push(node); affected.add(node.id);
      } else if (operation.op==='removeNode'||operation.op==='updateProperty') {
        const index=nodes.findIndex(n=>n.id===operation.id); if (index<0) throw new Error('Unknown target ID');
        const node=nodes[index]!;
        if (operation.collection==='assets'&&(node as FxDocument['assets'][number]).locked&&!options.allowLockedAssetRevision) return failure([diagnostic('ASSET_LOCKED','Host must authorize revision of a locked asset',{id:operation.id})]);
        if (operation.op==='removeNode') nodes.splice(index,1);
        else {
          if (!Array.isArray(operation.path)||!operation.path.length||operation.path.length>64||operation.path.some(k=>['__proto__','prototype','constructor','id'].includes(k)||typeof k!=='string')) throw new Error('Invalid update path');
          let target:unknown=node;
          for (const key of operation.path.slice(0,-1)) {
            if (!target||typeof target!=='object'||!Object.hasOwn(target,key)) throw new Error('Unknown update path');
            target=(target as Record<string,unknown>)[key];
          }
          const key=operation.path.at(-1)!;
          if (!target||typeof target!=='object'||!Object.hasOwn(target,key)) throw new Error('Unknown update property');
          (target as Record<string,unknown>)[key]=structuredClone(operation.value);
        }
        affected.add(operation.id);
      } else throw new Error('Unknown patch operation');
    }
  } catch (cause) { return failure([diagnostic('PATCH_INVALID',cause instanceof Error?cause.message:'Invalid patch')]); }
  next.revision++;
  const compiled=compile(next,manifest); if (!compiled.ok) return compiled;
  // No partial mutation escapes: all operations were performed on the candidate copy.
  const dependencies=new Set<string>();
  for (const collection of collections) for (const node of next[collection]) {
    const original=(document[collection] as {id:string}[]).find(n=>n.id===node.id);
    if (!equalJSON(original,node)) dependencies.add(node.id);
    // References are IDs in JSON; a conservative dependency report is acceptable for v0.
    const contains=(value:unknown):boolean => typeof value==='string' ? [...affected].some(id=>value===id||value.startsWith(id+'.')) : Array.isArray(value) ? value.some(contains) : value&&typeof value==='object' ? Object.values(value).some(contains) : false;
    if (contains(node)) dependencies.add(node.id);
  }
  return success({document:next,revision:next.revision,affectedIds:[...affected],dependencies:[...dependencies]});
}
