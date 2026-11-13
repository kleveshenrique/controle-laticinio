import { redirect } from "next/navigation";

/** A tela "Lançar contas" foi removida: o lançamento é feito pelo botão "Lançar contas" em Ordens de compra. Mantido para links antigos. */
export default function NovaConta() {
  redirect("/ordens");
}
