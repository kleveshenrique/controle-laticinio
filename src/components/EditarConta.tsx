"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { editarConta } from "@/app/actions";
import { AnexosEditor, anexosParaFormData, type AnexoExistente, type NovosAnexos } from "@/components/AnexosEditor";
import { ehPix, maskMoney, parseMoney } from "@/lib/format";
import { IconeEditar } from "@/components/Icones";
import { BotaoAcao, useAcoesContas } from "@/components/AcoesContas";
import { CampoBusca } from "@/components/CampoBusca";
import { ISO, MAX_PARCELAS, numParcelas, parcelasValidas, ParcelasEditor, refazParcelas, type Parcela } from "@/components/ParcelasEditor";

type Conta = { id: string; code: number; description: string; supplier: string; category: string; paymentMethod: string; pixKey: string; amount: number; dueDate: string; notes: string;
  /** Parcelas da conta parcelada (vazio quando não é parcelada). */
  parcelas: { amount: number; dueDate: string }[];
};
type Dados = Pick<Conta, "description" | "supplier" | "category" | "paymentMethod" | "pixKey" | "dueDate" | "notes"> & {
  amount: string;
  qtdParcelas: string;
  parcelas: Parcela[];
};
const moeda = (v: number) => maskMoney(String(Math.round(v * 100)));

const dadosIniciais = (c: Conta): Dados => ({
  description: c.description,
  supplier: c.supplier,
  category: c.category,
  paymentMethod: c.paymentMethod,
  pixKey: c.pixKey,
  amount: moeda(c.amount),
  dueDate: c.dueDate,
  notes: c.notes,
  qtdParcelas: String(Math.max(1, c.parcelas.length)),
  parcelas: c.parcelas.length > 1 ? c.parcelas.map((p) => ({ amount: moeda(p.amount), dueDate: p.dueDate })) : [],
});

