"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { lancarContas } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PdfPicker } from "@/components/PdfPicker";
import { brl, maskMoney, parseMoney } from "@/lib/format";
import { abrirCadastroNovaAba, ouvirCadastroCriado, type TipoCadastro } from "@/lib/cadastroNovaAba";

type Row = { description: string; supplier: string; category: string; amount: string; dueDate: string; notes: string; pedido: File[]; notas: File[]; boletos: File[] };
const empty = (): Row => ({ description: "", supplier: "", category: "", amount: "", dueDate: "", notes: "", pedido: [], notas: [], boletos: [] });


/** Mesmas regras validadas no servidor (lancarContas). */
const invalidFields = (r: Row) => ({
  description: r.description.trim().length < 2,
  supplier: r.supplier.trim().length < 2,
  category: r.category.trim().length < 2,
  amount: !(parseMoney(r.amount) > 0),
  dueDate: !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate),
});
const isFilled = (r: Row) =>
  Boolean(r.description || r.supplier || r.category || r.amount || r.dueDate || r.notes.trim() || r.pedido.length || r.notas.length || r.boletos.length);

export function LancamentoForm({ suppliers, categories }: { suppliers: string[]; categories: string[] }) {
  const [rows, setRows] = useState<Row[]>([empty()]);
  const set = <K extends keyof Row>(i: number, k: K, v: Row[K]) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const filled = rows.filter(isFilled);
  const valid = filled.length > 0 && filled.every((r) => !Object.values(invalidFields(r)).some(Boolean));
  const total = filled.reduce((s, r) => s + parseMoney(r.amount), 0);
  const grid = "grid gap-2 md:grid-cols-[2fr_1.5fr_1.2fr_1fr_1fr]";
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const enviado = useRef(false);

  // Fornecedores/categorias cadastrados em outra aba (botões "+") entram nas listas e preenchem a linha de onde o cadastro foi aberto.
  const [fornecedores, setFornecedores] = useState(suppliers);
  const [categorias, setCategorias] = useState(categories);
  const formId = useRef("");
  const refLinha = (i: number) => {
    if (!formId.current) formId.current = Math.random().toString(36).slice(2, 10);
    return `lanc-${formId.current}-${i}`;
  };
  useEffect(() => setFornecedores(suppliers), [suppliers]);
  useEffect(() => setCategorias(categories), [categories]);
  useEffect(
    () =>
      ouvirCadastroCriado(({ tipo, nome, ref }) => {
        const incluir = (l: string[]) => (l.includes(nome) ? l : [...l, nome].sort((a, b) => a.localeCompare(b, "pt-BR")));
        (tipo === "fornecedor" ? setFornecedores : setCategorias)(incluir);
        if (!formId.current) return;
        const campo = tipo === "fornecedor" ? "supplier" : "category";
        setRows((rs) => rs.map((r, j) => (ref === refLinha(j) ? { ...r, [campo]: nome } : r)));
      }),
    [],
  );
  const botaoNovo = (tipo: TipoCadastro, i: number) => (
    <button
      type="button"
      className="btn shrink-0 px-2.5 text-base leading-none"
      title={`Cadastrar ${tipo === "fornecedor" ? "novo fornecedor" : "nova categoria"} (abre em outra aba; ao salvar, já aparece aqui)`}
      aria-label={tipo === "fornecedor" ? "Cadastrar novo fornecedor" : "Cadastrar nova categoria"}
      onClick={() => abrirCadastroNovaAba(tipo, refLinha(i))}
    >
      +
    </button>
  );

  // Quando o envio termina sem erro, limpa os campos. Em caso de erro mantém o que foi digitado para correção.
  useEffect(() => {
    if (pending || !enviado.current) return;
    enviado.current = false;
    if (!searchParams.get("erro")) setRows([empty()]);
  }, [pending, searchParams]);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !valid) return;
        // Os dados vão em JSON; os PDFs vão como arquivos, identificados pelo índice da linha.
        const fd = new FormData();
        fd.set("rows", JSON.stringify(filled.map(({ pedido, notas, boletos, ...dados }) => dados)));
        filled.forEach((r, i) => {
          r.pedido.forEach((f) => fd.append(`pedido_${i}`, f));
          r.notas.forEach((f) => fd.append(`nota_${i}`, f));
          r.boletos.forEach((f) => fd.append(`boleto_${i}`, f));
        });
        enviado.current = true;
        startTransition(() => lancarContas(fd));
      }}
    >
      <fieldset disabled={pending} className="space-y-3">
        <datalist id="fornecedores">{fornecedores.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="categorias">{categorias.map((s) => <option key={s} value={s} />)}</datalist>

        <div className={`${grid} hidden text-xs font-medium text-muted md:grid`}>
          <span>Descrição</span><span>Fornecedor</span><span>Categoria</span><span>Valor (R$)</span><span>Vencimento</span>
        </div>

        {rows.map((r, i) => {
          // Os PDFs só podem ser adicionados depois que os dados da conta estão preenchidos corretamente.
          const semDados = Object.values(invalidFields(r)).some(Boolean);
          const hint = "Preencha descrição, fornecedor, categoria, valor e vencimento para adicionar PDFs.";
          return (
            <div key={i} className={`space-y-2 ${i > 0 ? "border-t border-line pt-3" : ""}`}>
              <div className={grid}>
                <input className="input" placeholder="Descrição" value={r.description} onChange={(e) => set(i, "description", e.target.value)} />
                <div className="flex gap-1">
                  <input className="input" placeholder="Fornecedor" list="fornecedores" value={r.supplier} onChange={(e) => set(i, "supplier", e.target.value)} />
                  {botaoNovo("fornecedor", i)}
                </div>
                <div className="flex gap-1">
                  <input className="input" placeholder="Categoria" list="categorias" value={r.category} onChange={(e) => set(i, "category", e.target.value)} />
                  {botaoNovo("categoria", i)}
                </div>
                <input className="input text-right" placeholder="R$ 0,00" inputMode="numeric" value={r.amount} onChange={(e) => set(i, "amount", maskMoney(e.target.value))} />
                <input className="input" type="date" value={r.dueDate} onChange={(e) => set(i, "dueDate", e.target.value)} />
              </div>
              <textarea
                className="input min-h-[60px]"
                placeholder="Observações (opcional)"
                maxLength={1000}
                rows={2}
                value={r.notes}
                onChange={(e) => set(i, "notes", e.target.value)}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <PdfPicker label="Pedido" buttonLabel="Pedido PDF" files={r.pedido} onChange={(f) => set(i, "pedido", f)} disabled={semDados} disabledHint={hint} />
                <PdfPicker label="Nota fiscal" buttonLabel="Nota fiscal PDF" files={r.notas} onChange={(f) => set(i, "notas", f)} disabled={semDados} disabledHint={hint} />
                <PdfPicker label="Boletos" buttonLabel="Boleto PDF" files={r.boletos} onChange={(f) => set(i, "boletos", f)} disabled={semDados} disabledHint={hint} />
              </div>
              {semDados && <p className="text-xs text-muted">{hint}</p>}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted">{filled.length} conta(s) · total <strong className="text-ink">{brl(total)}</strong></span>
            <SubmitButton disabled={!valid} pending={pending} pendingText="Lançando…">Lançar contas</SubmitButton>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
