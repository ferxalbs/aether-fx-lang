import type { DrawList, Shape } from '@aether-fx/core';
export interface CanvasResources { images:Map<string,CanvasImageSource>; fonts:Map<string,string> }
export interface Renderer { render(list:DrawList):void; dispose():void }
/** Uses project coordinates scaled to the canvas backing dimensions. Ownership stays with caller. */
export function createRenderer(canvas:HTMLCanvasElement|OffscreenCanvas,resources:CanvasResources={images:new Map(),fonts:new Map()}):Renderer {
  const context=canvas.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;
  if (!context) throw new Error('Canvas 2D context unavailable');
  let disposed=false;
  function path(shape:Shape) {
    context!.beginPath();
    for(const contour of shape.contours){
      context!.moveTo(...contour.start);
      for(const segment of contour.segments)context!.bezierCurveTo(...segment.control1,...segment.control2,...segment.end);
      if(contour.closed)context!.closePath();
    }
  }
  return {
    render(list){
      if(disposed)throw new Error('Renderer disposed');
      const sx=canvas.width/list.viewport[0],sy=canvas.height/list.viewport[1];
      context.resetTransform();context.clearRect(0,0,canvas.width,canvas.height);
      for(const command of list.commands){
        context.save();
        try{
          context.setTransform(sx,0,0,sy,0,0);context.transform(...command.matrix);context.globalAlpha=command.opacity;
          const material=command.material;
          if(material.fill!==null)context.fillStyle=material.fill;
          if(material.stroke!==null)context.strokeStyle=material.stroke;
          context.lineWidth=material.strokeWidth;
          if(command.shape){path(command.shape);if(material.fill!==null)context.fill(material.fillRule);if(material.stroke!==null&&material.strokeWidth>0)context.stroke();}
          if(command.image){const image=resources.images.get(command.image.asset);if(!image)throw new Error(`Image not loaded: ${command.image.asset}`);context.drawImage(image,0,0,command.image.width,command.image.height);}
          if(command.text){const font=resources.fonts.get(command.text.font);if(!font)throw new Error(`Font not loaded: ${command.text.font}`);context.font=`${command.text.size}px "${font}"`;context.textBaseline='alphabetic';if(material.fill!==null)context.fillText(command.text.content,0,0);if(material.stroke!==null&&material.strokeWidth>0)context.strokeText(command.text.content,0,0);}
        }finally{context.restore();}
      }
    },
    dispose(){disposed=true;}
  };
}
