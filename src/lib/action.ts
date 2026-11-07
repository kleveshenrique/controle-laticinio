import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UserError } from "./errors";

const withParam = (path: string, key: string, value: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

/** Executa a ação; erros de regra voltam para a página com ?erro=, sucesso vai para okPath com ?ok=. */
export async function run(errPath: string, okPath: string, fn: () => Promise<string>): Promise<never> {
  let erro: string | undefined;
  let ok = "";
  try {
    ok = await fn();
  } catch (e) {
    if (e instanceof UserError) erro = e.message;
    else throw e;
  }
  revalidatePath("/", "layout");
  if (erro) redirect(withParam(errPath, "erro", erro));
  redirect(withParam(okPath, "ok", ok));
}
