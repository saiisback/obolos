import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Obolos — Work, within limits.',
  icons: {
    icon: [
      { url: '/brand/obolos-symbol-black.png', type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: '/brand/obolos-symbol-white.png', type: 'image/png', media: '(prefers-color-scheme: dark)' },
    ],
  },
  description: 'A workspace for agent research, human-defined budgets, and verifiable payment evidence.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
