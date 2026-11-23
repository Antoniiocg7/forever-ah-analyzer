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
    href: "/cuenta",
    label: "Mi oro",
    hint: "Tus ventas y compras reales, tu oro y lo que vale tu inventario (privado)",
    match: (p: string) => p.startsWith("/cuenta"),
    icon: "M12 3c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3zM5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4",
  },
  {
    href: "/admin/houses",
    label: "Ajustes",
    /** En el móvil se llega desde Mi oro. */
    desktopOnly: true,
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

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

/** Enlaces en la cabecera (tableta y escritorio). */
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
    <nav className="hidden items-center gap-0.5 rounded-full border border-line bg-surface/70 p-1 text-sm md:flex" aria-label="Apartados">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            title={l.hint}
            aria-current={active ? "page" : undefined}
            aria-label={l.label}
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 lg:px-3 transition-colors ${
              active ? "bg-surface-3 text-gold shadow-sm" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icon d={l.icon} className="h-4 w-4" />
            <span className="hidden lg:inline">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNavView({ path }: { path: string }) {
  const links = LINKS.filter((l) => !("desktopOnly" in l));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Apartados"
    >
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
        {links.map((l) => {
          const active = l.match(path);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`group flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-gold" : "text-muted"}`}
            >
              <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active ? "bg-gold/15" : "group-active:bg-surface-2"}`}>
                <Icon d={l.icon} />
              </span>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
