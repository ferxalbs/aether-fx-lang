import { checkSchema, compile, DEFAULT_LIMITS, diagnostic, failure, IDENTITY, success } from '@aether-fx/core';
import type { AssetManifest, Diagnostic, FxDocument, Limits, PlaybackPlan, Result, SourceRange } from '@aether-fx/core';
import type { AstField, AstValue, Declaration, DocumentAST } from './parser.js';
import { parse } from './parser.js';

const frameFields=new Set(['frame','duration','start','end','offset','trimStart','hold']);
const badKeys=new Set(['__proto__','prototype','constructor']);
/** Follow canonical collection/field names back through DSL normalization. */
function schemaSourceRange(root:Declaration,path=''):SourceRange {
  const steps=path.split('/').slice(1);
  const collections:Record<string,string>={assets:'asset',shapes:'shape',parts:'part',poses:'pose',drawings:'drawing',actors:'actor',backgrounds:'background',contours:'contour',segments:'cubic',initial:'initial',keys:'key',morphs:'morph',exposures:'expose'};
  let node:Declaration|AstValue=root;
  for(let i=0;i<steps.length;i++) {
    let name=steps[i]!;
    if('keyword' in node) {
      if(name==='values'&&node.keyword==='initial')continue;
      if(name==='shots'&&node.keyword==='project') {
        const shot:Declaration|undefined=node.children.filter(d=>d.keyword==='scene').flatMap(d=>d.children.filter(c=>c.keyword==='shot'))[Number(steps[++i])];
        if(!shot)break;node=shot;continue;
      }
      if(name==='camera'&&node.keyword==='shot') {const camera:Declaration|undefined=node.children.find(d=>d.keyword==='camera');if(!camera)break;node=camera;continue;}
      if(name==='audio'&&node.keyword==='project') {const audio:Declaration|undefined=node.children.find(d=>d.keyword==='audio');if(!audio)break;node=audio;continue;}
      const keyword=collections[name];
      if(keyword&&node.children.some(d=>d.keyword===keyword)) {const child:Declaration|undefined=node.children.filter(d=>d.keyword===keyword)[Number(steps[++i])];if(!child)break;node=child;continue;}
      if(name==='schemaVersion'&&node.keyword==='project')name='version';
      if(name==='rotation'&&node.keyword==='key')name='rotationMode';
      const field:AstField|undefined=node.fields.find(f=>f.name===name);if(!field)break;node=field.value;
      if(name==='fps'&&node.kind==='array'&&steps[i+1]) {
        const index=steps[i+1]==='numerator'?0:steps[i+1]==='denominator'?1:-1;
        if(index>=0){i++;const item:AstValue|undefined=node.items[index];if(!item)break;node=item;}
      }
    } else if(node.kind==='array') {const item:AstValue|undefined=node.items[Number(name)];if(!item)break;node=item;}
    else if(node.kind==='object') {const field:AstField|undefined=node.fields.find(f=>f.name===name);if(!field)break;node=field.value;}
    else break;
  }
  return node.range;
}
export function normalize(ast:DocumentAST):Result<FxDocument> {
  const errors:Diagnostic[]=[];
  const fail=(code:string,message:string,range:SourceRange,id?:string)=>errors.push(diagnostic(code,message,{range,...(id?{id}:{})}));
  function convert(value:AstValue,property:string):unknown {
    if (value.kind==='scalar') {
      if (typeof value.value==='number') {
        if (!Number.isFinite(value.value)) fail('NUMBER_INVALID','Number must be finite',value.range);
        const unit=value.unit;
        if (frameFields.has(property)) {
          if (unit!=='f') fail('UNIT_REQUIRED',`${property} requires frame unit f`,value.range);
        } else if (property==='rotation') {
          if (unit!=='deg'&&unit!=='rad') fail('UNIT_REQUIRED','Rotation requires deg or rad',value.range);
        } else if (unit) fail('UNIT_INVALID',`Unexpected unit ${unit} for ${property}`,value.range);
        return unit==='deg'?value.value*Math.PI/180:value.value;
      }
      return value.value;
    }
    if (value.kind==='reference') return value.value;
    if (value.kind==='array') return value.items.map(v=>convert(v,''));
    return fields(value.fields);
  }
  function fields(list:AstField[]):Record<string,unknown> {
    const result:Record<string,unknown>={};
    const keyProperty=list.find(f=>f.name==='property')?.value;
    const property=keyProperty?.kind==='scalar'?keyProperty.value:undefined;
    for (const field of list) {
      if (badKeys.has(field.name)) { fail('UNSAFE_KEY','Forbidden property',field.range);continue; }
      if (Object.hasOwn(result,field.name)) {fail('DUPLICATE_PROPERTY','Duplicate property',field.range);continue;}
      result[field.name]=convert(field.value,field.name==='value'&&property==='rotation'?'rotation':field.name);
    }
    return result;
  }
  function allowed(d:Declaration,names:string[],children:string[]=[]):Record<string,unknown> {
    const f=fields(d.fields);
    for (const field of d.fields) if (!names.includes(field.name)) fail('PROPERTY_UNKNOWN',`Unknown ${d.keyword} property ${field.name}`,field.range,d.id);
    for (const child of d.children) if (!children.includes(child.keyword)) fail('DECLARATION_INVALID',`${child.keyword} is not allowed inside ${d.keyword}`,child.range,child.id);
    return f;
  }
  function transform(value:unknown):unknown { return value&&typeof value==='object'&&!Array.isArray(value)?{...IDENTITY,...value}:value===undefined?{...IDENTITY}:value; }
  const root=ast.project;
  if (root.keyword!=='project') fail('PROJECT_REQUIRED','Root declaration must be project',root.range);
  const header=allowed(root,['version','revision','viewport','fps'],['asset','shape','part','pose','drawing','actor','background','scene','audio']);
  const fps=header.fps;
  const result:Record<string,unknown>={schemaVersion:header.version??1,revision:header.revision??0,id:root.id,viewport:header.viewport,fps:Array.isArray(fps)?{numerator:fps[0],denominator:fps[1]}:fps,assets:[],shapes:[],parts:[],poses:[],drawings:[],actors:[],backgrounds:[],shots:[],audio:null};
  function append(collection:string,value:unknown){ (result[collection] as unknown[]).push(value); }
  for (const d of root.children) {
    if (d.keyword==='asset') {
      const f=allowed(d,['version','kind','src','locked']); append('assets',{id:d.id,version:1,locked:false,...f});
    } else if (d.keyword==='shape') {
      allowed(d,[],['contour']);
      const contours=d.children.filter(c=>c.keyword==='contour').map(c=>{
        const f=allowed(c,['start','closed'],['cubic']);
        return {id:c.id,closed:true,...f,segments:c.children.filter(s=>s.keyword==='cubic').map(s=>({id:s.id,...allowed(s,['control1','control2','end'])}))};
      });
      append('shapes',{id:d.id,contours});
    } else if (d.keyword==='part') {
      const f=allowed(d,['parent','pivot','transform','layer','shape','material','text','image']);
      const material=f.material;
      append('parts',{id:d.id,parent:null,pivot:[0,0],layer:0,shape:null,text:null,image:null,...f,transform:transform(f.transform),material:material&&typeof material==='object'&&!Array.isArray(material)?{fill:'#000000',stroke:null,strokeWidth:0,fillRule:'nonzero',...material}:material===undefined?{fill:'#000000',stroke:null,strokeWidth:0,fillRule:'nonzero'}:material});
    } else if (d.keyword==='actor') {
      const f=allowed(d,['parts','transform','parent','layer']); append('actors',{id:d.id,parent:null,layer:0,...f,transform:transform(f.transform)});
    } else if (d.keyword==='pose'||d.keyword==='drawing') {
      append(d.keyword==='pose'?'poses':'drawings',{id:d.id,...allowed(d,['parts'])});
    } else if (d.keyword==='background') {
      append('backgrounds',{id:d.id,...allowed(d,['actor','parallax'])});
    } else if (d.keyword==='audio') {
      if (result.audio!==null) fail('AUDIO_MULTIPLE','Only one audio track is supported',d.range,d.id);
      result.audio={offset:0,trimStart:0,gain:1,...allowed(d,['asset','offset','trimStart','duration','gain'])};
    } else if (d.keyword==='scene') {
      allowed(d,[],['shot']);
      for (const s of d.children.filter(c=>c.keyword==='shot')) {
        const f=allowed(s,['duration'],['initial','key','morph','expose','camera']);
        const shot:Record<string,unknown>={id:s.id,...f,initial:[],keys:[],morphs:[],exposures:[],camera:{x:0,y:0,scaleX:1,scaleY:1,rotation:0}};
        let cameraSeen=false;
        for (const c of s.children) {
          if (c.keyword==='initial') (shot.initial as unknown[]).push({target:c.id,values:allowed(c,['x','y','scaleX','scaleY','rotation','opacity','visible','layer','parent','shape'])});
          else if (c.keyword==='key') {
            const k=allowed(c,['target','property','frame','value','easing','rotationMode','hold']);
            const {rotationMode,...rest}=k;
            (shot.keys as unknown[]).push({id:c.id,easing:'linear',rotation:rotationMode??'direct',hold:1,...rest});
          } else if (c.keyword==='morph') (shot.morphs as unknown[]).push({id:c.id,easing:'linear',...allowed(c,['actor','from','to','start','end','easing'])});
          else if (c.keyword==='expose') (shot.exposures as unknown[]).push({id:c.id,...allowed(c,['actor','drawing','start','end'])});
          else if (c.keyword==='camera') {
            if (cameraSeen) fail('CAMERA_MULTIPLE','Only one camera declaration per shot',c.range,c.id);
            cameraSeen=true; shot.camera={x:0,y:0,scaleX:1,scaleY:1,rotation:0,...allowed(c,['x','y','scaleX','scaleY','rotation'])};
          }
        }
        append('shots',shot);
      }
    }
  }
  if (errors.length) return failure(errors);
  const invalid=checkSchema(result,'document');
  if (invalid.length) return failure(invalid.map(e=>({...e,range:schemaSourceRange(root,e.code==='SCHEMA_VERSION'?'/schemaVersion':e.path)})));
  return success(result as unknown as FxDocument);
}
export function compileSource(source:string,manifest:AssetManifest=[],options:Partial<Limits>={}):Result<PlaybackPlan> {
  const ast=parse(source,{sourceBytes:options.sourceBytes??DEFAULT_LIMITS.sourceBytes,depth:options.depth??DEFAULT_LIMITS.depth});if (!ast.ok) return ast;
  const document=normalize(ast.value);if (!document.ok) return document;
  const plan=compile(document.value,manifest,options);
  if (!plan.ok) {
    const declarations:Declaration[]=[];
    const visit=(d:Declaration)=>{declarations.push(d);d.children.forEach(visit);};visit(ast.value.project);
    return failure(plan.diagnostics.map(e=>({...e,range:declarations.find(d=>d.id===e.id)?.range??ast.value.project.range})));
  }
  return plan;
}
