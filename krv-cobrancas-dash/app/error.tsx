'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('Error boundary:', error);
  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h2>Ocorreu um erro nesta página.</h2>
      <p>{error?.message}</p>
      <button onClick={() => reset()}>Tentar novamente</button>
    </div>
  );
}
