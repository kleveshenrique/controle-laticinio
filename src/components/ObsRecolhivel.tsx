"use client";

import { useState, type ReactNode } from "react";
import { IconeMensagem } from "@/components/Icones";

/**
 * Botão "Obs" (balão de mensagem) que mostra/esconde as observações.
 * `aoLado` (ex.: anexos) fica na mesma linha do botão; o conteúdo abre logo abaixo.
 */
export function ObsRecolhivel({ resumo, aoLado, children }: { resumo?: ReactNode; aoLado?: ReactNode; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn inline-flex items-center gap-1 px-2 py-0.5 text-xs"
          title={aberto ? "Ocultar observações" : "Mostrar observações"}
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
        >
          <IconeMensagem className="h-3.5 w-3.5" />
          <span>Obs</span>
          {resumo}
        </button>
        {aoLado}
      </div>
      {aberto && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}
