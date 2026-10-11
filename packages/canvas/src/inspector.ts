import { matrixPoint } from '@aether-fx/core';
import type { DrawList, FxDocument, Vec2 } from '@aether-fx/core';
export interface OverlayOptions { nodes?: boolean; anchors?: boolean; layers?: boolean }
/** Diagnostic drawing only; no changes to evaluated state or export geometry. */
export function drawOverlays(canvas: HTMLCanvasElement, list: DrawList, document: FxDocument, options: OverlayOptions): void {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D unavailable');
  const sx=canvas.width/list.viewport[0],sy=canvas.height/list.viewport[1];
  ctx.save();
  try {
    ctx.resetTransform();ctx.font='11px sans-serif';ctx.lineWidth=1;
    for(const [order,command] of list.commands.entries()) {
      const point=(p:Vec2):Vec2=>{const q=matrixPoint(command.matrix,p);return [q[0]*sx,q[1]*sy];};
      const dot=(p:Vec2,color:string,label='')=>{const [x,y]=point(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();if(label)ctx.fillText(label,x+5,y-5);};
      if(options.nodes&&command.shape)for(const contour of command.shape.contours) {
        let start=contour.start;
        for(const segment of contour.segments) {
          const a=point(start),b=point(segment.control1),c=point(segment.end),d=point(segment.control2);
          ctx.strokeStyle='#cc368a';ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.moveTo(...c);ctx.lineTo(...d);ctx.stroke();
          dot(segment.control1,'#cc368a');dot(segment.control2,'#cc368a');dot(start,'#2459be',segment.id);start=segment.end;
        }
        if(!contour.closed)dot(start,'#2459be');
      }
      const part=document.parts.find(p=>p.id===command.id.split('.')[1]);
      if(options.anchors&&part){dot(part.pivot,'#e47700','pivot');for(const [id,p] of Object.entries(part.anchors??{}))dot(p,'#008768',id);}
      if(options.layers){const p=point(command.shape?.contours[0]?.start??[0,0]);ctx.fillStyle='#202830';ctx.fillText(`${order}: ${command.layer} ${command.id}`,p[0]+5,p[1]+14);}
    }
  }finally{ctx.restore();}
}
