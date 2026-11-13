"use client";

import { useEffect, type ReactNode } from "react";
import { login } from "@/app/actions";

export const LS_USUARIO = "usuario";

/**
 * Formulário de login: ao enviar, guarda o usuário no localStorage.
 * Se o login falhar (página volta com `erro`), apaga o que foi guardado.
 */
export function FormLogin({ erro, className, children }: { erro?: string; className?: string; children: ReactNode }) {
  useEffect(() => {
    if (erro) {
      localStorage.removeItem(LS_USUARIO);
    }
  }, [erro]);

  return (
    <form
      action={login}
      className={className}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        localStorage.setItem(LS_USUARIO, String(fd.get("nome") ?? "").trim());
      }}
    >
      {children}
    </form>
  );
}
