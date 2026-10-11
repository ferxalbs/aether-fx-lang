import { deserializePlan } from '@aether-fx/core';
import { createPlayer, loadResources } from '@aether-fx/canvas';
import type { Player, LoadedResources } from '@aether-fx/canvas';
const canvas = document.querySelector('canvas')!, play = document.querySelector<HTMLButtonElement>('#play')!, pause = document.querySelector<HTMLButtonElement>('#pause')!, seek = document.querySelector<HTMLInputElement>('#seek')!, rate = document.querySelector<HTMLSelectElement>('#rate')!, output = document.querySelector<HTMLOutputElement>('#frame')!, status = document.querySelector<HTMLParagraphElement>('#status')!;
let player: Player | undefined, resources: LoadedResources | undefined, request = 0;
const controller = new AbortController();
const resize = new ResizeObserver(entries => { if (!player) return; const width = entries[0]!.contentRect.width; player.resize(width, width * 720 / 1280); });
const dispose = () => { controller.abort(); cancelAnimationFrame(request); resize.disconnect(); player?.dispose(); resources?.dispose(); };
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
} catch (cause) { dispose(); status.textContent = `Unable to play: ${cause instanceof Error ? cause.message : String(cause)}`; }
export { loadResources, deserializePlan };
