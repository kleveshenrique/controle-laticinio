"use client";

import { useState } from "react";
import { CampoBusca } from "@/components/CampoBusca";

/** CampoBusca para formulários enviados direto ao servidor: o valor escolhido vai num <input hidden name={name}>. */
export function CampoBuscaForm({ name, ...props }: { name: string; id?: string; opcoes: string[]; placeholder?: string; vazio?: string }) {
  const [valor, setValor] = useState("");
  return (
    <>
      <CampoBusca {...props} value={valor} onChange={setValor} />
      <input type="hidden" name={name} value={valor} />
    </>
  );
}
