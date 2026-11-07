"use client";

import { PdfPicker } from "@/components/PdfPicker";
import { MAX_ANEXOS, TIPOS_ANEXO, type TipoAnexo } from "@/lib/anexos";

export type AnexoExistente = { id: string; kind: TipoAnexo; fileName: string };
export type NovosAnexos = Partial<Record<TipoAnexo, File[]>>;

/** Lista os anexos existentes de uma conta (com opção de remover) e permite incluir novos PDFs por tipo. */
export function AnexosEditor({
  tipos,
  anexos,
  novos,
  onNovos,
  remover,
  onRemover,
  podeAlterar,
  podeRemover,
}: {
  tipos: TipoAnexo[];
  anexos: AnexoExistente[];
  novos: NovosAnexos;
  onNovos: (n: NovosAnexos) => void;
  remover: string[];
  onRemover: (ids: string[]) => void;
  podeAlterar: (kind: TipoAnexo) => boolean;
  podeRemover: (kind: TipoAnexo) => boolean;
}) {
  return (
    <>
      {tipos.map((kind) => {
        const { label, botao } = TIPOS_ANEXO[kind];
        const existentes = anexos.filter((a) => a.kind === kind);
        const ficam = existentes.filter((a) => !remover.includes(a.id)).length;
        return (
          <section key={kind} className="space-y-1 border-t border-line pt-3">
            {existentes.length > 0 && (
              <ul className="space-y-1">
                {existentes.map((a) => {
                  const marcado = remover.includes(a.id);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-xs">
                      <a
                        href={`/anexos/${a.id}`}
                        target="_blank"
                        rel="noopener"
                        className={`truncate hover:underline ${marcado ? "text-muted line-through" : ""}`}
                        title={a.fileName}
                      >
                        {a.fileName}
                      </a>
                      {podeRemover(kind) && (
                        <button
                          type="button"
                          className={marcado ? "text-brand-700 hover:underline" : "text-red-700 hover:underline"}
                          onClick={() => onRemover(marcado ? remover.filter((x) => x !== a.id) : [...remover, a.id])}
                        >
                          {marcado ? "desfazer" : "remover"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {podeAlterar(kind) ? (
              <PdfPicker
                label={label}
                buttonLabel={botao}
                files={novos[kind] ?? []}
                onChange={(f) => onNovos({ ...novos, [kind]: f })}
                max={MAX_ANEXOS - ficam}
              />
            ) : (
              <p className="text-xs font-medium text-muted">
                {label} <span className="font-normal">({existentes.length}/{MAX_ANEXOS} PDF) · somente o administrador pode alterar</span>
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

/** Monta o FormData dos anexos: ids a remover e arquivos novos no campo de cada tipo. */
export function anexosParaFormData(fd: FormData, novos: NovosAnexos, remover: string[]) {
  remover.forEach((r) => fd.append("remover", r));
  (Object.keys(novos) as TipoAnexo[]).forEach((k) => novos[k]?.forEach((f) => fd.append(TIPOS_ANEXO[k].campo, f)));
}

export const alterouAnexos = (novos: NovosAnexos, remover: string[]) =>
  remover.length > 0 || Object.values(novos).some((l) => l && l.length > 0);
