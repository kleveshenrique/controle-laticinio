"use client";

import { useId, useRef, useState } from "react";
import { MAX_ANEXOS, MAX_PDF_BYTES, MAX_PDF_MB } from "@/lib/anexos";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/** Seleção de até MAX_ANEXOS arquivos PDF, com lista dos escolhidos e opção de remover. */
export function PdfPicker({
  label,
  buttonLabel,
  files,
  onChange,
  disabled,
  disabledHint,
  max = MAX_ANEXOS,
}: {
  label: string;
  /** Texto do botão de adicionar (ex.: "Pedido PDF"). */
  buttonLabel: string;
  files: File[];
  onChange: (files: File[]) => void;
  /** Bloqueia a inclusão de novos arquivos (ex.: enquanto os dados da conta não estão válidos). */
  disabled?: boolean;
  disabledHint?: string;
  /** Quantos arquivos ainda cabem (padrão: MAX_ANEXOS). */
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [aviso, setAviso] = useState("");
  const cheio = files.length >= max;

  const adicionar = (lista: FileList | null) => {
    const novos = Array.from(lista ?? []);
    const avisos: string[] = [];
    const aceitos = novos.filter((f) => {
      const pdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      if (!pdf) avisos.push(`"${f.name}" não é PDF`);
      else if (f.size > MAX_PDF_BYTES) avisos.push(`"${f.name}" passa de ${MAX_PDF_MB} MB`);
      return pdf && f.size <= MAX_PDF_BYTES;
    });
    const todos = [...files, ...aceitos];
    if (todos.length > max) avisos.push(`máximo de ${MAX_ANEXOS} arquivos`);
    setAviso(avisos.join(" · "));
    onChange(todos.slice(0, max));
    if (input.current) input.current.value = "";
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label} <span className="font-normal">({MAX_ANEXOS - max + files.length}/{MAX_ANEXOS} PDF)</span>
        </label>
        <button type="button" className="btn px-2 py-0.5 text-xs" disabled={cheio || disabled} title={disabled ? disabledHint : undefined} onClick={() => input.current?.click()}>
          + {buttonLabel}
        </button>
        <input ref={input} id={id} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => adicionar(e.target.files)} />
      </div>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded border border-line bg-paper px-2 py-1 text-xs">
              <span className="truncate" title={f.name}>{f.name} <span className="text-muted">· {kb(f.size)}</span></span>
              <button type="button" className="text-red-700 hover:underline" aria-label={`Remover ${f.name}`} onClick={() => { setAviso(""); onChange(files.filter((_, j) => j !== i)); }}>
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="mt-1 text-xs text-red-700">Ignorado: {aviso}.</p>}
    </div>
  );
}
