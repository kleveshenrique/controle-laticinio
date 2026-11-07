import type { TipoAnexo } from "@/lib/anexos";

type Anexo = { id: string; kind: TipoAnexo; fileName: string };

const PdfIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

/** PDFs (pedido, nota fiscal e boletos) de uma conta, como botões que abrem o arquivo em nova aba. */
export function Anexos({ anexos }: { anexos: Anexo[] }) {
  if (!anexos.length) return null;
  const grupos: [string, Anexo[]][] = [
    ["Pedido", anexos.filter((a) => a.kind === "PEDIDO")],
    ["Nota fiscal", anexos.filter((a) => a.kind === "NOTA_FISCAL")],
    ["Boleto", anexos.filter((a) => a.kind === "BOLETO")],
  ];
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {grupos.flatMap(([label, lista]) =>
        lista.map((a, i) => (
          <a
            key={a.id}
            href={`/anexos/${a.id}`}
            target="_blank"
            rel="noopener"
            title={a.fileName}
            className="btn gap-1 px-2 py-0.5 text-xs"
          >
            <PdfIcon />
            {lista.length > 1 ? `${label} ${i + 1}` : label}
          </a>
        )),
      )}
    </div>
  );
}
