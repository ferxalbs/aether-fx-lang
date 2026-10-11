import { join } from 'node:path';
import { loadProject } from '@aether-fx/node';
import Link from 'next/link';
import { Preview } from './preview';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const loaded = await loadProject(join(process.cwd(), 'project/little-light.afx'));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
  return <main>
    <p className="eyebrow">AETHER Fx · an illustrated short</p><h1>Little Light</h1>
    <p>A quiet moment, a small lantern, and a little courage. Three shots · 20 seconds · 24 fps.</p>
    <Preview plan={loaded.value.plan} />
    <p><Link href="/about">About this short</Link></p>
  </main>;
}
