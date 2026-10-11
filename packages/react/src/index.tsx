'use client';
import { useEffect, useEffectEvent, useImperativeHandle, useRef } from 'react';
import type { CSSProperties, Ref } from 'react';
import type { PlaybackPlan } from '@aether-fx/core';
import { createPlayer, loadResources } from '@aether-fx/canvas';
import type { AssetResolver, LoadedResources, Player } from '@aether-fx/canvas';

export interface FxPlayerProps {
  plan: PlaybackPlan;
  resolveAsset: AssetResolver;
  ref?: Ref<Player>;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

/** Owns resources and one imperative player per mounted plan/resolver pair. */
export function FxPlayer({ plan, resolveAsset, ref, className, style, ariaLabel = 'AETHER Fx animation', onReady, onError }: FxPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const ready = useEffectEvent(() => onReady?.());
  const failed = useEffectEvent((cause: unknown) => onError?.(cause instanceof Error ? cause : new Error(String(cause))));

  useImperativeHandle(ref, () => {
    const player = () => { if (!playerRef.current) throw new Error('FxPlayer is not ready or has been disposed'); return playerRef.current; };
    return {
      play: () => player().play(), pause: () => player().pause(), seekFrame: frame => player().seekFrame(frame),
      setPlaybackRate: rate => player().setPlaybackRate(rate), getCurrentFrame: () => player().getCurrentFrame(),
      getStats: () => player().getStats(), resize: (width, height, dpr) => player().resize(width, height, dpr),
      dispose: () => releaseRef.current?.()
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!, container = containerRef.current!;
    const controller = new AbortController();
    let active = true, resources: LoadedResources | undefined, player: Player | undefined, observer: ResizeObserver | undefined;
    const resize = () => {
      if (!active || !player) return;
      const width = container.getBoundingClientRect().width;
      if (width > 0) player.resize(width, width * plan.document.viewport[1] / plan.document.viewport[0]);
    };
    const release = () => {
      if (!active) return;
      active = false; controller.abort(); observer?.disconnect(); window.removeEventListener('resize', resize);
      player?.dispose(); resources?.dispose();
      if (playerRef.current === player) playerRef.current = null;
      if (releaseRef.current === release) releaseRef.current = null;
      container.dataset.fxState = 'disposed';
    };
    releaseRef.current = release;
    container.dataset.fxState = 'loading';
    async function initialize() {
      resources = await loadResources(plan, resolveAsset, controller.signal);
      if (!active) { resources.dispose(); return; }
      player = createPlayer(canvas, plan, resources); playerRef.current = player;
      resize(); observer = new ResizeObserver(resize); observer.observe(container); window.addEventListener('resize', resize);
      container.dataset.fxState = 'ready'; ready();
    }
    void initialize().catch(cause => {
      if (!active) return;
      release(); container.dataset.fxState = 'error'; failed(cause);
    });
    return release;
  }, [plan, resolveAsset]);

  return <div ref={containerRef} className={className} style={{ width: '100%', ...style }}>
    <canvas ref={canvasRef} width={plan.document.viewport[0]} height={plan.document.viewport[1]}
      style={{ display: 'block', width: '100%', height: 'auto' }} aria-label={ariaLabel} />
  </div>;
}
export type { Player, AssetResolver } from '@aether-fx/canvas';
