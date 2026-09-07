import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Obolos — Work, within limits.',
  description: 'A workspace for agent research, human-defined budgets, and verifiable payment evidence.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
