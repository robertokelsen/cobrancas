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
        {/* Tailwind via CDN para simplicidade (sem build de CSS). Para produção
            de alto tráfego, troque por Tailwind compilado. */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
