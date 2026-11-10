import { numeroParcela } from "@/lib/parcelamento";

/** Selo "Parcelamento #12 · 2/3" nas contas desmembradas de uma mesma conta parcelada. */
export function SeloParcelamento({ codigo, descricao }: { codigo: number | undefined; descricao: string }) {
  if (codigo === undefined) return null;
  const parcela = numeroParcela(descricao);
  return (
    <span
      className="ml-1 inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-1.5 py-px text-[11px] font-medium text-indigo-800"
      title={`Parcela da conta parcelada #${codigo}`}
    >
      Parcelamento #{codigo}
      {parcela && ` · ${parcela}`}
    </span>
  );
}
