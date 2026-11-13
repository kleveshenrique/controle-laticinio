"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { alterarFoto, alterarSenha, logout } from "@/app/actions";
import { toast } from "@/components/Toast";
import { SubmitButton } from "@/components/SubmitButton";

const iniciais = (nome: string) => {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
};

/**
 * Reduz a foto para 256×256 (recorte quadrado no centro) antes de enviar: fotos de celular ficam com poucos KB.
 * Se o navegador não conseguir ler a imagem, envia o arquivo original (o servidor valida o formato).
 */
async function reduzirFoto(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const lado = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    canvas.getContext("2d")!.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
    img.close();
    return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha()), "image/jpeg", 0.88));
  } catch {
    return file;
  }
}

export function Avatar({ nome, fotoUrl, className = "h-9 w-9 text-sm" }: { nome: string; fotoUrl: string | null; className?: string }) {
  const [erro, setErro] = useState(false);
  useEffect(() => setErro(false), [fotoUrl]);
  if (fotoUrl && !erro)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt="" onError={() => setErro(true)} className={`${className} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-brand-700 font-semibold text-white`} aria-hidden>
      {iniciais(nome)}
    </span>
  );
}

export function MenuUsuario({ nome, email, fotoUrl }: { nome: string; email: string; fotoUrl: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [enviando, startTransition] = useTransition();
  const raiz = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const menuId = useId();

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const trocarFoto = (file: File | undefined) => {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("foto", await reduzirFoto(file), "foto.jpg");
      const r = await alterarFoto(fd);
      if (r.erro) toast("erro", r.erro);
      else if (r.ok) toast("ok", r.ok);
    });
  };

  const item = "flex w-full items-center px-4 py-2 text-left text-sm hover:bg-paper focus-visible:bg-paper focus-visible:outline-none";

  return (
    <div ref={raiz} className="relative flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={menuId}
        aria-label={`Menu de ${nome}`}
        title={nome}
        className="relative flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Avatar nome={nome} fotoUrl={fotoUrl} className="h-9 w-9 text-sm md:h-12 md:w-12 md:text-base" />
        {enviando && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </button>

      {aberto && (
        <div id={menuId} role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Avatar nome={nome} fotoUrl={fotoUrl} className="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{nome}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className={item}
            disabled={enviando}
            onClick={() => {
              setAberto(false);
              arquivo.current?.click();
            }}
          >
            {fotoUrl ? "Alterar foto" : "Adicionar foto"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setAberto(false);
              setSenhaAberta(true);
            }}
          >
            Alterar senha
          </button>
          <form action={logout} onSubmit={() => localStorage.clear()} className="border-t border-line">
            <button role="menuitem" className={`${item} text-red-700`}>Sair</button>
          </form>
        </div>
      )}

      <input
        ref={arquivo}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          trocarFoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <AlterarSenhaDialog open={senhaAberta} onClose={() => setSenhaAberta(false)} />
    </div>
  );
}

function AlterarSenhaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [chave, setChave] = useState(0); // muda a cada abertura: campos voltam vazios
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setChave((k) => k + 1);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, mounted]);

  if (!mounted) return null;

  return createPortal(
    <dialog ref={ref} onClose={onClose} className="w-full max-w-sm rounded-lg p-0 shadow-xl backdrop:bg-black/40">
      <form
        key={chave}
        className="space-y-4 p-5"
        action={async (fd) => {
          const r = await alterarSenha(fd);
          if (r.erro) toast("erro", r.erro);
          else {
            toast("ok", r.ok ?? "Senha alterada.");
            onClose();
          }
        }}
      >
        <h2 className="text-base font-semibold">Alterar senha</h2>
        <div>
          <label className="label" htmlFor="senha-atual">Senha atual</label>
          <input id="senha-atual" name="atual" type="password" className="input" required autoComplete="current-password" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="senha-nova">Nova senha (mín. 6 caracteres)</label>
          <input id="senha-nova" name="nova" type="password" className="input" required minLength={6} autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="senha-confirmacao">Confirme a nova senha</label>
          <input id="senha-confirmacao" name="confirmacao" type="password" className="input" required minLength={6} autoComplete="new-password" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
