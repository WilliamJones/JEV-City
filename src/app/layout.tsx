import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const display = Space_Grotesk({ variable: '--font-display', subsets: ['latin'], weight: ['500', '700'] });
const mono = JetBrains_Mono({ variable: '--font-mono', subsets: ['latin'], weight: ['400', '600'] });

export const metadata: Metadata = {
  title: 'JEV City — the little city with big decisions',
  description:
    '25 citizens, one living district, every decision made by TypeSafe JEV. Inspect each choice, its probabilities and the real measured latency.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable} ${mono.variable} antialiased`}>{children}</body>
    </html>
  );
}
