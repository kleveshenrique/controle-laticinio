"use client";

import { useEffect } from "react";
import { avisarCadastroCriado, type TipoCadastro } from "@/lib/cadastroNovaAba";

export function AvisarOrigem({ tipo, nome, refOrigem }: { tipo: TipoCadastro; nome: string; refOrigem: string }) {
  useEffect(() => {
    avisarCadastroCriado({ tipo, nome, ref: refOrigem });
    // Volta para a aba do lançamento. O navegador só permite fechar abas abertas por script (window.open).
    const t = setTimeout(() => window.close(), 600);
    return () => clearTimeout(t);
  }, [tipo, nome, refOrigem]);
  return null;
}
