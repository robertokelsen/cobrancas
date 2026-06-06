'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('GlobalError capturado:', error);
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'sans-serif', padding: 40 }}>
        <h2>Algo deu errado.</h2>
        <p>{error?.message || 'Erro desconhecido'}</p>
        {error?.digest && <p>digest: {error.digest}</p>}
        <button onClick={() => reset()}>Tentar novamente</button>
      </body>
    </html>
  );
}
