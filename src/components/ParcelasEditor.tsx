"use client";

import { brl, maskMoney, parseMoney } from "@/lib/format";

/** Parcela no formulário: valor com máscara ("R$ 1.234,56") e vencimento YYYY-MM-DD. */
export type Parcela = { amount: string; dueDate: string };

export const MAX_PARCELAS = 60;
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const numParcelas = (qtd: string) => Math.min(MAX_PARCELAS, Math.max(1, parseInt(qtd, 10) || 1));
export const centavos = (v: string) => Math.round(parseMoney(v) * 100);
export const somaParcelas = (parcelas: Parcela[]) => parcelas.reduce((s, p) => s + centavos(p.amount), 0);

/** Soma meses a uma data YYYY-MM-DD, ajustando ao último dia do mês quando preciso (31/01 + 1 mês = 28/02). */
function somaMeses(iso: string, meses: number) {
  if (!ISO.test(iso)) return "";
  const [a, m, d] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m + meses, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

/**
 * Refaz as parcelas: divide o valor igualmente (os centavos que sobram vão para a 1ª parcela)
 * e mantém os vencimentos já informados; os novos são sugeridos mês a mês a partir do anterior.
 * Com menos de 2 parcelas devolve [].
 */
export function refazParcelas(amount: string, qtd: string, dueDate: string, atuais: Parcela[]): Parcela[] {
  const n = numParcelas(qtd);
  if (n < 2) return [];
  const total = centavos(amount);
  const base = Math.floor(total / n);
  const parcelas: Parcela[] = [];
  for (let k = 0; k < n; k++) {
    const venc = atuais[k]?.dueDate || (k === 0 ? dueDate : somaMeses(parcelas[k - 1].dueDate, 1));
    const valor = base + (k === 0 ? total - base * n : 0);
    parcelas.push({ amount: total > 0 ? maskMoney(String(valor)) : "", dueDate: venc });
  }
  return parcelas;
}

/** Parcelas válidas: todas com valor e vencimento, somando exatamente o valor da conta. */
export const parcelasValidas = (amount: string, parcelas: Parcela[]) =>
  parcelas.every((p) => parseMoney(p.amount) > 0 && ISO.test(p.dueDate)) && somaParcelas(parcelas) === centavos(amount);

/** Valor e vencimento de cada parcela, com aviso quando a soma difere do valor da conta. */
export function ParcelasEditor({
  amount,
  parcelas,
  onChange,
  colunas = "sm:grid-cols-2 lg:grid-cols-4",
}: {
  amount: string;
  parcelas: Parcela[];
  onChange: (k: number, campo: keyof Parcela, v: string) => void;
  colunas?: string;
}) {
  const n = parcelas.length;
  const diferenca = somaParcelas(parcelas) - centavos(amount);
  return (
    <div className="rounded-md border border-line p-2">
      <div className={`grid gap-2 ${colunas}`}>
        {parcelas.map((p, k) => (
          <div key={k} className="flex items-center gap-1">
            <span className="w-10 shrink-0 text-right text-xs text-muted">{k + 1}/{n}</span>
            <input
              className="input min-w-0 text-right"
              placeholder="R$ 0,00"
              inputMode="numeric"
              aria-label={`Valor da parcela ${k + 1}`}
              value={p.amount}
              onChange={(e) => onChange(k, "amount", maskMoney(e.target.value))}
            />
            <input
              className="input min-w-0"
              type="date"
              aria-label={`Vencimento da parcela ${k + 1}`}
              value={p.dueDate}
              onChange={(e) => onChange(k, "dueDate", e.target.value)}
            />
          </div>
        ))}
      </div>
      {diferenca !== 0 && (
        <p className="mt-2 text-xs text-red-700">
          A soma das parcelas ({brl(somaParcelas(parcelas) / 100)}) difere do valor da conta ({brl(parseMoney(amount))}) em{" "}
          {brl(Math.abs(diferenca) / 100)}. Ajuste os valores das parcelas.
        </p>
      )}
    </div>
  );
}
