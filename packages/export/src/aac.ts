import { registerAacEncoder } from '@mediabunny/aac-encoder';
import { AudioSampleSource, AudioSample, canEncodeAudio, Output } from 'mediabunny';
import { exportMP4 } from './mp4.js';
import type { PlaybackPlan } from '@aether-fx/core';
import type { CanvasResources } from '@aether-fx/canvas';
import type { WebExportOptions, WebAudioEncoderAdapter } from './index.js';
let registered=false;
/** Optional entry: official FFmpeg AAC WASM. Codec code is absent from the default entry. */
export function aacWasmAdapter():WebAudioEncoderAdapter{if(!registered){registerAacEncoder();registered=true;}return {async supports(config){return canEncodeAudio('aac',{sampleRate:config.sampleRate,numberOfChannels:config.numberOfChannels,bitrate:config.bitrate??128000});},connect(output){if(!(output instanceof Output))throw new TypeError('Expected a Mediabunny output');const source=new AudioSampleSource({codec:'aac',bitrate:128000});output.addAudioTrack(source);return {async add(data,numberOfChannels,sampleRate,timestamp){const sample=new AudioSample({data,format:'f32-planar',numberOfChannels,sampleRate,timestamp});try{await source.add(sample);}finally{sample.close();}},async close(){source.close();}};}};}
export function exportMP4WithAacWasm(plan:PlaybackPlan,resources:CanvasResources & {audio?:Map<string,AudioBuffer>},options:WebExportOptions){return exportMP4(plan,resources,{...options,audioEncoder:aacWasmAdapter()});}
export function registerAacWasm(){if(!registered){registerAacEncoder();registered=true;}}
