import { deserializePlan, serializePlan, evaluate, frameTimestamp, frameSeconds, diagnostic, failure, success } from '@aether-fx/core';
import type { PlaybackPlan, Result } from '@aether-fx/core';
import { createRenderer } from '@aether-fx/canvas';
import type { CanvasResources } from '@aether-fx/canvas';
import type { OutputFormat } from 'mediabunny';
import { Output, StreamTarget, EncodedVideoPacketSource, EncodedAudioPacketSource, EncodedPacket } from 'mediabunny';

export class WebExportError extends Error {
  constructor(public readonly code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = 'WebExportError'; }
}
/** Random-access sink: await writes, commit in close, discard partial output in abort. */
export interface WebExportSink {
  write(data: Uint8Array<ArrayBuffer>, position: number, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
  abort(reason: unknown): Promise<void>;
}
export interface WebAudioEncoderAdapter {
 supports(config:AudioEncoderConfig):Promise<boolean>;
 connect(output:unknown):{add(data:Float32Array,channels:number,sampleRate:number,timestamp:number):Promise<void>;close():Promise<void>};
}
export interface WebExportOptions {
  audioEncoder?: WebAudioEncoderAdapter; format?: 'webm' | 'mp4'; sink: WebExportSink; width?: number; height?: number; signal?: AbortSignal;
  onProgress?: (progress: { frame: number; total: number; bytesWritten: number }) => void;
}
export interface WebExportCapability { width: number; height: number; video: VideoEncoderConfig; audio: AudioEncoderConfig | null }
export interface WebExportReport {
  frames: number; width: number; height: number; duration: number; seconds: number; bytes: number;
  video: VideoEncoderConfig; audio: AudioEncoderConfig | null;
  queueCapacity: { producerSamples: 1; videoEncoderSamples: 1; audioEncoderSamples: 4 }; audioSamples: number;
}
export async function queryWebExport(plan: PlaybackPlan, options: { width?: number; height?: number; audioEncoder?: WebAudioEncoderAdapter; format?: 'webm' | 'mp4' } = {}): Promise<Result<WebExportCapability>> {
  const width = options.width ?? plan.document.viewport[0], height = options.height ?? plan.document.viewport[1];
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 8192 && n % 2 === 0)) return failure([diagnostic('EXPORT_RESOLUTION', 'WebM dimensions must be even integers in [2,8192]')]);
  const reasons: string[] = [];
  if (typeof globalThis.VideoEncoder !== 'function' || typeof globalThis.VideoFrame !== 'function') reasons.push('Native video WebCodecs unavailable');
  if (!options.audioEncoder&&plan.document.audio && (typeof globalThis.AudioEncoder !== 'function' || typeof globalThis.AudioData !== 'function')) reasons.push('Native audio WebCodecs unavailable');
  if (globalThis.isSecureContext !== true) reasons.push('A secure browser context is required');
  if (reasons.length) return failure([diagnostic('EXPORT_UNSUPPORTED', reasons.join('; ') + '. Use @aether-fx/node export.')]);
  const video: VideoEncoderConfig = { codec: options.format==='mp4'?'avc1.420028':'vp09.00.41.08', width, height, bitrate: Math.round(3_000_000 * width * height / (1280 * 720)), bitrateMode: 'variable', framerate: plan.document.fps.numerator / plan.document.fps.denominator, latencyMode: 'quality', hardwareAcceleration: 'no-preference', alpha: 'discard' };
  const manifest = plan.document.audio ? plan.manifest.find(a => a.id === plan.document.audio!.asset) : undefined;
  const audio: AudioEncoderConfig | null = manifest ? { codec: options.format==='mp4'?'mp4a.40.2':'opus', sampleRate: manifest.sampleRate!, numberOfChannels: manifest.channels!, bitrate: 128_000 } : null;
  try {
    const videoSupport = await VideoEncoder.isConfigSupported(video);
    if (!videoSupport.supported) reasons.push(video.codec+' configuration is unsupported');
    else {
      let encoder: VideoEncoder | undefined, frame: VideoFrame | undefined, encoderFailure: unknown, packets = 0;
      try {
        encoder = new VideoEncoder({ output: () => { packets++; }, error: cause => { encoderFailure = cause; } });
        encoder.configure(video);
        frame = new VideoFrame(new Uint8Array(width * height * 4), { format: 'RGBA', codedWidth: width, codedHeight: height, timestamp: 0 });
        encoder.encode(frame, { keyFrame: true }); frame.close(); frame = undefined;
        await encoder.flush(); if (encoderFailure || !packets) throw encoderFailure ?? new Error('Video probe produced no packet');
      } catch (cause) { reasons.push(video.codec+' encoding probe failed: ' + (cause instanceof Error ? cause.message : String(cause))); }
      finally { frame?.close(); if (encoder && encoder.state !== 'closed') encoder.close(); }
    }
    if(audio&&options.audioEncoder){if(options.format!=='mp4'||!await options.audioEncoder.supports(audio))reasons.push('Registered AAC encoder unavailable');}
    if (audio&&!options.audioEncoder) {
      const audioSupport = await AudioEncoder.isConfigSupported(audio);
      if (!audioSupport.supported) reasons.push(audio.codec+' configuration is unsupported');
      else {
        let encoder: AudioEncoder | undefined, data: AudioData | undefined, encoderFailure: unknown, packets = 0;
        try {
          encoder = new AudioEncoder({ output: () => { packets++; }, error: cause => { encoderFailure = cause; } });
          encoder.configure(audio);
          const count = Math.max(1, Math.round(audio.sampleRate / 50));
          data = new AudioData({ data: new Float32Array(count * audio.numberOfChannels), format: 'f32-planar', numberOfFrames: count, numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate, timestamp: 0 });
          encoder.encode(data); data.close(); data = undefined;
          await encoder.flush(); if (encoderFailure || !packets) throw encoderFailure ?? new Error('Audio probe produced no packet');
        } catch (cause) { reasons.push(audio.codec+' encoding probe failed: ' + (cause instanceof Error ? cause.message : String(cause))); }
        finally { data?.close(); if (encoder && encoder.state !== 'closed') encoder.close(); }
      }
    }
  } catch (cause) { reasons.push('Capability query failed: ' + (cause instanceof Error ? cause.message : String(cause))); }
  return reasons.length ? failure([diagnostic('EXPORT_UNSUPPORTED', reasons.join('; ') + '. Use @aether-fx/node export.')]) : success({ width, height, video, audio });
}

