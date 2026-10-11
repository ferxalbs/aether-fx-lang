import { deserializePlan } from '@aether-fx/core';
import { createPlayer, loadResources } from '@aether-fx/canvas';
import { queryWebExport, exportWebM } from '@aether-fx/export';
import type { Player, LoadedResources } from '@aether-fx/canvas';
const canvas = document.querySelector('canvas')!, play = document.querySelector<HTMLButtonElement>('#play')!, pause = document.querySelector<HTMLButtonElement>('#pause')!, seek = document.querySelector<HTMLInputElement>('#seek')!, rate = document.querySelector<HTMLSelectElement>('#rate')!, output = document.querySelector<HTMLOutputElement>('#frame')!, status = document.querySelector<HTMLParagraphElement>('#status')!;
let player: Player | undefined, resources: LoadedResources | undefined, request = 0;
const controller = new AbortController();
const exportButton = document.querySelector<HTMLButtonElement>('#export')!, cancelButton = document.querySelector<HTMLButtonElement>('#cancel')!;
let exportController: AbortController | undefined;
const resize = new ResizeObserver(entries => { if (!player) return; const width = entries[0]!.contentRect.width; player.resize(width, width * 720 / 1280); });
const dispose = () => { exportController?.abort(); controller.abort(); cancelAnimationFrame(request); resize.disconnect(); player?.dispose(); resources?.dispose(); };
window.addEventListener('pagehide', dispose, { once: true });
declare global { interface Window { preview: { player: Player; resources: LoadedResources; dispose: () => void } } }
try {
  const result = deserializePlan(await (await fetch('/plan.json', { signal: controller.signal })).text()); if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  resources = await loadResources(result.value, async (asset, signal) => { const response = await fetch('/assets/' + asset.id, { ...(signal ? { signal } : {}) }); if (!response.ok) throw new Error(`Asset ${asset.id}: ${response.status}`); return response.arrayBuffer(); }, controller.signal);
  controller.signal.throwIfAborted(); player = createPlayer(canvas, result.value, resources); resize.observe(canvas.parentElement!);
  const refresh = () => { if (!player || controller.signal.aborted) return; const frame = player.getCurrentFrame(); seek.value = String(frame); output.value = `Frame ${frame} / 479`; request = requestAnimationFrame(refresh); }; refresh();
  play.disabled = false; pause.disabled = false; status.textContent = 'Ready · 24 fps · 1280 × 720 · declared font, PNG and stereo WAV';
  play.onclick = () => { void player!.play().catch(cause => { status.textContent = String(cause); }); }; pause.onclick = () => player!.pause(); seek.oninput = () => player!.seekFrame(Number(seek.value)); rate.onchange = () => player!.setPlaybackRate(Number(rate.value));
  window.preview = { player, resources, dispose };
  const capability = await queryWebExport(result.value);
  if (capability.ok) exportButton.disabled = false;
  else exportButton.title = capability.diagnostics.map(d => d.message).join('; ');
  cancelButton.onclick = () => exportController?.abort();
  exportButton.onclick = () => {
    player!.pause(); exportButton.disabled = true; cancelButton.disabled = false; exportController = new AbortController();
    let parts: { position: number; data: Uint8Array<ArrayBuffer> }[] = [], size = 0, retained = 0;
    const signal = AbortSignal.any([controller.signal, exportController.signal]);
    void exportWebM(result.value, resources!, {
      signal, sink: {
        async write(data, position, currentSignal) { currentSignal?.throwIfAborted(); retained += data.byteLength; if (retained > 64 * 1024 * 1024) throw new Error('Browser download exceeds its 64 MB compressed-data budget; use Node export or a progressive file sink.'); parts.push({ position, data: data.slice() }); size = Math.max(size, position + data.byteLength); },
        async close() { signal.throwIfAborted(); const bytes = new Uint8Array(size); for (const part of parts) bytes.set(part.data, part.position); parts = []; const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' })); const link = document.createElement('a'); link.href = url; link.download = 'little-light.webm'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); },
        async abort() { parts = []; size = retained = 0; }
      }, onProgress: progress => { status.textContent = `Exporting frame ${progress.frame} / ${progress.total}…`; }
    }).then(report => { status.textContent = `Exported ${report.frames} frames with sound.`; }).catch(cause => { status.textContent = signal.aborted ? 'Export cancelled.' : `Unable to export: ${String(cause)}`; }).finally(() => { exportController = undefined; cancelButton.disabled = true; exportButton.disabled = controller.signal.aborted; });
  };
} catch (cause) { dispose(); status.textContent = `Unable to play: ${cause instanceof Error ? cause.message : String(cause)}`; }
export { loadResources, deserializePlan, queryWebExport, exportWebM };
