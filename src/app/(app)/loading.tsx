// Exibido na hora em que se clica num link, enquanto o servidor busca os dados da nova página.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-24 rounded-md bg-line" />
        ))}
      </div>
      <div className="card space-y-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-line" />
        ))}
      </div>
    </div>
  );
}
