import { redirect } from "next/navigation";

/** A aprovação passou a ser feita direto na tela Contas (aba "Aguardando aprovação"). Mantido para links antigos. */
export default function Aprovacoes() {
  redirect("/contas?status=PENDENTE");
}
