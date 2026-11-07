"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // O item ativo é o de prefixo mais longo que casa com a URL (ex.: /contas/nova ativa "Lançar contas", não "Contas").
  const active = items
    .filter((n) => (n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map((n) => {
        const isActive = n.href === active;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "border-b-2 border-brand-700 pb-0.5 font-semibold text-brand-900"
                : "border-b-2 border-transparent pb-0.5 text-muted hover:text-ink"
            }
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
