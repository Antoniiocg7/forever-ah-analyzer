"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  {
    href: "/",
    label: "Precios",
    hint: "Buscar cualquier objeto y ver su precio, su historial y cuánto se vende",
    match: (p: string) => p === "/" || p.startsWith("/item"),
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  {
    href: "/deals",
    label: "Chollos",
    hint: "Qué comprar ahora para ganar oro: gangas para revender, ventas al vendedor e inversiones",
    match: (p: string) => p.startsWith("/deals"),
    icon: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  },
  {
    href: "/professions",
    label: "Profesiones",
    hint: "Coste y beneficio de cada receta, y la forma más barata de subir de nivel",
    match: (p: string) => p.startsWith("/professions"),
    icon: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  },
  {
    href: "/deseos",
    label: "Deseos",
    hint: "Tu lista de deseos de equipo: precio de cada pieza y cuándo comprarla",
    match: (p: string) => p.startsWith("/deseos"),
    icon: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
  },
  {
    href: "/admin/houses",
    label: "Ajustes",
    hint: "Qué casas de subastas se siguen y alertas de Telegram",
    match: (p: string) => p.startsWith("/admin") || p.startsWith("/alerts"),
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  },
  {
    href: "/ayuda",
    label: "Ayuda",
    /** En el móvil no cabe: se llega desde “Cómo se usa” y desde Ajustes. */
    desktopOnly: true,
    hint: "Para qué sirve cada apartado y qué significa cada número",
    match: (p: string) => p.startsWith("/ayuda"),
    icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
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
        <Link key={l.href} href={l.href} title={l.hint} className={`py-1 ${l.match(path) ? "text-fg" : "text-muted hover:text-fg"}`} aria-current={l.match(path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

function BottomNavView({ path }: { path: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {LINKS.filter((l) => !("desktopOnly" in l)).map((l) => {
          const active = l.match(path);
          return (
            <Link
              key={l.href}
              href={l.href}
              title={l.hint}
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
