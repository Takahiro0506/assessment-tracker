import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Assessment Tracker',
  description:
    'Build your semester and keep assessment deadlines, submissions and resubmissions together.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
