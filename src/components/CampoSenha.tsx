"use client";

import { useState } from "react";

/** Campo de senha com botão para mostrar/ocultar o texto digitado. */
export function CampoSenha({ id, name, autoComplete }: { id: string; name: string; autoComplete?: string }) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visivel ? "text" : "password"}
        required
        autoComplete={autoComplete}
        className="input py-2 pr-10 focus:border-blue-600 focus:ring-blue-600"
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {visivel ? (
            <>
              <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2" />
              <path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              <path d="m2 2 20 20" />
            </>
          ) : (
            <>
              <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
