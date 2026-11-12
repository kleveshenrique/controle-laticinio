"use client";

import { useEffect, useState, useTransition } from "react";
import { adicionarCotacao, editarCotacao } from "@/app/actions";
import { MAX_ANEXOS } from "@/lib/anexos";
import { CampoBusca } from "@/components/CampoBusca";
import { CadastroRapido } from "@/components/CadastroRapido";
import { PdfPicker } from "@/components/PdfPicker";
import { SubmitButton } from "@/components/SubmitButton";
import { MAX_PARCELAS, numParcelas, ParcelasEditor, parcelasValidas, refazParcelas, type Parcela } from "@/components/ParcelasEditor";
import { ehPix, maskMoney, parseMoney } from "@/lib/format";

/** Cotação já gravada, para o modo edição (valores no formato do formulário). */
export type CotacaoInicial = {
  id: string;
  supplier: string;
  paymentMethod: string;
  pixKey: string;
  amount: string;
  dueDate: string;
  parcelas: Parcela[];
  notes: string;
  anexos: { id: string; fileName: string }[];
};

/**
 * Formulário de cotação: fornecedor, forma de pagamento, valor, vencimento/parcelas, observações e proposta anexada.
 * Com `cotacao`, edita a cotação (pode também remover arquivos já anexados).
 */
