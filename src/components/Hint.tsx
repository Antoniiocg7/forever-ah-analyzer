"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * Botón "?" que abre una explicación corta. Funciona al tocar (móvil) y al pasar el ratón
 * (escritorio); se cierra al tocar fuera, con Escape o al hacer scroll.
 * No lo pongas dentro de un enlace: un botón dentro de <a> no es HTML válido.
 */
export function Hint({ children, label = "¿Qué es esto?", className = "" }: { children: ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  // Coloca la burbuja debajo del botón (o encima si no cabe), sin salirse de la pantalla.
  useLayoutEffect(() => {
    if (!open || !btn.current || !bubble.current) return;
    const r = btn.current.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - b.width / 2), window.innerWidth - b.width - margin);
    const above = r.bottom + 8 + b.height > window.innerHeight - margin && r.top - 8 - b.height > margin;
    setPos({ top: above ? r.top - 8 - b.height : r.bottom + 8, left, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && (btn.current?.contains(e.target as Node) || bubble.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const hover = (v: boolean) => (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(v), v ? 150 : 250);
  };

  return (
    <span className={`inline-flex align-middle ${className}`} onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPos(null);
          setOpen((v) => !v);
        }}
        className={`-m-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full p-1.5 ${open ? "text-gold" : "text-muted hover:text-gold"}`}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none font-semibold">?</span>
      </button>
      {open && (
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          className="z-50 block w-max max-w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-gold/40 bg-surface-2 px-3 py-2 text-left text-xs leading-relaxed font-normal text-fg normal-case shadow-xl shadow-black/50"
        >
          {children}
        </span>
      )}
    </span>
  );
}
