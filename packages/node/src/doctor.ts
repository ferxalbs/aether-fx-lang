import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { chromium } from 'playwright';
import { diagnostic, failure, success } from '@aether-fx/core';
import type { Result } from '@aether-fx/core';
import { runTool } from './process.js';
export interface EnvironmentReport { ffmpeg: string; chromiumPath: string; encoders: { vp9: boolean; opus: boolean; h264: boolean; aac: boolean } }
export async function doctor(options: { backend?: 'native' | 'chromium'; ffmpegPath?: string; chromiumExecutable?: string } = {}): Promise<Result<EnvironmentReport>> {
  const diagnostics = [], ffmpeg = options.ffmpegPath ?? 'ffmpeg', chromiumPath = options.backend === 'chromium' || options.chromiumExecutable ? options.chromiumExecutable ?? chromium.executablePath() : '';
  let version = '', encoders = { vp9: false, opus: false, h264: false, aac: false };
  try { const output = await runTool(ffmpeg, ['-hide_banner', '-encoders']); const text = output.stdout.toString(); encoders = { vp9: /\blibvpx-vp9\b/.test(text), opus: /\blibopus\b/.test(text), h264: /\blibx264\b/.test(text), aac: /\baac\s/.test(text) }; version = (await runTool(ffmpeg, ['-version'])).stdout.toString().split('\n')[0]!; if (!encoders.vp9 || !encoders.opus) diagnostics.push(diagnostic('ENCODER_MISSING', 'Reference export requires FFmpeg libvpx-vp9 and libopus')); }
  catch (cause) { diagnostics.push(diagnostic('DEPENDENCY_MISSING', `FFmpeg unavailable: ${cause instanceof Error ? cause.message : String(cause)}`)); }
  try { if (chromiumPath) await access(chromiumPath, constants.X_OK); } catch { diagnostics.push(diagnostic('DEPENDENCY_MISSING', 'Chromium is not installed. Run npx playwright install chromium deliberately.')); }
  return diagnostics.length ? failure(diagnostics) : success({ ffmpeg: version, chromiumPath, encoders });
}
