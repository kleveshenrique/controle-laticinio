"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconeSetaDireita, IconeSetaEsquerda } from "@/components/Icones";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const ativoRef = useRef<HTMLAnchorElement>(null);
  // Se ainda há botões escondidos à esquerda/direita (só acontece no celular, onde a barra rola).
  const [mais, setMais] = useState({ esquerda: false, direita: false });

  // O item ativo é o de prefixo mais longo que casa com a URL (ex.: /contas/nova ativa "Lançar contas", não "Contas").
  const active = items
    .filter((n) => (n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const atualizar = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const resto = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setMais({ esquerda: el.scrollLeft > 4, direita: resto > 4 });
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    atualizar();
    const obs = new ResizeObserver(atualizar);
    obs.observe(el);
    return () => obs.disconnect();
  }, [atualizar, items.length]);

  // Mantém o botão da página atual visível.
  useEffect(() => {
    ativoRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);

  const rolar = (sentido: 1 | -1) => {
    const el = navRef.current;
    if (el) el.scrollBy({ left: sentido * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    <div className="relative -mx-4 md:mx-0">
      <nav
        ref={navRef}
        onScroll={atualizar}
        aria-label="Menu principal"
        className="no-scrollbar flex snap-x gap-2 overflow-x-auto scroll-smooth px-4 pb-1 md:flex-wrap md:justify-center md:overflow-visible md:px-0 md:pb-0"
      >
        {items.map((n) => {
          const isActive = n.href === active;
          return (
            <Link
              key={n.href}
              href={n.href}
              ref={isActive ? ativoRef : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`btn shrink-0 snap-start scroll-mx-12 whitespace-nowrap ${isActive ? "btn-primary" : "text-muted hover:text-ink"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Indicadores de "tem mais": degradê + seta clicável na borda que ainda tem botões escondidos. */}
      {mais.esquerda && (
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center bg-gradient-to-r from-white via-white/90 to-transparent pb-1 pl-1 pr-8 md:hidden">
          <button
            type="button"
            onClick={() => rolar(-1)}
            aria-label="Ver botões anteriores"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-brand-700 shadow-sm"
          >
            <IconeSetaEsquerda />
          </button>
        </div>
      )}
      {mais.direita && (
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-white via-white/90 to-transparent pb-1 pl-8 pr-1 md:hidden">
          <button
            type="button"
            onClick={() => rolar(1)}
            aria-label="Ver mais botões"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-brand-700 shadow-sm"
          >
            <IconeSetaDireita />
          </button>
        </div>
      )}
    </div>
  );
}
