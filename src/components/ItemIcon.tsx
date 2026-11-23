import Image from "next/image";

/** Icono de un objeto con el borde (y, de verde para arriba, el brillo) de su calidad. */
export function ItemIcon({ src, size = 36, quality }: { src: string | null | undefined; size?: number; quality?: string | null }) {
  const q = quality ?? "COMMON";
  const cls = `shrink-0 rounded-lg border q-border-${q} q-glow-${q}`;
  if (!src) return <span aria-hidden className={`inline-block bg-surface-2 ${cls}`} style={{ width: size, height: size }} />;
  return <Image src={src} alt="" width={size} height={size} className={cls} />;
}
