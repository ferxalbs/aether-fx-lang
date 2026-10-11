import { deserializePlan, evaluate } from '@aether-fx/core';
import { createRenderer, loadResources } from '@aether-fx/canvas';
import type { PlaybackPlan } from '@aether-fx/core';
import type { Renderer, LoadedResources } from '@aether-fx/canvas';
export interface RenderBridge { ready: boolean; error: string | null; render(frame: number): string; evaluate(frame: number): ReturnType<typeof evaluate>; dispose(): void }
declare global { interface Window { __afx: RenderBridge } }
let renderer: Renderer | undefined, resources: LoadedResources | undefined, plan: PlaybackPlan;
const canvas = document.querySelector('canvas')!;
window.__afx = { ready: false, error: null, render(frame) { if (!renderer) throw new Error('Renderer not initialized'); renderer.render(evaluate(plan, { frame })); return canvas.toDataURL('image/png').split(',')[1]!; }, evaluate(frame) { return evaluate(plan, { frame }); }, dispose() { renderer?.dispose(); resources?.dispose(); } };
try {
  const parsed = deserializePlan(await (await fetch('./plan.json')).text()); if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics)); plan = parsed.value;
  resources = await loadResources(plan, async asset => { const response = await fetch(`./assets/${asset.id}`); if (!response.ok) throw new Error(`Asset ${asset.id}: ${response.status}`); return response.arrayBuffer(); });
  await document.fonts.ready; renderer = createRenderer(canvas, resources); window.__afx.ready = true;
} catch (cause) { window.__afx.error = cause instanceof Error ? cause.message : String(cause); }
