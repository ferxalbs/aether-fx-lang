'use client';
import { useRef, useState } from 'react';
import { FxPlayer } from '@aether-fx/react';
import type { Player, AssetResolver } from '@aether-fx/react';
import type { PlaybackPlan } from '@aether-fx/core';
const resolveAsset: AssetResolver = async (asset, signal) => {
  const response = await fetch('/assets/' + asset.id, { ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error('Unable to load ' + asset.id);
  return response.arrayBuffer();
};
export function Preview({ plan }: { plan: PlaybackPlan }) {
  const player = useRef<Player>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [selectedFrame, setSelectedFrame] = useState(0), [session, setSession] = useState(0), [rate, setRate] = useState(1);
  const seek = (frame: number) => { player.current!.seekFrame(frame); setSelectedFrame(frame); };
  return <section aria-label="Animation preview">
    <FxPlayer key={session} plan={plan} resolveAsset={resolveAsset} ref={player} className="stage" ariaLabel="Little Light illustrated animation"
      onReady={() => { player.current!.setPlaybackRate(rate); setReady(true); }} onError={cause => { setError(cause.message); setReady(false); }} />
    <div className="controls">
      <button disabled={!ready} onClick={() => { void player.current!.play().catch(cause => setError(String(cause))); }}>Play</button>
      <button disabled={!ready} onClick={() => { player.current!.pause(); setSelectedFrame(player.current!.getCurrentFrame()); }}>Pause</button>
      <button disabled={!ready} onClick={() => seek(97)}>Seek frame 97</button>
      <label>Speed <select disabled={!ready} value={rate} onChange={event => { const value = Number(event.target.value); player.current!.setPlaybackRate(value); setRate(value); }}>
        <option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option>
      </select></label>
      <button onClick={() => { setReady(false); setError(''); setSelectedFrame(0); setRate(1); setSession(value => value + 1); }}>Restart preview</button>
    </div>
    <input aria-label="Seek frame" type="range" min="0" max={plan.duration - 1} value={selectedFrame} disabled={!ready} onChange={event => seek(Number(event.target.value))} />
    <p role="status">{error || (ready ? 'Ready' : 'Loading illustrated assets…')}</p>
    <output aria-label="Selected frame">Frame {selectedFrame} / {plan.duration - 1}</output>
  </section>;
}
