import type { Metadata } from 'next';
// Self-hosted fonts: builds never depend on fetching from Google Fonts.
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'JEV City — the little city with big decisions',
  description:
    '25 citizens, one living district, every decision made by TypeSafe JEV. Inspect each choice, its probabilities and the real measured latency.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
