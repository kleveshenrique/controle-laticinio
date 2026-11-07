"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Modal que pede um motivo (mín. 3 caracteres). Renderizado no <body> para poder ficar dentro de outros <form>. */
export function MotivoDialog({
  open,
  title,
  label,
  confirmLabel,
  pending,
  onClose,
  onConfirm,
  placeholder = "Descreva o motivo",
  confirmClassName = "btn btn-danger",
}: {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
  placeholder?: string;
  confirmClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [motivo, setMotivo] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const fieldId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setMotivo("");
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, mounted]);

  if (!mounted) return null;
  const ok = motivo.trim().length >= 3;

  return createPortal(
    <dialog ref={ref} onClose={onClose} className="w-full max-w-md rounded-lg p-0 shadow-xl backdrop:bg-black/40">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          onConfirm(motivo.trim());
          onClose();
        }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <div>
          <label className="label" htmlFor={fieldId}>{label}</label>
          <textarea
            id={fieldId}
            className="input min-h-[96px]"
            placeholder={placeholder}
            maxLength={1000}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
            required
            minLength={3}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Voltar</button>
          <button type="submit" className={confirmClassName} disabled={!ok || pending}>{confirmLabel}</button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
