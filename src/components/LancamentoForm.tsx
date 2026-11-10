"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { lancarContas } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PdfPicker } from "@/components/PdfPicker";
import { brl, ehPix, maskMoney, parseMoney } from "@/lib/format";
import { CadastroRapido, type TipoCadastro } from "@/components/CadastroRapido";
import { CampoBusca } from "@/components/CampoBusca";
import { ISO, MAX_PARCELAS, numParcelas, parcelasValidas, ParcelasEditor, refazParcelas, type Parcela } from "@/components/ParcelasEditor";

type Row = {
  description: string; supplier: string; category: string; paymentMethod: string; pixKey: string;
  amount: string; dueDate: string; notes: string; pedido: File[]; notas: File[]; boletos: File[];
  /** Quantidade de parcelas digitada; com 2 ou mais, cada parcela tem seu valor e vencimento e vira uma conta. */
  qtdParcelas: string; parcelas: Parcela[];
};
const empty = (): Row => ({
  description: "", supplier: "", category: "", paymentMethod: "", pixKey: "", amount: "", dueDate: "", notes: "", pedido: [], notas: [], boletos: [],
  qtdParcelas: "1", parcelas: [],
});

/** Mudar o valor ou a quantidade de parcelas redistribui o valor entre as parcelas. */
const refazLinha = (r: Row): Row => {
  const parcelas = refazParcelas(r.amount, r.qtdParcelas, r.dueDate, r.parcelas);
  // Voltando para 1 parcela, o vencimento da linha fica com o da 1ª parcela.
  return { ...r, parcelas, dueDate: parcelas.length ? r.dueDate : r.parcelas[0]?.dueDate || r.dueDate };
};


/** Fornecedor/categoria só podem ser escolhidos entre os já cadastrados (sem diferenciar maiúsculas). */
const naLista = (lista: string[], v: string) => lista.some((n) => n.toLowerCase() === v.trim().toLowerCase());

/** Mesmas regras validadas no servidor (lancarContas). */
const invalidFields = (r: Row, fornecedores: string[], categorias: string[], formas: string[]) => ({
  description: r.description.trim().length < 2,
  supplier: !naLista(fornecedores, r.supplier),
  category: !naLista(categorias, r.category),
  paymentMethod: !naLista(formas, r.paymentMethod),
  pixKey: ehPix(r.paymentMethod) && r.pixKey.trim().length < 3,
  amount: !(parseMoney(r.amount) > 0),
  dueDate: numParcelas(r.qtdParcelas) > 1 ? r.parcelas.some((p) => !ISO.test(p.dueDate)) : !ISO.test(r.dueDate),
  parcelas: numParcelas(r.qtdParcelas) > 1 && !parcelasValidas(r.amount, r.parcelas),
  // No máximo um boleto por parcela.
  boletos: r.boletos.length > numParcelas(r.qtdParcelas),
});
const isFilled = (r: Row) =>
  Boolean(r.description || r.supplier || r.category || r.paymentMethod || r.amount || r.dueDate || r.notes.trim() || r.pedido.length || r.notas.length || r.boletos.length);

