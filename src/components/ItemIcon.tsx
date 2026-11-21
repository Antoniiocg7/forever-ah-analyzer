import Image from "next/image";

/** Icono de un objeto (o un hueco del mismo tamaño si no hay). */
export function ItemIcon({ src, size = 28, quality }: { src: string | null | undefined; size?: number; quality?: string | null }) {
  const border = `q-border-${quality ?? "COMMON"}`;
  if (!src) return <span aria-hidden className={`inline-block shrink-0 rounded border bg-surface-2 ${border}`} style={{ width: size, height: size }} />;
  return <Image src={src} alt="" width={size} height={size} className={`shrink-0 rounded border ${border}`} />;
}
