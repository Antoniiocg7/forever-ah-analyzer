import Link from "next/link";

/** Marca: moneda de oro + "Forever AH". */
export function Logo({ subtitle }: { subtitle?: React.ReactNode }) {
  return (
    <Link href="/" className="group flex min-w-0 items-center gap-2.5" aria-label="Forever AH, inicio">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-[#3a2a08] shadow-[0_0_0_1px_#f3cd7755,0_4px_14px_-4px_#e6b85c] transition-transform group-hover:rotate-12"
        style={{ background: "radial-gradient(circle at 35% 30%, #fff3c4, #f3cd77 35%, #c9952f 75%, #8f6417)" }}
      >
        <span className="font-display">F</span>
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-display text-[15px] font-bold tracking-wide whitespace-nowrap text-gold-strong">Forever AH</span>
        {subtitle && <span className="block truncate text-[11px] text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
