/** Banderas en SVG (los emojis de bandera no se ven en Windows). */
export function Flag({ code, className = "" }: { code: "en" | "es"; className?: string }) {
  if (code === "es") {
    return (
      <svg viewBox="0 0 30 20" className={className} aria-hidden>
        <rect width="30" height="20" fill="#c60b1e" />
        <rect y="5" width="30" height="10" fill="#ffc400" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 40" className={className} aria-hidden>
      <clipPath id="uk-clip">
        <path d="M0 0v40h60V0z" />
      </clipPath>
      <g clipPath="url(#uk-clip)">
        <path d="M0 0v40h60V0z" fill="#012169" />
        <path d="M0 0l60 40m0-40L0 40" stroke="#fff" strokeWidth="8" />
        <path d="M0 0l60 40m0-40L0 40" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="12" />
        <path d="M30 0v40M0 20h60" stroke="#C8102E" strokeWidth="7" />
      </g>
    </svg>
  );
}
