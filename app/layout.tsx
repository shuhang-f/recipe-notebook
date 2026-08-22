import type { Metadata } from 'next';
import './globals.css';

const title = 'Recipe Notebook';
const description = 'A quiet place to keep the recipes you actually cook.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: title,
    images: [
      {
        url: '/og.png',
        width: 1672,
        height: 941,
        alt: 'Recipe Notebook — a quiet place for the food you make.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
