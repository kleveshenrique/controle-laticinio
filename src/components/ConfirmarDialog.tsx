"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Modal de confirmação (Voltar / confirmar), renderizado no <body>. */
export function ConfirmarDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmClassName = "btn btn-primary",
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  confirmClassName?: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <dialog ref={ref} onClose={onClose} className="w-full max-w-md rounded-lg p-0 shadow-xl backdrop:bg-black/40">
      <div className="space-y-4 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {children && <div className="text-sm">{children}</div>}
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" className="btn" onClick={onClose}>Voltar</button>
          <button
            type="button"
            className={confirmClassName}
            disabled={pending}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
