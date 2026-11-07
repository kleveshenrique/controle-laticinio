import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster, ToastDaUrl } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = { title: "Controle Laticínio — Contas a pagar" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        {/* Mensagens de sucesso/erro de todo o sistema aparecem como toast no centro da tela. */}
        <Toaster />
        <Suspense>
          <ToastDaUrl />
        </Suspense>
      </body>
    </html>
  );
}
