import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { deserializePlan, serializePlan } from '@aether-fx/core';
import type { DrawList, PlaybackPlan } from '@aether-fx/core';
import type { ResolvedAssets } from './assets.js';
import { FxEnvironmentError } from './errors.js';
import type { RenderBridge } from './browser.js';
export interface OfflineRenderer {
  captureFrame(frame: number): Promise<Buffer>; evaluateFrame(frame: number): Promise<DrawList>;
  browserVersion: string; blockedRequests: string[]; dispose(): Promise<void>;
}
export async function createOfflineRenderer(plan: PlaybackPlan, assets: ResolvedAssets, options: { width?: number; height?: number; signal?: AbortSignal; chromiumExecutable?: string } = {}): Promise<OfflineRenderer> {
  const verified = deserializePlan(serializePlan(plan)); if (!verified.ok) throw new FxEnvironmentError('PLAN_INVALID', JSON.stringify(verified.diagnostics));
  const width = options.width ?? plan.document.viewport[0], height = options.height ?? plan.document.viewport[1];
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 8192)) throw new FxEnvironmentError('RESOLUTION_INVALID', 'Output dimensions must be integers in [1,8192]');
  options.signal?.throwIfAborted();
  const token = randomBytes(16).toString('hex'), prefix = '/' + token;
  const endpoints = new Map<string, { type: string; bytes: Buffer | string }>([
    [prefix + '/', { type: 'text/html', bytes: `<!doctype html><html><head><meta charset="utf-8"></head><body><canvas width="${width}" height="${height}"></canvas><script type="module" src="./renderer.js"></script></body></html>` }],
    [prefix + '/renderer.js', { type: 'text/javascript', bytes: await readFile(new URL('./renderer.js', import.meta.url)) }],
    [prefix + '/plan.json', { type: 'application/json', bytes: serializePlan(verified.value) }]
  ]);
  for (const asset of plan.document.assets) { const file = assets.files.get(asset.id); if (!file) throw new FxEnvironmentError('ASSET_UNRESOLVED', `Missing resolved bytes for ${asset.id}`); endpoints.set(prefix + '/assets/' + asset.id, { type: 'application/octet-stream', bytes: file.bytes }); }
  let browser: Browser | undefined, page: Page | undefined, server: Server | undefined, disposed = false, disposal: Promise<void> | undefined;
  const blockedRequests: string[] = [];
  const dispose = () => disposal ??= (async () => { disposed = true; options.signal?.removeEventListener('abort', abort); try { await browser?.close(); } finally { if (server?.listening) await new Promise<void>((resolve, reject) => { server!.close(cause => cause ? reject(cause) : resolve()); server!.closeAllConnections(); }); } })();
  const abort = () => { void dispose().catch(() => { }); };
  try {
    server = createServer((request, response) => {
      const resource = endpoints.get(request.url ?? '');
      if (!resource || !['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', resource.type); response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' blob:; font-src 'self'; style-src 'unsafe-inline'");
      response.end(request.method === 'HEAD' ? undefined : resource.bytes);
    });
    await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve); });
    options.signal?.throwIfAborted();
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No local server address');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ executablePath: options.chromiumExecutable ?? chromium.executablePath(), headless: true });
    options.signal?.throwIfAborted();
    options.signal?.addEventListener('abort', abort, { once: true });
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.route('**/*', route => { const request = route.request(), url = new URL(request.url()); if (url.origin === origin && endpoints.has(url.pathname) && !url.search && ['GET', 'HEAD'].includes(request.method())) return route.continue(); blockedRequests.push(request.url()); return route.abort('blockedbyclient'); });
    page = await context.newPage(); await page.goto(origin + prefix + '/');
    await page.waitForFunction(() => window.__afx?.ready || window.__afx?.error, {}, { timeout: 30_000 });
    const error = await page.evaluate(() => window.__afx.error); if (error) throw new FxEnvironmentError('BROWSER_ASSET', error);
    options.signal?.throwIfAborted();
    return {
      browserVersion: browser.version(), blockedRequests,
      async captureFrame(frame) { if (disposed) throw new FxEnvironmentError('RENDERER_DISPOSED', 'Offline renderer disposed'); options.signal?.throwIfAborted(); if (!Number.isSafeInteger(frame) || frame < 0 || frame >= plan.duration) throw new RangeError('Frame outside movie'); const base64 = await page!.evaluate(frame => (window.__afx as RenderBridge).render(frame), frame); options.signal?.throwIfAborted(); return Buffer.from(base64, 'base64'); },
      async evaluateFrame(frame) { if (disposed) throw new FxEnvironmentError('RENDERER_DISPOSED', 'Offline renderer disposed'); return page!.evaluate(frame => (window.__afx as RenderBridge).evaluate(frame), frame); },
      dispose
    };
  } catch (cause) { await dispose(); if (options.signal?.aborted) throw new FxEnvironmentError('RENDER_ABORTED', 'Offline render aborted', { cause: options.signal.reason }); throw cause; }
}
