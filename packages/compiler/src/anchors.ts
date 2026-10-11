import { diagnostic, failure, success } from '@aether-fx/core';
import type { Result } from '@aether-fx/core';
import type { AstValue, Declaration } from './parser.js';
import { timeFrames } from './expand.js';
/** anchor beat { at: 1s; } / { after: @beat; offset: 100ms; }; key frame: @beat. */
export function resolveAnchors(shot:Declaration,fps:[number,number]):Result<Declaration>{
 const anchors=new Map<string,Declaration>(),times=new Map<string,number>(),stack=new Set<string>();
 const scalar=(v:AstValue|undefined):number=>{if(!v||v.kind!=='scalar'||typeof v.value!=='number'||!['f','s','ms'].includes(v.unit??''))throw Object.assign(new Error('Expected a time with f, s or ms'),{code:'UNIT_REQUIRED'});const n=timeFrames(v,fps);if(!Number.isSafeInteger(n))throw new Error('Frames must be integers');return n;};
 const get=(d:Declaration,key:string)=>d.fields.find(f=>f.name===key)?.value;
 let owner=shot;
 try{for(const a of shot.children.filter(c=>c.keyword==='anchor')){owner=a;if(anchors.has(a.id))throw new Error('Duplicate anchor');if(a.children.length||a.fields.some(f=>!['at','after','offset','repeatOffset'].includes(f.name))||a.fields.filter(f=>['at','after'].includes(f.name)).length!==1)throw new Error('anchor needs at OR after plus optional offset');anchors.set(a.id,a);}
 const visit=(id:string,depth=0):number=>{const a=anchors.get(id);if(!a)throw Object.assign(new Error('Missing anchor '+id),{code:'REFERENCE_MISSING'});owner=a;if(depth>32)throw Object.assign(new Error('Anchor depth exceeded'),{code:'LIMIT_EXCEEDED'});if(stack.has(id))throw Object.assign(new Error('Anchor cycle'),{code:'ANCHOR_CYCLE'});if(times.has(id))return times.get(id)!;stack.add(id);const after=get(a,'after');if(after&&after.kind!=='reference')throw new Error('after must reference anchor');const t=(after?.kind==='reference'?visit(after.value,depth+1):scalar(get(a,'at')))+(get(a,'offset')?scalar(get(a,'offset')):0)+a.fields.filter(f=>f.name==='repeatOffset').reduce((n,f)=>n+scalar(f.value),0);stack.delete(id);times.set(id,t);return t;};
 // Traverse every anchor before replacing keys, including unused cycles.
 for(const id of anchors.keys())visit(id);
 const duration=scalar(get(shot,'duration'));for(const [id,t] of times)if(t<0||t>duration){owner=anchors.get(id)!;throw Object.assign(new Error('Anchor outside shot'),{code:'FRAME_RANGE'});}
 return success({...shot,children:shot.children.filter(c=>c.keyword!=='anchor').map(c=>({...c,fields:c.fields.filter(f=>!['offset','repeatOffset'].includes(f.name)||!['key','morph','expose'].includes(c.keyword)).map(f=>{if(!['frame','start','end'].includes(f.name))return f;const shift=(get(c,'offset')?scalar(get(c,'offset')):0)+c.fields.filter(f=>f.name==='repeatOffset').reduce((n,f)=>n+scalar(f.value),0);if(f.value.kind!=='reference'&&!shift)return f;owner=c;const value=(f.value.kind==='reference'?visit(f.value.value):scalar(f.value))+shift;return {...f,value:{kind:'scalar' as const,value,raw:String(value),unit:'f',range:f.value.range}};})}))});
 }catch(cause){return failure([diagnostic((cause as {code?:string}).code??'ANCHOR_INVALID',String(cause),{range:owner.range,path:'/shots/'+shot.id})]);}
}