export function NovaCotacao({
  purchaseOrderId,
  fornecedores: fornecedoresIniciais,
  formas,
  cotacao,
  onEnviar,
}: {
  purchaseOrderId: string;
  fornecedores: string[];
  formas: string[];
  cotacao?: CotacaoInicial;
  /** Chamado ao enviar (ex.: fechar o modal de edição). */
  onEnviar?: () => void;
}) {
  const [supplier, setSupplier] = useState(cotacao?.supplier ?? "");
  const [paymentMethod, setPaymentMethod] = useState(cotacao?.paymentMethod ?? "");
  const [pixKey, setPixKey] = useState(cotacao?.pixKey ?? "");
  const [amount, setAmount] = useState(cotacao?.amount ?? "");
  const [qtd, setQtd] = useState(String(Math.max(1, cotacao?.parcelas.length ?? 1)));
  const [dueDate, setDueDate] = useState(cotacao?.dueDate ?? "");
  const [parcelas, setParcelas] = useState<Parcela[]>(cotacao?.parcelas ?? []);
  const [notes, setNotes] = useState(cotacao?.notes ?? "");
  const [remover, setRemover] = useState<string[]>([]);
  const ficam = (cotacao?.anexos.length ?? 0) - remover.length;
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [pending, start] = useTransition();
  // Fornecedor cadastrado pelo "+" entra na lista e já fica selecionado.
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [cadastrando, setCadastrando] = useState(false);
  useEffect(() => setFornecedores(fornecedoresIniciais), [fornecedoresIniciais]);

  const n = numParcelas(qtd);
  const pix = ehPix(paymentMethod);
  const valido =
    supplier.trim().length >= 2 &&
    !!paymentMethod &&
    (!pix || pixKey.trim().length >= 3) &&
    parseMoney(amount) > 0 &&
    (n > 1 ? parcelasValidas(amount, parcelas) : !!dueDate);

  const mudouParcelamento = (novoValor: string, novaQtd: string, novoVenc: string) =>
    setParcelas(refazParcelas(novoValor, novaQtd, novoVenc, cotacao ? parcelas : []));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valido) return;
        const fd = new FormData();
        fd.append("purchaseOrderId", purchaseOrderId);
        if (cotacao) fd.append("id", cotacao.id);
        remover.forEach((r) => fd.append("remover", r));
        fd.append("supplier", supplier.trim());
        fd.append("paymentMethod", paymentMethod);
        if (pix) fd.append("pixKey", pixKey.trim());
        fd.append("amount", amount);
        fd.append("dueDate", n > 1 ? parcelas[0].dueDate : dueDate);
        if (n > 1) fd.append("parcelas", JSON.stringify(parcelas));
        if (notes.trim()) fd.append("notes", notes.trim());
        arquivos.forEach((f) => fd.append("anexo", f));
        onEnviar?.();
        start(() => (cotacao ? editarCotacao(fd) : adicionarCotacao(fd)));
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex gap-1">
          <CampoBusca placeholder="Buscar fornecedor" opcoes={fornecedores} value={supplier} onChange={setSupplier} vazio="Nenhum fornecedor ativo encontrado. Use o “+” para cadastrar." />
          <button
            type="button"
            className="btn shrink-0 px-2.5 text-base leading-none"
            title="Cadastrar novo fornecedor"
            aria-label="Cadastrar novo fornecedor"
            onClick={() => setCadastrando(true)}
          >
            +
          </button>
        </div>
        <select className="input" aria-label="Forma de pagamento" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="">Forma de pagamento</option>
          {formas.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {pix && (
          <input className="input md:col-span-2" placeholder="Chave Pix" maxLength={150} value={pixKey} onChange={(e) => setPixKey(e.target.value)} />
        )}
      </div>
      <CadastroRapido
        tipo={cadastrando ? "fornecedor" : null}
        onClose={() => setCadastrando(false)}
        onSalvo={(_, nome) => {
          setFornecedores((l) => (l.includes(nome) ? l : [...l, nome].sort((a, b) => a.localeCompare(b, "pt-BR"))));
          setSupplier(nome);
        }}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          className="input text-right"
          placeholder="R$ 0,00"
          inputMode="numeric"
          aria-label="Valor"
          value={amount}
          onChange={(e) => {
            const v = maskMoney(e.target.value);
            setAmount(v);
            mudouParcelamento(v, qtd, dueDate);
          }}
        />
        <input
          className="input text-center"
          type="number"
          min={1}
          max={MAX_PARCELAS}
          aria-label="Quantidade de parcelas"
          title="Quantidade de parcelas"
          value={qtd}
          onChange={(e) => {
            setQtd(e.target.value);
            mudouParcelamento(amount, e.target.value, dueDate);
          }}
          onBlur={() => setQtd(String(n))}
        />
        {n > 1 ? (
          <div className="input flex items-center text-xs text-muted">{n} vencimentos abaixo</div>
        ) : (
          <input className="input" type="date" aria-label="Vencimento" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        )}
      </div>
      {n > 1 && (
        <ParcelasEditor
          amount={amount}
          parcelas={parcelas}
          onChange={(k, campo, v) => setParcelas(parcelas.map((p, j) => (j === k ? { ...p, [campo]: v } : p)))}
        />
      )}
      <textarea className="input min-h-[60px]" placeholder="Observações da cotação (prazo de entrega, condições…)" maxLength={1000} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {cotacao && cotacao.anexos.length > 0 && (
        <ul className="space-y-1">
          {cotacao.anexos.map((a) => {
            const marcado = remover.includes(a.id);
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-xs">
                <a href={`/anexos/cotacao/${a.id}`} target="_blank" rel="noopener" className={`truncate hover:underline ${marcado ? "text-muted line-through" : ""}`} title={a.fileName}>
                  {a.fileName}
                </a>
                <button
                  type="button"
                  className={marcado ? "text-brand-700 hover:underline" : "text-red-700 hover:underline"}
                  onClick={() => setRemover(marcado ? remover.filter((x) => x !== a.id) : [...remover, a.id])}
                >
                  {marcado ? "desfazer" : "remover"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <PdfPicker label="Proposta / cotação" buttonLabel="Anexo" files={arquivos} onChange={setArquivos} max={Math.max(0, MAX_ANEXOS - ficam)} />
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={!valido} pendingText="Salvando…">{cotacao ? "Salvar cotação" : "Incluir cotação"}</SubmitButton>
      </div>
    </form>
  );
}
