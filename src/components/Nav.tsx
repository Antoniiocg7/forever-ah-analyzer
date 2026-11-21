"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  {
    href: "/",
    label: "Precios",
    match: (p: string) => p === "/" || p.startsWith("/item"),
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  {
    href: "/professions",
    label: "Profesiones",
    match: (p: string) => p.startsWith("/professions"),
    icon: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  },
  {
    href: "/admin/houses",
    label: "Casas",
    match: (p: string) => p.startsWith("/admin"),
    icon: "M3 10l9-6 9 6v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Enlaces en la cabecera (escritorio). */
export function TopNav() {
  return <TopNavView path={usePathname()} />;
}

/** Barra inferior fija (móvil), al alcance del pulgar. */
export function BottomNav() {
  return <BottomNavView path={usePathname()} />;
}

/** Versiones sin estado activo, para mostrarlas mientras llega la URL (Suspense). */
export const TopNavFallback = () => <TopNavView path="" />;
export const BottomNavFallback = () => <BottomNavView path="" />;

function TopNavView({ path }: { path: string }) {
  return (
    <div className="hidden gap-5 text-sm sm:flex">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`py-1 ${l.match(path) ? "text-fg" : "text-muted hover:text-fg"}`} aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

function BottomNavView({ path }: { path: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3">
        {LINKS.map((l) => {
          const active = l.match(path);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-gold" : "text-muted"}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon d={l.icon} />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
