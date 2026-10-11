// Deterministic original cubic artwork, PNG paper texture and PCM soundtrack.
// This is the fixture authoring source; the emitted .afx is independently parsed.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
const directory='fixtures/short',assetDir=`${directory}/assets`;
const declarations=[];
const round=n=>Math.round(n*1000)/1000;
const ref=id=>'@'+id;
const raw=value=>({raw:value});
const frames=new Set(['frame','duration','start','end','offset','trimStart','hold']);
function value(v,key=''){
  if(v&&typeof v==='object'&&'raw' in v)return v.raw;
  if(typeof v==='string')return v.startsWith('@')?v:JSON.stringify(v);
  if(typeof v==='number')return String(round(v))+(frames.has(key)?'f':key==='rotation'?'rad':'');
  if(Array.isArray(v))return '('+v.map(x=>value(x)).join(', ')+')';
  if(v&&typeof v==='object')return '{ '+Object.entries(v).map(([k,x])=>`${k}: ${value(x,k)};`).join(' ')+' }';
  return JSON.stringify(v);
}
function declaration(keyword,id,fields={},children=[]){return `${keyword} ${id} {\n${Object.entries(fields).map(([k,v])=>`  ${k}: ${value(v,k)};`).join('\n')}\n${children.map(c=>c.split('\n').map(l=>'  '+l).join('\n')).join('\n')}\n}`;}
function contour(id,points,closed=true,tension=0.75){
  const children=[];
  for(let i=0;i<(closed?points.length:points.length-1);i++){
    const a=points[i],b=points[(i+1)%points.length],before=points[(i-1+points.length)%points.length],after=points[(i+2)%points.length];
    const c1=tension===0?[a[0]+(b[0]-a[0])/3,a[1]+(b[1]-a[1])/3]:[a[0]+(b[0]-before[0])*tension/6,a[1]+(b[1]-before[1])*tension/6];
    const c2=tension===0?[a[0]+2*(b[0]-a[0])/3,a[1]+2*(b[1]-a[1])/3]:[b[0]-(after[0]-a[0])*tension/6,b[1]-(after[1]-a[1])*tension/6];
    children.push(declaration('cubic','s'+i,{control1:c1,control2:c2,end:b}));
  }
  return declaration('contour',id,{start:points[0],closed},children);
}
function polygon(id,points,tension=0.7){declarations.push(declaration('shape',id,{},[contour('outline',points,true,tension)]));return id;}
function ellipse(id,cx,cy,rx,ry){return polygon(id,Array.from({length:8},(_,i)=>[cx+rx*Math.cos(i*Math.PI/4),cy+ry*Math.sin(i*Math.PI/4)]),1.15);}
function rectangle(id,x,y,w,h){return polygon(id,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],0);}
function part(id,shape,fill,layer=0,transform={},extra={}){
  declarations.push(declaration('part',id,{...(shape?{shape:ref(shape)}:{}),material:{fill,stroke:null,strokeWidth:0},layer,transform,...extra}));return id;
}
function actor(id,parts,x=0,y=0,layer=0){declarations.push(declaration('actor',id,{parts:parts.map(ref),transform:{x,y},layer}));}
function key(id,target,property,frame,v,extras={}){return declaration('key',id,{target:ref(target),property,frame,value:property==='rotation'?raw(`${round(v)}rad`):v,...extras});}
function initials(target,fields){return declaration('initial',target,fields);}
function text(id,content,x,y,size,color,layer=100){part(id,null,color,0,{x,y},{text:{content,font:ref('nunito'),size}});actor(id,[id],0,0,layer);}
// Declared assets, loaded explicitly by browser/Node adapters.
declarations.push(declaration('asset','nunito',{kind:'font',src:'assets/Nunito.ttf',version:1,locked:true}));
declarations.push(declaration('asset','paper',{kind:'image',src:'assets/paper.png',version:1,locked:true}));
declarations.push(declaration('asset','score',{kind:'audio',src:'assets/score.wav',version:1,locked:true}));
const colors={wall:'#efe5d3',ink:'#3f354d',floor:'#d2bda9',teal:'#588f91',deep:'#315f68',rose:'#bd6863',skin:'#edb68e',hair:'#49354d',gold:'#f1b955',cream:'#fff4cf'};
// Three separately instanced/parallax background layers.
part('wall',rectangle('wallShape',-150,-150,1650,1000),colors.wall);
part('floor',rectangle('floorShape',-150,605,1650,300),colors.floor,1);
part('baseboard',rectangle('baseboardShape',-150,594,1650,12),'#ae8e80',2);
actor('room',['wall','floor','baseboard']);
declarations.push(declaration('background','wallDepth',{actor:ref('room'),parallax:0}));
part('windowFrame',polygon('windowFrameShape',[[112,184],[155,135],[352,135],[396,184],[396,416],[112,416]],0.5),'#aa8271');
part('windowGlass',polygon('windowGlassShape',[[130,190],[170,155],[335,155],[377,190],[377,395],[130,395]],0.4),'#acd0c8',1);
part('hills',polygon('hillsShape',[[130,345],[198,297],[259,327],[311,272],[377,310],[377,395],[130,395]],0.3),'#81aaa5',2);
part('windowDivider',rectangle('windowDividerShape',245,155,13,250),'#cda68d',3);
part('windowRail',rectangle('windowRailShape',128,276,250,10),'#cda68d',3);
actor('window',['windowFrame','windowGlass','hills','windowDivider','windowRail']);
declarations.push(declaration('background','windowDepth',{actor:ref('window'),parallax:0.25}));
part('shelf',rectangle('shelfShape',840,294,268,14),'#86655f');
part('pictureFrame',rectangle('pictureFrameShape',885,177,112,100),'#9b7366',1);
part('picture',null,null,2,{x:892,y:184},{image:{asset:ref('paper'),width:98,height:86}});
part('pot',polygon('potShape',[[1022,251],[1072,251],[1065,293],[1030,293]],0.25),'#be7a64',1);
part('leaves',polygon('leavesShape',[[1047,253],[1023,220],[1013,191],[1041,212],[1047,242],[1060,201],[1084,179],[1074,225],[1054,253]],0.6),colors.deep,2);
actor('shelf',['shelf','pictureFrame','picture','pot','leaves']);
declarations.push(declaration('background','shelfDepth',{actor:ref('shelf'),parallax:0.5}));
// Ground shadow and hand-built table.
part('shadow',ellipse('shadowShape',449,626,131,16),'#b59687');actor('shadow',['shadow'],0,0,10);
part('tableLegs',polygon('tableLegShape',[[660,502],[680,502],[675,646],[655,646]],0),'#7b5860');
part('tableOtherLeg',polygon('tableOtherLegShape',[[907,502],[927,502],[939,646],[919,646]],0),'#7b5860');
part('tableTop',polygon('tableTopShape',[[607,468],[973,468],[1000,491],[585,491]],0.1),'#b68169',1);
part('tableEdge',rectangle('tableEdgeShape',585,491,415,17),'#8e5d5c',2);
actor('table',['tableLegs','tableOtherLeg','tableTop','tableEdge'],0,0,40);
// A twelve-part character, with hand parented to the front arm.
part('backArm',polygon('backArmShape',[[-52,18],[-92,33],[-103,86],[-75,116],[-51,100],[-62,78],[-59,54]],0.7),colors.deep,1);
part('legs',polygon('legsShape',[[-44,122],[42,122],[48,229],[15,236],[2,166],[-7,238],[-41,234]],0.45),colors.ink,2);
part('shoes',polygon('shoesShape',[[-43,224],[-11,225],[-6,246],[-58,246],[-58,236],[-43,231]],0.35),colors.deep,3);
// Both shoes are contours in the same semantic part.
declarations[declarations.length-2]=declaration('shape','shoesShape',{},[contour('outline',[[-43,224],[-11,225],[-6,246],[-58,246],[-58,236],[-43,231]],true,0.35),contour('right',[[13,225],[43,222],[52,232],[68,236],[68,246],[10,246]],true,0.35)]);
part('body',polygon('bodyShape',[[-30,-13],[29,-13],[62,22],[65,91],[50,145],[-54,145],[-63,80],[-59,27]],0.9),colors.teal,4);
part('collar',polygon('collarShape',[[-34,-14],[32,-14],[35,11],[3,31],[-34,11]],0.5),colors.gold,5);
part('head',polygon('headShape',[[-44,-175],[-5,-191],[41,-168],[54,-122],[41,-76],[10,-60],[-30,-72],[-54,-112]],1),colors.skin,6);
part('hair',polygon('hairShape',[[-54,-124],[-65,-165],[-43,-199],[6,-208],[43,-185],[58,-145],[26,-156],[4,-176],[-17,-147],[-40,-143]],0.85),colors.hair,7);
const eyeOpen=declaration('shape','eyeOpen',{},[contour('left',[[-32,-126],[-23,-137],[-14,-128],[-21,-113]],true,0.9),contour('right',[[8,-129],[18,-140],[28,-130],[21,-116]],true,0.9)]);
const eyeClosed=declaration('shape','eyeClosed',{},[contour('left',[[-32,-126],[-23,-125],[-14,-128],[-21,-127]],true,0.7),contour('right',[[8,-129],[18,-128],[28,-130],[21,-129]],true,0.7)]);
declarations.push(eyeOpen,eyeClosed);part('eyes','eyeOpen',colors.ink,8);
part('nose',polygon('noseShape',[[0,-126],[9,-106],[-2,-101]],0.25),'#c98675',9);
// Matching semantic mouth curve; the smile is a genuine control-point morph.
const mouthShape=(id,depth)=>declaration('shape',id,{},[declaration('contour','mouth',{start:[-13,-88],closed:false},[declaration('cubic','smile',{control1:[-7,-88+depth],control2:[11,-90+depth],end:[17,-91]})])]);
declarations.push(mouthShape('mouthNeutral',2),mouthShape('mouthSmile',15));
part('mouth','mouthNeutral',null,10,{}, {material:{fill:null,stroke:colors.ink,strokeWidth:3}});
const armPoints={armRest:[[0,-16],[32,-2],[61,54],[111,66],[128,85],[114,103],[56,106],[-4,36]],armReach:[[0,-16],[52,-12],[106,-10],[217,-35],[238,-18],[223,-1],[115,20],[-4,36]],armLift:[[0,-16],[30,-30],[55,-62],[116,-112],[138,-94],[120,-75],[70,-35],[-4,36]]};
for(const [id,points] of Object.entries(armPoints))polygon(id,points,0.7);
part('frontArm','armRest',colors.teal,11,{x:45,y:10});
part('hand',polygon('handShape',[[-15,-10],[-5,-18],[4,-11],[12,-15],[17,-3],[13,11],[-1,17],[-14,8]],0.75),colors.skin,12,{x:115,y:85},{parent:ref('frontArm')});
actor('hero',['backArm','legs','shoes','body','collar','head','hair','eyes','nose','mouth','frontArm','hand'],420,380,20);
// Lantern has a hollow cubic handle, glass, base and amber light.
part('lanternBody',polygon('lanternShape',[[-25,2],[25,2],[31,58],[19,72],[-20,72],[-32,58]],0.55),colors.gold);
part('lanternGlass',polygon('lanternGlassShape',[[-16,12],[16,12],[19,54],[-19,54]],0.3),colors.cream,1);
part('lanternBase',rectangle('lanternBaseShape',-28,65,56,12),'#94665c',2);
part('lanternHandle',null,null,3,{}, {shape:ref(polygon('handleShape',[[-15,1],[-14,-20],[0,-27],[14,-20],[15,1],[9,1],[8,-15],[0,-20],[-8,-15],[-9,1]],0.5)),material:{fill:'#8e655b',stroke:null,strokeWidth:0}});
actor('lantern',['lanternBody','lanternGlass','lanternBase','lanternHandle'],690,392,60);
text('title','THE LITTLE LIGHT',78,80,30,colors.ink);
text('subtitle','A quiet moment, drawn in curves.',80,111,18,'#866c73');
text('caption','Notice.',81,680,25,colors.ink);
text('captionReach','Reach. Hold.',81,680,25,colors.ink);
text('captionClose','Keep a little light.',81,680,25,colors.ink);
// A small visual pulse accompanies each identifiable WAV marker.
part('syncPulse',rectangle('pulseShape',0,0,28,8),colors.gold);actor('sync',['syncPulse'],1170,82,120);
// Four explicit partial poses. Endpoint geometry keeps contour and segment IDs.
for(const [id,shape,x,y,smile] of [['idle','armRest',115,85,false],['reach','armReach',225,-18,false],['lift','armLift',120,-95,false],['smile','armLift',120,-95,true]]){
  declarations.push(declaration('pose',id,{parts:{frontArm:{shape:ref(shape)},hand:{transform:{x,y}},mouth:{shape:ref(smile?'mouthSmile':'mouthNeutral')}}}));
}
declarations.push(declaration('drawing','eyesOpen',{parts:{eyes:ref('eyeOpen')}}),declaration('drawing','eyesClosed',{parts:{eyes:ref('eyeClosed')}}));
const blink=(id,start)=>declaration('expose',id,{actor:ref('hero'),drawing:ref('eyesClosed'),start,end:start+3});
const pulse=[key('pulseOn','sync','visible',24,true),key('pulseOff','sync','visible',27,false)];
const first=[initials('sync',{visible:false}),initials('captionReach',{visible:false}),initials('captionClose',{visible:false}),...pulse];
for(const [id,frame,y] of [['b0',0,380],['b1',36,377],['b2',72,380],['b3',108,377],['b4',143,380]])first.push(key(id,'hero','y',frame,y,{easing:[0.42,0,0.58,1]}));
first.push(key('look0','hero.eyes','x',0,0,{hold:2}),key('look1','hero.eyes','x',72,5,{hold:2}),blink('firstBlink',103),declaration('camera','wide',{x:0,y:0}));
const second=[initials('caption',{visible:false}),initials('captionReach',{visible:true}),initials('sync',{visible:false}),...pulse,declaration('morph','reachMotion',{actor:ref('hero'),from:ref('idle'),to:ref('reach'),start:0,end:60,easing:[0.4,0,0.2,1]}),declaration('morph','liftMotion',{actor:ref('hero'),from:ref('reach'),to:ref('lift'),start:72,end:130,easing:[0.4,0,0.2,1]}),key('armOcclusion','hero.frontArm','layer',50,50),key('handOcclusion','hero.hand','layer',50,55),key('contact','lantern','parent',60,ref('hero.hand')),key('anchorX','lantern','x',60,0),key('anchorY','lantern','y',60,20),blink('reachBlink',166),declaration('camera','reachCamera',{x:0,y:0}),key('camera0','camera','x',0,0),key('camera1','camera','x',150,20)];
// At the contact key x/y must be discrete jumps, not an interpolation from frame zero.
// These tracks have no earlier keys, so authored initial positions hold until frame 60.
const closeCamera={x:245,y:105,scaleX:0.62,scaleY:0.62};
const third=[initials('captionReach',{visible:false}),initials('captionClose',{visible:true,x:245,y:105,scaleX:0.62,scaleY:0.62}),initials('title',{visible:false}),initials('subtitle',{visible:false}),initials('sync',{visible:false,x:970.4,y:155.84,scaleX:0.62,scaleY:0.62}),...pulse,declaration('camera','close',closeCamera),declaration('morph','expression',{actor:ref('hero'),from:ref('lift'),to:ref('smile'),start:12,end:72,easing:[0.4,0,0.2,1]}),blink('closeBlink',91),key('gaze0','hero.eyes','x',0,5,{hold:2}),key('gaze1','hero.eyes','x',36,1,{hold:2})];
declarations.push(declaration('scene','moment',{},[declaration('shot','notice',{duration:144},first),declaration('shot','reachAndLift',{duration:192},second),declaration('shot','keep',{duration:144},third)]));
declarations.push(declaration('audio','soundtrack',{asset:ref('score'),offset:0,trimStart:0,duration:480,gain:1}));
const source='// Original illustrated acceptance short. Rebuild: node scripts/create-short.mjs\n'+declaration('project','littleLight',{version:1,viewport:[1280,720],fps:[24,1]},declarations)+'\n';
await writeFile(`${directory}/little-light.afx`,source);
// PNG: an original woven-paper landscape for the room's framed print.
const crc32=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(name,data)=>{const n=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([n,data])));return Buffer.concat([size,n,data,crc]);};
const header=Buffer.alloc(13);header.writeUInt32BE(128);header.writeUInt32BE(128,4);header[8]=8;header[9]=2;
const pixels=Buffer.alloc(128*(1+128*3));
for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const hue=y>85+12*Math.sin(x/24)?[88,143,145]:y>65+16*Math.cos(x/30)?[143,169,154]:[238,218,175];
  const grain=(x*17+y*31)%7-3,index=y*385+1+x*3;hue.forEach((c,i)=>pixels[index+i]=c+grain);
}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
await writeFile(`${assetDir}/paper.png`,png);
// 48 kHz, stereo, 16-bit PCM. Original quiet plucks plus distinct sync pulses.
const sampleRate=48000,samples=sampleRate*20,pcm=Buffer.alloc(samples*4),markers=[{frame:24,frequency:880},{frame:168,frequency:1320},{frame:360,frequency:1760}];
const notes=[220,261.626,329.628,293.665,196,261.626,329.628,440];
for(let i=0;i<samples;i++){
  const t=i/sampleRate,note=Math.floor(t/2.5),phase=t%2.5;
  let sound=0.035*Math.exp(-phase*1.8)*(Math.sin(2*Math.PI*notes[note]*t)+0.3*Math.sin(4*Math.PI*notes[note]*t));
  for(const m of markers){const delta=t-m.frame/24;if(delta>=0&&delta<0.125)sound+=0.48*Math.min(1,delta/0.001)*Math.min(1,(0.125-delta)/0.01)*Math.sin(2*Math.PI*m.frequency*delta);}
  const sample=Math.round(Math.max(-1,Math.min(1,sound))*32767);pcm.writeInt16LE(sample,i*4);pcm.writeInt16LE(sample,i*4+2);
}
const wavHeader=Buffer.alloc(44);wavHeader.write('RIFF');wavHeader.writeUInt32LE(36+pcm.length,4);wavHeader.write('WAVEfmt ',8);wavHeader.writeUInt32LE(16,16);wavHeader.writeUInt16LE(1,20);wavHeader.writeUInt16LE(2,22);wavHeader.writeUInt32LE(sampleRate,24);wavHeader.writeUInt32LE(sampleRate*4,28);wavHeader.writeUInt16LE(4,32);wavHeader.writeUInt16LE(16,34);wavHeader.write('data',36);wavHeader.writeUInt32LE(pcm.length,40);
await writeFile(`${assetDir}/score.wav`,Buffer.concat([wavHeader,pcm]));
const manifest=[];
for(const [id,kind,filename,metadata] of [['nunito','font','Nunito.ttf',{}],['paper','image','paper.png',{width:128,height:128}],['score','audio','score.wav',{duration:20,sampleRate,channels:2}]]){
 const bytes=await readFile(`${assetDir}/${filename}`);manifest.push({id,kind,version:1,hash:createHash('sha256').update(bytes).digest('hex'),...metadata});
}
await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
await writeFile(`${directory}/sync-markers.json`,JSON.stringify({fps:{numerator:24,denominator:1},sampleRate,markers,visual:{target:'sync.syncPulse',projectPixels:{wide:[1184,86],second:[1180.8,86],close:[1184,86]}},audioPadding:'Opus decoder must honor pre-skip; report measured padding explicitly.'},null,2)+'\n');
console.log(`Created ${source.length} source characters, 12 character parts, 480 frames and ${pcm.length} PCM bytes`);