export function LancamentoForm({ suppliers, categories, paymentMethods }: { suppliers: string[]; categories: string[]; paymentMethods: string[] }) {
  const [rows, setRows] = useState<Row[]>([empty()]);
  const set = <K extends keyof Row>(i: number, k: K, v: Row[K]) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setParcelado = (i: number, k: "amount" | "qtdParcelas", v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? refazLinha({ ...r, [k]: v }) : r)));
  const setParcela = (i: number, k: number, campo: keyof Parcela, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, parcelas: r.parcelas.map((p, x) => (x === k ? { ...p, [campo]: v } : p)) } : r)));
  // Fornecedores/categorias cadastrados pelo modal (botões "+") entram nas listas e preenchem a linha de onde o cadastro foi aberto.
  const [fornecedores, setFornecedores] = useState(suppliers);
  const [categorias, setCategorias] = useState(categories);
  const filled = rows.filter(isFilled);
  const valid = filled.length > 0 && filled.every((r) => !Object.values(invalidFields(r, fornecedores, categorias, paymentMethods)).some(Boolean));
  const total = filled.reduce((s, r) => s + parseMoney(r.amount), 0);
  // A coluna "Chave Pix" (logo depois da forma de pagamento) só aparece quando alguma linha usa Pix.
  const temPix = rows.some((r) => ehPix(r.paymentMethod));
  const grid = `grid gap-2 ${temPix ? "md:grid-cols-[1.8fr_1.4fr_1.2fr_1fr_1.3fr_1fr_0.6fr_1fr]" : "md:grid-cols-[2fr_1.5fr_1.2fr_1fr_1fr_0.6fr_1fr]"}`;
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const enviado = useRef(false);

  const [cadastro, setCadastro] = useState<{ tipo: TipoCadastro; linha: number } | null>(null);
  useEffect(() => setFornecedores(suppliers), [suppliers]);
  useEffect(() => setCategorias(categories), [categories]);
  const cadastrado = (tipo: TipoCadastro, nome: string) => {
    const incluir = (l: string[]) => (l.includes(nome) ? l : [...l, nome].sort((a, b) => a.localeCompare(b, "pt-BR")));
    (tipo === "fornecedor" ? setFornecedores : setCategorias)(incluir);
    const linha = cadastro?.linha;
    if (linha !== undefined) set(linha, tipo === "fornecedor" ? "supplier" : "category", nome);
  };
  const botaoNovo = (tipo: TipoCadastro, i: number) => (
    <button
      type="button"
      className="btn shrink-0 px-2.5 text-base leading-none"
      title={tipo === "fornecedor" ? "Cadastrar novo fornecedor" : "Cadastrar nova categoria"}
      aria-label={tipo === "fornecedor" ? "Cadastrar novo fornecedor" : "Cadastrar nova categoria"}
      onClick={() => setCadastro({ tipo, linha: i })}
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
        fd.set(
          "rows",
          JSON.stringify(
            filled.map(({ pedido, notas, boletos, qtdParcelas, parcelas, ...dados }) => {
              const parcelado = numParcelas(qtdParcelas) > 1;
              return {
                ...dados,
                pixKey: ehPix(dados.paymentMethod) ? dados.pixKey : "",
                dueDate: parcelado ? parcelas[0].dueDate : dados.dueDate,
                parcelas: parcelado ? parcelas : undefined,
              };
            }),
          ),
        );
        filled.forEach((r, i) => {
          r.pedido.forEach((f) => fd.append(`pedido_${i}`, f));
          r.notas.forEach((f) => fd.append(`nota_${i}`, f));
          r.boletos.forEach((f) => fd.append(`boleto_${i}`, f));
        });
        enviado.current = true;
        startTransition(() => lancarContas(fd));
      }}
    >
      <CadastroRapido tipo={cadastro?.tipo ?? null} onClose={() => setCadastro(null)} onSalvo={cadastrado} />
      <fieldset disabled={pending} className="space-y-3">
        <div className={`${grid} hidden text-xs font-medium text-muted md:grid`}>
          <span>Descrição</span><span>Fornecedor</span><span>Categoria</span><span>Forma de pagamento</span>{temPix && <span>Chave Pix</span>}<span>Valor (R$)</span><span>Parcelas</span><span>Vencimento</span>
        </div>

        {rows.map((r, i) => {
          // Os PDFs só podem ser adicionados depois que os dados da conta estão preenchidos corretamente.
          const inv = invalidFields(r, fornecedores, categorias, paymentMethods);
          const pix = ehPix(r.paymentMethod);
          // Excesso de boletos não bloqueia os botões de PDF (tem aviso próprio, junto dos boletos).
          const semDados = Object.entries(inv).some(([k, v]) => k !== "boletos" && v);
          const naoCadastrado = [
            r.supplier.trim() && inv.supplier ? `fornecedor "${r.supplier.trim()}"` : "",
            r.category.trim() && inv.category ? `categoria "${r.category.trim()}"` : "",
          ].filter(Boolean);
          const n = numParcelas(r.qtdParcelas);
          const hint = `Preencha descrição, fornecedor, categoria, forma de pagamento${pix ? ", chave Pix" : ""}, valor e vencimento${n > 1 ? " de cada parcela" : ""} para adicionar PDFs.`;          return (
            <div key={i} className={`space-y-2 ${i > 0 ? "border-t border-line pt-3" : ""}`}>
              <div className={grid}>
                <input className="input" placeholder="Descrição" value={r.description} onChange={(e) => set(i, "description", e.target.value)} />
                <div className="flex gap-1">
                  <CampoBusca placeholder="Buscar fornecedor" opcoes={fornecedores} value={r.supplier} onChange={(v) => set(i, "supplier", v)} vazio="Nenhum fornecedor ativo encontrado. Use o “+” para cadastrar." />
                  {botaoNovo("fornecedor", i)}
                </div>
                <div className="flex gap-1">
                  <CampoBusca placeholder="Buscar categoria" opcoes={categorias} value={r.category} onChange={(v) => set(i, "category", v)} vazio="Nenhuma categoria ativa encontrada. Use o “+” para cadastrar." />
                  {botaoNovo("categoria", i)}
                </div>
                <select className="input" aria-label="Forma de pagamento" value={r.paymentMethod} onChange={(e) => set(i, "paymentMethod", e.target.value)}>
                  <option value="">Forma de pagamento</option>
                  {paymentMethods.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {pix ? (
                  <input
                    className="input"
                    aria-label="Chave Pix"
                    placeholder="Chave Pix"
                    title="CPF/CNPJ, e-mail, telefone ou chave aleatória"
                    maxLength={150}
                    value={r.pixKey}
                    onChange={(e) => set(i, "pixKey", e.target.value)}
                  />
                ) : (
                  temPix && <div className="hidden md:block" />
                )}
                <input className="input text-right" placeholder="R$ 0,00" inputMode="numeric" value={r.amount} onChange={(e) => setParcelado(i, "amount", maskMoney(e.target.value))} />
                <input
                  className="input text-center"
                  type="number"
                  min={1}
                  max={MAX_PARCELAS}
                  aria-label="Quantidade de parcelas"
                  title="Quantidade de parcelas"
                  value={r.qtdParcelas}
                  onChange={(e) => setParcelado(i, "qtdParcelas", e.target.value)}
                  onBlur={() => set(i, "qtdParcelas", String(n))}
                />
                {n > 1 ? (
                  <div className="input flex items-center text-xs text-muted">{n} vencimentos abaixo</div>
                ) : (
                  <input className="input" type="date" aria-label="Vencimento" value={r.dueDate} onChange={(e) => set(i, "dueDate", e.target.value)} />
                )}
              </div>
              {n > 1 && <ParcelasEditor amount={r.amount} parcelas={r.parcelas} onChange={(k, campo, v) => setParcela(i, k, campo, v)} />}
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
                <div>
                  <PdfPicker label="Boletos" buttonLabel="Boleto PDF" files={r.boletos} onChange={(f) => set(i, "boletos", f)} disabled={semDados} disabledHint={hint} limite={n} />
                  {inv.boletos && (
                    <p className="mt-1 text-xs text-red-700">
                      São {r.boletos.length} boletos para {n} parcela(s): no máximo um boleto por parcela. Remova {r.boletos.length - n} boleto(s) ou aumente as parcelas.
                    </p>
                  )}
                </div>
              </div>
              {naoCadastrado.length > 0 && (
                <p className="text-xs text-red-700">
                  Não cadastrado: {naoCadastrado.join(" e ")}. Escolha um da lista ou cadastre pelo botão “+”.
                </p>
              )}
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
