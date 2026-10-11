/** Intern repeated immutable JSON schema rules without changing the public schema.
 * Only private runtime rules share identity; the checker never mutates them.
 */
export function schemaCode(definitions){
 const counts=new Map(),names=new Map(),declarations=[];
 // A repeated subtree is rendered once. Counting its children again creates
 // aliases used only by that one declaration, rather than removing duplication.
 const count=value=>{if(value&&typeof value==='object'){const key=JSON.stringify(value);counts.set(key,(counts.get(key)??0)+1);if(counts.get(key)>1)return;for(const child of Object.values(value))count(child);}};
 count(definitions);
 const render=value=>{
  if(!value||typeof value!=='object')return JSON.stringify(value);
  const key=JSON.stringify(value);
  if(names.has(key))return names.get(key);
  const expression=Array.isArray(value)?'['+value.map(render).join(',')+']':'{'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+':'+render(v)).join(',')+'}';
  if(counts.get(key)>1&&key.length>30){const name='rule'+names.size;names.set(key,name);declarations.push(`const ${name}=${expression};`);return name;}
  return expression;
 };
 const expression=render(definitions);
 return declarations.join('\n')+'\nconst schema={$defs:'+expression+'};';
}
