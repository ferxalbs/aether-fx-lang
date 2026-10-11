import { evaluate, frameSeconds } from '@aether-fx/core';
import type { PlaybackPlan } from '@aether-fx/core';
import { createRenderer } from './renderer.js';
import type { CanvasResources } from './renderer.js';
export interface Player {
  play():Promise<void>;pause():void;seekFrame(frame:number):void;setPlaybackRate(rate:number):void;
  getCurrentFrame():number;getStats():{droppedFrames:number;renderedFrames:number};resize(width:number,height:number,dpr?:number):void;dispose():void;
}
export function createPlayer(canvas:HTMLCanvasElement,plan:PlaybackPlan,resources:CanvasResources&{audio?:Map<string,AudioBuffer>}={images:new Map(),fonts:new Map()}):Player {
  const renderer=createRenderer(canvas,resources);
  let frame=0,baseFrame=0,anchor=0,audioAnchor=0,rate=1,playing=false,disposed=false,request=0,epoch=0,droppedFrames=0,renderedFrames=0;
  let audioContext:AudioContext|undefined,source:AudioBufferSourceNode|undefined,gain:GainNode|undefined;
  const assert=()=>{if(disposed)throw new Error('Player disposed');};
  const position=()=>baseFrame+(audioContext?audioContext.currentTime-audioAnchor:(performance.now()-anchor)/1000)*plan.document.fps.numerator/plan.document.fps.denominator*rate;
  const current=()=>Math.min(plan.duration-1,Math.floor(position()));
  const draw=()=>{renderer.render(evaluate(plan,{frame}));renderedFrames++;};
  const stopAudio=()=>{if(source){source.stop();source.disconnect();source=undefined;}if(gain){gain.disconnect();gain=undefined;}};
  const startAudio=()=>{
    stopAudio();const track=plan.document.audio;
    if(!audioContext||!track)return;
    const buffer=resources.audio?.get(track.asset);if(!buffer)throw new Error(`Audio not loaded: ${track.asset}`);
    const now=frameSeconds(baseFrame,plan.document.fps),offset=frameSeconds(track.offset,plan.document.fps),duration=frameSeconds(track.duration,plan.document.fps);
    if(now>=offset+duration)return;
    const elapsed=Math.max(0,now-offset),delay=Math.max(0,offset-now)/rate;
    source=audioContext.createBufferSource();gain=audioContext.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=track.gain;source.connect(gain);gain.connect(audioContext.destination);
    source.start(audioContext.currentTime+delay,frameSeconds(track.trimStart,plan.document.fps)+elapsed,duration-elapsed);
  };
  const tick=()=>{
    if(!playing||disposed)return;
    const absolute=position();
    const next=Math.min(plan.duration-1,Math.floor(absolute));
    if(next!==frame){droppedFrames+=Math.max(0,next-frame-1);frame=next;draw();}
    if(absolute>=plan.duration){playing=false;stopAudio();return;}
    request=requestAnimationFrame(tick);
  };
  const resetClock=()=>{baseFrame=frame;anchor=performance.now();audioAnchor=audioContext?.currentTime??0;if(playing)startAudio();};
  draw();
  return {
    async play(){
      assert();if(playing)return;const generation=++epoch;
      if(plan.document.audio){
        if(!resources.audio?.has(plan.document.audio.asset))throw new Error('Audio resources required before play');
        audioContext??=new AudioContext();await audioContext.resume();
        if(disposed||generation!==epoch)return;
      }
      playing=true;resetClock();request=requestAnimationFrame(tick);
    },
    pause(){assert();epoch++;if(playing)frame=current();playing=false;cancelAnimationFrame(request);stopAudio();draw();},
    seekFrame(value){assert();if(!Number.isSafeInteger(value)||value<0||value>=plan.duration)throw new RangeError('Seek frame outside movie');frame=value;resetClock();draw();},
    setPlaybackRate(value){assert();if(!Number.isFinite(value)||value<=0)throw new RangeError('Playback rate must be positive');if(playing)frame=current();rate=value;resetClock();},
    getCurrentFrame(){assert();return playing?current():frame;},
    getStats(){assert();return {droppedFrames,renderedFrames};},
    resize(width,height,dpr=globalThis.devicePixelRatio??1){assert();if(![width,height,dpr].every(n=>Number.isFinite(n)&&n>0)||width*dpr>8192||height*dpr>8192)throw new RangeError('Invalid canvas size');canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));draw();},
    dispose(){if(disposed)return;epoch++;playing=false;disposed=true;cancelAnimationFrame(request);stopAudio();void audioContext?.close();renderer.dispose();}
  };
}
