"use client";

import { useId, useMemo, useRef, useState } from "react";

/** Minúsculas e sem acentos, para buscar "acai" e achar "Açaí". */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Campo de busca com lista de opções (fornecedores/categorias ativos).
 * A lista só aparece ao digitar, filtrada pelo trecho digitado ("*" mostra todos). Setas ↑/↓ navegam, Enter escolhe, Esc fecha.
 */
export function CampoBusca({
  value,
  onChange,
  opcoes,
  placeholder,
  vazio = "Nenhum resultado.",
  id: idCampo,
}: {
  /** id do <input>, para o <label htmlFor>. */
  id?: string;
  value: string;
  onChange: (v: string) => void;
  opcoes: string[];
  placeholder?: string;
  vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const filtradas = useMemo(() => {
    const q = normalizar(value);
    if (q === "*") return opcoes; // "*" lista todos
    return q ? opcoes.filter((o) => normalizar(o).includes(q)) : [];
  }, [value, opcoes]);

  const escolher = (o: string) => {
    onChange(o);
    setAberto(false);
  };

  const mover = (delta: number) => {
    if (!aberto || !filtradas.length) return;
    const n = (ativo + delta + filtradas.length) % Math.max(filtradas.length, 1);
    setAtivo(n);
    listaRef.current?.children[n]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="relative w-full">
      <input
        id={idCampo}
        className="input"
        placeholder={placeholder}
        value={value}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setAtivo(0);
          setAberto(e.target.value.trim() !== "");
        }}
        onBlur={() => {
          setAberto(false);
          // Digitou o nome inteiro com outra grafia (ex.: "acme"): ajusta para o nome cadastrado.
          const igual = opcoes.find((o) => o !== value && normalizar(o) === normalizar(value));
          if (igual) onChange(igual);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            mover(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            mover(-1);
          } else if (e.key === "Enter" && aberto && filtradas[ativo]) {
            e.preventDefault(); // não envia o lançamento
            escolher(filtradas[ativo]);
          } else if (e.key === "Escape" && aberto) {
            e.preventDefault();
            setAberto(false);
          }
        }}
      />
      {aberto && value.trim() && (
        <ul
          id={`${id}-lista`}
          ref={listaRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full min-w-[14rem] overflow-y-auto rounded-md border border-line bg-white py-1 text-sm shadow-lg"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-1.5 text-muted">{vazio}</li>
          ) : (
            filtradas.map((o, i) => (
              <li
                key={o}
                role="option"
                aria-selected={i === ativo}
                className={`cursor-pointer px-3 py-1.5 ${i === ativo ? "bg-brand-50 text-brand-900" : ""} ${o === value ? "font-semibold" : ""}`}
                // mousedown (antes do blur do campo) para a escolha não se perder.
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(o);
                }}
                onMouseEnter={() => setAtivo(i)}
              >
                {o}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
