import type { ReactNode } from 'react';
import './globals.css';
export const metadata = { title: 'Little Light · AETHER Fx', description: 'An illustrated short compiled on the server and played on Canvas.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
