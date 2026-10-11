import type { PlaybackPlan } from '@aether-fx/core';
import type { CanvasResources } from '@aether-fx/canvas';
import { encodeWebVideo, WebExportError } from './shared.js';
import type { WebExportOptions } from './shared.js';
export { queryWebExport, WebExportError } from './shared.js';
export type { WebExportSink, WebAudioEncoderAdapter, WebExportOptions, WebExportCapability, WebExportReport } from './shared.js';
import { Mp4OutputFormat } from 'mediabunny';
export function exportMP4(plan:PlaybackPlan,resources:CanvasResources & {audio?:Map<string,AudioBuffer>},options:WebExportOptions){return encodeWebVideo(plan,resources,{...options,format:'mp4'},new Mp4OutputFormat());}
