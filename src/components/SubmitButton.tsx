"use client";

import { useFormStatus } from "react-dom";

/** Botão de envio que mostra um spinner e fica bloqueado enquanto o formulário está sendo processado. */
export function SubmitButton({
  children,
  pendingText,
  className = "btn btn-primary",
  disabled,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  /** Use quando o envio é controlado fora do <form action> (ex.: useTransition). */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" className={`${className} gap-2`} disabled={disabled || pending} aria-busy={pending}>
      {pending && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-90" />
        </svg>
      )}
      {pending ? pendingText ?? children : children}
    </button>
  );
}