/** Botão "Editar" de uma conta aguardando aprovação: abre um modal para alterar os dados e os anexos (pedido e boletos). */
export function EditarConta({
  conta,
  anexos,
  suppliers,
  categories,
  paymentMethods,
  voltaTela,
}: {
  /** APROVADA: edição de uma parcela/conta já aprovada (sem parcelamento nem anexos, que ficam no botão "Anexar"). */
  conta: Conta & { status: "PENDENTE" | "REJEITADA" | "APROVADA" };
  anexos: AnexoExistente[];
  suppliers: string[];
  categories: string[];
  paymentMethods: string[];
  /** Tela de aprovação para onde voltar depois de salvar (ex.: "/ordens?status=PENDENTE"). */
  voltaTela?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dados, setDados] = useState<Dados>(() => dadosIniciais(conta));
  const [novos, setNovos] = useState<NovosAnexos>({});
  const [remover, setRemover] = useState<string[]>([]);
  const acoes = useAcoesContas();
  const { ocupado: pending, executar } = acoes;
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDados(dadosIniciais(conta));
      setNovos({});
      setRemover([]);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, mounted, conta]);

  // Fornecedor/categoria: só os cadastrados (ou o que a conta já tinha, mesmo que inativado depois).
  const naLista = (lista: string[], atual: string, v: string) =>
    v === atual || lista.some((n) => n.toLowerCase() === v.trim().toLowerCase());
  const fornecedorOk = naLista(suppliers, conta.supplier, dados.supplier);
  const categoriaOk = Boolean(conta.category && dados.category === conta.category) || naLista(categories, "", dados.category);
  const formaOk = Boolean(conta.paymentMethod && dados.paymentMethod === conta.paymentMethod) || naLista(paymentMethods, "", dados.paymentMethod);
  const pix = ehPix(dados.paymentMethod);
  // A forma atual da conta aparece na lista mesmo que tenha sido inativada depois.
  const opcoesForma = conta.paymentMethod && !paymentMethods.includes(conta.paymentMethod) ? [conta.paymentMethod, ...paymentMethods] : paymentMethods;
  const aprovada = conta.status === "APROVADA";
  const n = aprovada ? 1 : numParcelas(dados.qtdParcelas);
  // No máximo um boleto por parcela (na aprovada os anexos não são editados aqui).
  const qtdBoletos = anexos.filter((a) => a.kind === "BOLETO" && !remover.includes(a.id)).length + (novos.BOLETO?.length ?? 0);
  const boletosDemais = !aprovada && qtdBoletos > n;
  // Mesmas regras validadas no servidor (editarConta).
  const valido =
    dados.description.trim().length >= 2 &&
    fornecedorOk &&
    categoriaOk &&
    formaOk &&
    (!pix || dados.pixKey.trim().length >= 3) &&
    parseMoney(dados.amount) > 0 &&
    (n > 1 ? parcelasValidas(dados.amount, dados.parcelas) : ISO.test(dados.dueDate)) &&
    !boletosDemais;
  const set = (k: Exclude<keyof Dados, "parcelas">, v: string) => setDados((d) => ({ ...d, [k]: v }));
  // Mudar o valor ou a quantidade de parcelas redistribui o valor entre as parcelas.
  const setParcelado = (k: "amount" | "qtdParcelas", v: string) =>
    setDados((d) => {
      const novo = { ...d, [k]: v };
      const parcelas = refazParcelas(novo.amount, novo.qtdParcelas, novo.dueDate, novo.parcelas);
      return { ...novo, parcelas, dueDate: parcelas.length ? novo.dueDate : novo.parcelas[0]?.dueDate || novo.dueDate };
    });
  const setParcela = (k: number, campo: keyof Parcela, v: string) =>
    setDados((d) => ({ ...d, parcelas: d.parcelas.map((p, x) => (x === k ? { ...p, [campo]: v } : p)) }));

  return (
    <>
      <BotaoAcao acoes={acoes} chave={`editar-${conta.id}`} className="btn btn-icon" title={aprovada ? "Editar parcela" : "Editar conta"} onClick={() => setOpen(true)}>
        <IconeEditar />
      </BotaoAcao>

      {mounted &&
        createPortal(
          <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-black/40">
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!valido || pending) return;
                const fd = new FormData();
                fd.append("id", conta.id);
                fd.append("volta", conta.status);
                if (voltaTela) fd.append("voltaTela", voltaTela);
                const { qtdParcelas, parcelas, ...campos } = dados;
                (Object.keys(campos) as (keyof typeof campos)[]).forEach((k) => fd.append(k, k === "pixKey" && !pix ? "" : campos[k]));
                if (n > 1) {
                  fd.set("dueDate", parcelas[0].dueDate);
                  fd.append("parcelas", JSON.stringify(parcelas));
                }
                if (!aprovada) anexosParaFormData(fd, novos, remover);
                setOpen(false);
                executar(`editar-${conta.id}`, () => editarConta(fd));
              }}
            >
              <div>
                <h2 className="text-base font-semibold">{aprovada ? "Editar parcela" : "Editar conta"} #{conta.code}</h2>
                <p className="text-sm text-muted">
                  {aprovada
                    ? "A conta continua aprovada; as alterações ficam registradas no histórico. Anexos: use o botão “Anexar”."
                    : conta.status === "REJEITADA"
                    ? "As alterações ficam registradas no histórico da conta e, ao salvar, a conta volta automaticamente para aprovação."
                    : "A conta continua aguardando aprovação depois de salva."}
                </p>
              </div>


              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`${uid}-desc`}>Descrição</label>
                  <input id={`${uid}-desc`} className="input" value={dados.description} onChange={(e) => set("description", e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-sup`}>Fornecedor</label>
                  <CampoBusca id={`${uid}-sup`} placeholder="Buscar fornecedor" opcoes={suppliers} value={dados.supplier} onChange={(v) => set("supplier", v)} vazio="Nenhum fornecedor ativo encontrado." />
                  {dados.supplier.trim() && !fornecedorOk && <p className="mt-1 text-xs text-red-700">Fornecedor não cadastrado. Escolha um da lista.</p>}
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-categ`}>Categoria</label>
                  <CampoBusca id={`${uid}-categ`} placeholder="Buscar categoria" opcoes={categories} value={dados.category} onChange={(v) => set("category", v)} vazio="Nenhuma categoria ativa encontrada." />
                  {dados.category.trim() && !categoriaOk && <p className="mt-1 text-xs text-red-700">Categoria não cadastrada. Escolha uma da lista.</p>}
                </div>
                <div>
                  <label className="label" htmlFor={`${uid}-forma`}>Forma de pagamento</label>
                  <select id={`${uid}-forma`} className="input" value={dados.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                    <option value="">Selecione</option>
                    {opcoesForma.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                {pix ? (
                  <div>
                    <label className="label" htmlFor={`${uid}-pix`}>Chave Pix</label>
                    <input
                      id={`${uid}-pix`}
                      className="input"
                      placeholder="CPF/CNPJ, e-mail, telefone ou aleatória"
                      maxLength={150}
                      value={dados.pixKey}
                      onChange={(e) => set("pixKey", e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="hidden sm:block" />
                )}
                <div className={`grid gap-3 sm:col-span-2 ${aprovada ? "sm:grid-cols-2" : "sm:grid-cols-[1fr_0.6fr_1fr]"}`}>
                  <div>
                    <label className="label" htmlFor={`${uid}-val`}>Valor (R$)</label>
                    <input
                      id={`${uid}-val`}
                      className="input text-right"
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      value={dados.amount}
                      onChange={(e) => setParcelado("amount", maskMoney(e.target.value))}
                    />
                  </div>
                  {!aprovada && (
                  <div>
                    <label className="label" htmlFor={`${uid}-parc`}>Parcelas</label>
                    <input
                      id={`${uid}-parc`}
                      className="input text-center"
                      type="number"
                      min={1}
                      max={MAX_PARCELAS}
                      value={dados.qtdParcelas}
                      onChange={(e) => setParcelado("qtdParcelas", e.target.value)}
                      onBlur={() => set("qtdParcelas", String(n))}
                    />
                  </div>
                  )}
                  <div>
                    <label className="label" htmlFor={`${uid}-venc`}>Vencimento</label>
                    {n > 1 ? (
                      <div className="input flex items-center text-xs text-muted">{n} vencimentos abaixo</div>
                    ) : (
                      <input id={`${uid}-venc`} className="input" type="date" value={dados.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                    )}
                  </div>
                </div>
                {n > 1 && (
                  <div className="sm:col-span-2">
                    <ParcelasEditor amount={dados.amount} parcelas={dados.parcelas} onChange={setParcela} colunas="grid-cols-1" />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`${uid}-obs`}>Observações (opcional)</label>
                  <textarea id={`${uid}-obs`} className="input min-h-[60px]" rows={2} maxLength={1000} value={dados.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
              </div>

              {!aprovada && (
              <AnexosEditor
                tipos={["PEDIDO", "BOLETO"]}
                anexos={anexos}
                novos={novos}
                onNovos={setNovos}
                remover={remover}
                onRemover={setRemover}
                podeAlterar={() => true}
                podeRemover={() => true}
                limites={{ BOLETO: n }}
              />
              )}
              {boletosDemais && (
                <p className="text-xs text-red-700">
                  São {qtdBoletos} boletos para {n} parcela(s): no máximo um boleto por parcela. Remova {qtdBoletos - n} boleto(s) ou aumente as parcelas.
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-line pt-3">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Voltar</button>
                <button type="submit" className="btn btn-primary" disabled={!valido || pending}>Salvar alterações</button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
