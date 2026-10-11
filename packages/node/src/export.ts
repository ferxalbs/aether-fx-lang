import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, link } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { platform, release } from 'node:os';
import { frameSeconds, frameTimestamp } from '@aether-fx/core';
import type { LoadedProject } from './assets.js';
import { createOfflineRenderer } from './renderer.js';
import type { OfflineRenderer } from './renderer.js';
import { doctor } from './doctor.js';
import { FxEnvironmentError } from './errors.js';
export interface ExportOptions {
  output: string; width?: number; height?: number; format?: 'webm' | 'mp4'; signal?: AbortSignal; timeoutMs?: number;
  ffmpegPath?: string; chromiumExecutable?: string; onProgress?: (progress: { frame: number; total: number }) => void;
}
export interface ExportReport {
  output: string; frames: number; width: number; height: number; duration: number; seconds: number; exportFactor: number;
  chromium: string; ffmpeg: string; os: string; assetHashes: Record<string, string>; fonts: string[];
  queueCapacity: 1; peakRssBytes: number; blockedRequests: string[];
}
export async function exportVideo(project: LoadedProject, options: ExportOptions): Promise<ExportReport> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 300_000), signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const checkCancellation = () => { if (signal.aborted) throw new FxEnvironmentError(timeout.aborted ? 'EXPORT_TIMEOUT' : 'EXPORT_ABORTED', 'Export was cancelled or exceeded its timeout', { cause: signal.reason }); };
  checkCancellation();
  const report = await doctor(options); if (!report.ok) throw new FxEnvironmentError('ENVIRONMENT_UNSUPPORTED', JSON.stringify(report.diagnostics));
  checkCancellation();
  const format = options.format ?? 'webm'; if (format === 'mp4' && (!report.value.encoders.h264 || !report.value.encoders.aac)) throw new FxEnvironmentError('ENCODER_MISSING', 'MP4 additionally requires libx264 and aac');
  if (format !== 'webm' && format !== 'mp4') throw new FxEnvironmentError('EXPORT_FORMAT', 'Format must be webm or mp4');
  const { plan, assets } = project, width = options.width ?? plan.document.viewport[0], height = options.height ?? plan.document.viewport[1];
  if (width % 2 || height % 2) throw new FxEnvironmentError('RESOLUTION_INVALID', 'Reference yuv420 export needs even dimensions');
  const output = resolve(options.output);
  // Temp output shares the destination filesystem; hard-link publication never overwrites user data.
  const directory = await mkdtemp(join(dirname(output), '.afx-export-')), temporary = join(directory, 'video.' + format);
  let renderer: OfflineRenderer | undefined, process: ReturnType<typeof spawn> | undefined, stderr = '', processError: Error | undefined;
  let peakRssBytes = globalThis.process.memoryUsage().rss, finished = false, killTimer: ReturnType<typeof setTimeout> | undefined;
  const start = performance.now();
  const abort = () => { if (process && !finished) { process.kill('SIGTERM'); killTimer = setTimeout(() => process?.kill('SIGKILL'), 2000); } void renderer?.dispose().catch(() => { }); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    renderer = await createOfflineRenderer(plan, assets, { width, height, signal, ...(options.chromiumExecutable ? { chromiumExecutable: options.chromiumExecutable } : {}) });
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', `${plan.document.fps.numerator}/${plan.document.fps.denominator}`, '-i', 'pipe:0'];
    const audio = plan.document.audio;
    if (audio) { const file = assets.files.get(audio.asset)!; const path = join(directory, 'audio.wav'); await writeFile(path, file.bytes); args.push('-i', path); }
    args.push('-map', '0:v:0');
    if (audio) {
      const metadata = assets.manifest.find(a => a.id === audio.asset)!, sampleRate = metadata.sampleRate!;
      const trim = frameTimestamp(audio.trimStart, plan.document.fps, sampleRate), end = frameTimestamp(audio.trimStart + audio.duration, plan.document.fps, sampleRate), offset = frameTimestamp(audio.offset, plan.document.fps, sampleRate), total = frameTimestamp(plan.duration, plan.document.fps, sampleRate);
      args.push('-map', '1:a:0', '-af', `atrim=start_sample=${trim}:end_sample=${end},asetpts=PTS-STARTPTS,volume=${audio.gain},adelay=${offset}S:all=1,apad=whole_len=${total}`, '-c:a', format === 'webm' ? 'libopus' : 'aac', '-b:a', '128k');
    }
    args.push('-c:v', format === 'webm' ? 'libvpx-vp9' : 'libx264', ...(format === 'webm' ? ['-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-b:v', '0', '-crf', '30'] : ['-preset', 'medium', '-crf', '20']), '-threads', '2', '-pix_fmt', 'yuv420p', '-frames:v', String(plan.duration), '-t', String(frameSeconds(plan.duration, plan.document.fps)), '-avoid_negative_ts', 'disabled', '-f', format === 'webm' ? 'webm' : 'mp4', temporary);
    signal.throwIfAborted(); process = spawn(options.ffmpegPath ?? 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'], shell: false });
    const completion = new Promise<void>((resolve, reject) => {
      process!.on('error', cause => { processError = new FxEnvironmentError('PROCESS_START', 'FFmpeg failed to start', { cause }); reject(processError); });
      process!.stderr!.on('data', (bytes: Buffer) => { stderr = (stderr + bytes.toString()).slice(-16000); });
      process!.stdin!.on('error', cause => { processError ??= cause; });
      process!.on('close', code => { finished = true; if (code !== 0) { processError ??= new FxEnvironmentError('ENCODE_FAILED', `FFmpeg exited ${code}: ${stderr}`); reject(processError); } else resolve(); });
    });
    // Attach a rejection observer immediately; the sequential loop may still be in Chromium.
    void completion.catch(() => { });
    for (let frame = 0; frame < plan.duration; frame++) {
      signal.throwIfAborted(); if (processError) throw processError;
      const bytes = await renderer.captureFrame(frame);
      await new Promise<void>((resolve, reject) => process!.stdin!.write(bytes, cause => cause ? reject(cause) : resolve()));
      peakRssBytes = Math.max(peakRssBytes, globalThis.process.memoryUsage().rss); options.onProgress?.({ frame: frame + 1, total: plan.duration });
    }
    process.stdin!.end(); await completion; signal.throwIfAborted();
    await link(temporary, output); // EEXIST is a failure, never an implicit overwrite.
    const seconds = (performance.now() - start) / 1000, duration = frameSeconds(plan.duration, plan.document.fps);
    return { output, frames: plan.duration, width, height, duration, seconds, exportFactor: seconds / duration, chromium: renderer.browserVersion, ffmpeg: report.value.ffmpeg, os: `${platform()} ${release()}`, assetHashes: Object.fromEntries(assets.manifest.map(a => [a.id, a.hash])), fonts: plan.document.assets.filter(a => a.kind === 'font').map(a => a.id), queueCapacity: 1, peakRssBytes, blockedRequests: renderer.blockedRequests };
  } catch (cause) {
    if (process && !finished) { process.kill('SIGKILL'); await new Promise<void>(resolve => process!.once('close', () => resolve())); }
    if (signal.aborted) throw new FxEnvironmentError(timeout.aborted ? 'EXPORT_TIMEOUT' : 'EXPORT_ABORTED', 'Export was cancelled or exceeded its timeout', { cause: signal.reason });
    throw new FxEnvironmentError('EXPORT_FAILED', `Export failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  } finally { signal.removeEventListener('abort', abort); if (killTimer) clearTimeout(killTimer); try { await renderer?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } }
}