/** Offline export; resources remain host-owned and must stay live until this promise settles. */
export async function encodeWebVideo(plan: PlaybackPlan, resources: CanvasResources & { audio?: Map<string, AudioBuffer> }, options: WebExportOptions, format: unknown): Promise<WebExportReport> {
  const signal = options.signal;
  const check = () => { if (signal?.aborted) throw new WebExportError('EXPORT_ABORTED', 'Web export cancelled', { cause: signal.reason }); };
  check();
  const verified = deserializePlan(serializePlan(plan)); if (!verified.ok) throw new WebExportError('PLAN_INVALID', JSON.stringify(verified.diagnostics));
  plan = verified.value;
  const capability = await queryWebExport(plan, options); check();
  if (!capability.ok) throw new WebExportError(capability.diagnostics[0]!.code, capability.diagnostics.map(d => d.message).join('; '));
  const { width, height } = capability.value, track = plan.document.audio;
  const buffer = track ? resources.audio?.get(track.asset) : undefined;
  if (track && !buffer) throw new WebExportError('ASSET_UNRESOLVED', 'Decoded audio resources required: ' + track.asset);
  if (buffer && capability.value.audio && (buffer.sampleRate !== capability.value.audio.sampleRate || buffer.numberOfChannels !== capability.value.audio.numberOfChannels)) throw new WebExportError('ASSET_METADATA', 'Decoded audio does not match the manifest');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const renderer = createRenderer(canvas, resources);
  let registeredAudio:ReturnType<WebAudioEncoderAdapter['connect']>|undefined;
  let output: Output | undefined, videoEncoder: VideoEncoder | undefined, audioEncoder: AudioEncoder | undefined;
  let bytes = 0, audioSamples = 0, videoPackets = 0, currentFrame = 0, muxWrites: Promise<void> = Promise.resolve();
  const actualVideo = capability.value.video, actualAudio = capability.value.audio;
  let abortPromise: Promise<void> | undefined;
  const abortSink = (reason: unknown) => abortPromise ??= Promise.resolve().then(() => options.sink.abort(reason));
  let rejectError!: (cause: unknown) => void, rejectAbort!: (cause: unknown) => void, encoderFailed = false, encoderFailure: unknown;
  const codecError = new Promise<never>((_, reject) => { rejectError = cause => { if (!encoderFailed) { encoderFailed = true; encoderFailure = cause; } reject(cause); }; });
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  void codecError.catch(() => { }); void cancelled.catch(() => { });
  const checked = async <T>(promise: Promise<T>) => { if (encoderFailed) throw encoderFailure; check(); const value = await Promise.race([promise, codecError, cancelled]); if (encoderFailed) throw encoderFailure; check(); return value; };
  const closeEncoders = () => { if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close(); if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close(); };
  const abort = () => { rejectAbort(signal?.reason); closeEncoders(); void abortSink(signal?.reason).catch(() => { }); };
  signal?.addEventListener('abort', abort, { once: true });
  const start = performance.now();
  async function waitForRoom(encoder: VideoEncoder | AudioEncoder) {
    // A dequeue event can be stale/coalesced: recheck the actual queue after every wakeup.
    while (encoder.encodeQueueSize >= 4) {
      let wake!: () => void;
      const event = new Promise<void>(resolve => { wake = resolve; encoder.addEventListener('dequeue', wake); });
      try { await checked(event); } finally { encoder.removeEventListener('dequeue', wake); }
    }
    check();
  }
  try {
    const writable = new WritableStream({ async write(chunk: { data: Uint8Array<ArrayBuffer>; position: number }) { check(); await options.sink.write(chunk.data, chunk.position, signal); bytes = Math.max(bytes, chunk.position + chunk.data.byteLength); check(); } }, { highWaterMark: 1 });
    output = new Output({ format: format as OutputFormat, target: new StreamTarget(writable) });
    const video = new EncodedVideoPacketSource(options.format==='mp4'?'avc':'vp9'), audio = actualAudio&&!options.audioEncoder?new EncodedAudioPacketSource(options.format==='mp4'?'aac':'opus'):undefined;
    if(actualAudio&&options.audioEncoder)registeredAudio=options.audioEncoder.connect(output);
    output.addVideoTrack(video, { frameRate: plan.document.fps.numerator / plan.document.fps.denominator }); if (audio) output.addAudioTrack(audio);
    const enqueue = (operation: () => Promise<void>) => { muxWrites = muxWrites.then(operation); void muxWrites.catch(rejectError); };
    videoEncoder = new VideoEncoder({
      error: rejectError, output(chunk, metadata) {
        videoPackets++;
        const packet = EncodedPacket.fromEncodedChunk(chunk).clone({ timestamp: frameSeconds(currentFrame, plan.document.fps), duration: frameSeconds(1, plan.document.fps) });
        enqueue(() => video.add(packet, metadata));
      }
    });
    videoEncoder.configure(actualVideo);
    if (audio && actualAudio) {
      audioEncoder = new AudioEncoder({
        error: rejectError, output(chunk, metadata) {
          const packet = EncodedPacket.fromEncodedChunk(chunk).clone({ timestamp: Math.round(chunk.timestamp * actualAudio.sampleRate / 1_000_000) / actualAudio.sampleRate, duration: Math.round((chunk.duration ?? 0) * actualAudio.sampleRate / 1_000_000) / actualAudio.sampleRate });
          enqueue(() => audio.add(packet, metadata));
        }
      });
      audioEncoder.configure(actualAudio);
    }
    await checked(output.start()); check();
    const sampleRate = buffer?.sampleRate ?? 48000, channels = buffer?.numberOfChannels ?? 0;
    const sourceChannels = buffer ? Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel)) : [];
    const offset = track ? frameTimestamp(track.offset, plan.document.fps, sampleRate) : 0, trim = track ? frameTimestamp(track.trimStart, plan.document.fps, sampleRate) : 0, end = track ? frameTimestamp(track.offset + track.duration, plan.document.fps, sampleRate) : 0;
    for (let frame = 0; frame < plan.duration; frame++) {
      check(); await checked(muxWrites); renderer.render(evaluate(plan, { frame })); currentFrame = frame;
      const timestamp = frameTimestamp(frame, plan.document.fps), next = frameTimestamp(frame + 1, plan.document.fps);
      const sample = new VideoFrame(canvas, { timestamp, duration: next - timestamp, alpha: 'discard' });
      try { videoEncoder.encode(sample, { keyFrame: frame % Math.max(1, Math.round(actualVideo.framerate! * 2)) === 0 }); } finally { sample.close(); }
      // Flush each video frame: bounds raw video ownership and makes callback timing unambiguous.
      await checked(videoEncoder.flush()); await checked(muxWrites); check();
      if ((audioEncoder||registeredAudio) && track && buffer) {
        const from = frameTimestamp(frame, plan.document.fps, sampleRate), until = frameTimestamp(frame + 1, plan.document.fps, sampleRate), count = until - from, data = new Float32Array(count * channels);
        for (let channel = 0; channel < channels; channel++) for (let i = 0; i < count; i++) { const at = from + i; if (at >= offset && at < end) data[channel * count + i] = (sourceChannels[channel]![at - offset + trim] ?? 0) * track.gain; }
        if(registeredAudio){await checked(registeredAudio.add(data,channels,sampleRate,from/sampleRate));audioSamples+=count;}else{
        await waitForRoom(audioEncoder!);
        const sample = new AudioData({ data, format: 'f32-planar', numberOfFrames: count, numberOfChannels: channels, sampleRate, timestamp: Math.round(from * 1_000_000 / sampleRate) });
        try { audioEncoder!.encode(sample); audioSamples += count; } finally { sample.close(); }}
      }
      await checked(muxWrites); check(); options.onProgress?.({ frame: frame + 1, total: plan.duration, bytesWritten: bytes });
    }
    if(registeredAudio)await checked(Promise.resolve(registeredAudio.close()));
    if (audioEncoder) await checked(audioEncoder.flush()); await checked(muxWrites);
    if (videoPackets !== plan.duration) throw new Error(`Encoder produced ${videoPackets} frames; expected ${plan.duration}`);
    closeEncoders(); video.close(); audio?.close(); await checked(output.finalize()); check(); await checked(options.sink.close());
    return { frames: videoPackets, width, height, duration: frameSeconds(plan.duration, plan.document.fps), seconds: (performance.now() - start) / 1000, bytes, video: actualVideo, audio: actualAudio, queueCapacity: { producerSamples: 1, videoEncoderSamples: 1, audioEncoderSamples: 4 }, audioSamples };
  } catch (cause) {
    closeEncoders();
    const failures = await Promise.allSettled([abortSink(cause), output?.cancel()]);
    const cleanupErrors = failures.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason);
    throw new WebExportError(signal?.aborted ? 'EXPORT_ABORTED' : 'EXPORT_FAILED', 'Web export failed: ' + (cause instanceof Error ? cause.message : String(cause)), { cause: cleanupErrors.length ? new AggregateError([cause, ...cleanupErrors], 'Export and cleanup failed') : cause });
  } finally { signal?.removeEventListener('abort', abort); closeEncoders(); renderer.dispose(); canvas.width = canvas.height = 0; }
}

