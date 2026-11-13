"use client";

import { useState } from "react";
import { CampoBusca } from "@/components/CampoBusca";
import { CadastroRapido } from "@/components/CadastroRapido";

/**
 * Campo de categoria com busca e botão "+" para cadastrar uma nova categoria (modal de cadastro rápido).
 * A categoria cadastrada entra na lista e já fica selecionada.
 * Controlado (value/onChange) ou, com `name`, envia o valor num <input hidden> para formulários do servidor.
 */
export function CampoCategoria({
  opcoes: opcoesIniciais,
  value,
  onChange,
  name,
  id,
}: {
  opcoes: string[];
  value?: string;
  onChange?: (v: string) => void;
  name?: string;
  id?: string;
}) {
  const [opcoes, setOpcoes] = useState(opcoesIniciais);
  const [interno, setInterno] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const valor = value ?? interno;
  const mudar = (v: string) => (onChange ? onChange(v) : setInterno(v));

  return (
    <>
      <div className="flex gap-1">
        <CampoBusca
          id={id}
          placeholder="Buscar categoria"
          opcoes={opcoes}
          value={valor}
          onChange={mudar}
          vazio="Nenhuma categoria ativa encontrada. Use o “+” para cadastrar."
        />
        <button
          type="button"
          className="btn shrink-0 px-2.5 text-base leading-none"
          title="Cadastrar nova categoria"
          aria-label="Cadastrar nova categoria"
          onClick={() => setCadastrando(true)}
        >
          +
        </button>
      </div>
      {name && <input type="hidden" name={name} value={valor} />}
      <CadastroRapido
        tipo={cadastrando ? "categoria" : null}
        onClose={() => setCadastrando(false)}
        onSalvo={(_, nome) => {
          setOpcoes((l) => (l.includes(nome) ? l : [...l, nome].sort((a, b) => a.localeCompare(b, "pt-BR"))));
          mudar(nome);
        }}
      />
    </>
  );
}
