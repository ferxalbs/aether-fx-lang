import type { PlaybackPlan } from '@aether-fx/core';
import type { CanvasResources } from '@aether-fx/canvas';
import { encodeWebVideo, WebExportError } from './shared.js';
import type { WebExportOptions } from './shared.js';
export { queryWebExport, WebExportError } from './shared.js';
export type { WebExportSink, WebAudioEncoderAdapter, WebExportOptions, WebExportCapability, WebExportReport } from './shared.js';
import { WebMOutputFormat } from 'mediabunny';
/** Default entry contains only the WebM muxer. MP4 is available at @aether-fx/export/mp4. */
export function exportWebM(plan:PlaybackPlan,resources:CanvasResources & {audio?:Map<string,AudioBuffer>},options:WebExportOptions){return encodeWebVideo(plan,resources,{...options,format:'webm'},new WebMOutputFormat({minimumClusterDuration:1}));}
export function exportWebVideo(plan:PlaybackPlan,resources:CanvasResources & {audio?:Map<string,AudioBuffer>},options:WebExportOptions){if(options.format==='mp4')throw new WebExportError('EXPORT_UNSUPPORTED','Import exportMP4 from @aether-fx/export/mp4');return exportWebM(plan,resources,options);}
