// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'KRV — Cobranças',
  description: 'Dashboard de boletos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/krv-logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        {/* Tailwind via CDN + tema da marca KRV */}
        <script src="https://cdn.tailwindcss.com"></script>
        <script dangerouslySetInnerHTML={{ __html: "tailwind.config={theme:{extend:{colors:{krv:'#E0040B',krvdark:'#b80309',ink:'#15171c',charcoal:'#1b1d23'},fontFamily:{sans:['Inter','system-ui','sans-serif']}}}}" }} />
        <style dangerouslySetInnerHTML={{ __html: "body{font-family:Inter,system-ui,sans-serif}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
