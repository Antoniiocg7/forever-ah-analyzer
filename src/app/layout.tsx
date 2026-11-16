import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Forever AH Analyzer",
  description: "Precios de la casa de subastas de WoW: Forever (EU · PvP · Alianza)",
};

export const viewport: Viewport = { themeColor: "#0e1014" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
          <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold text-gold">
              Forever AH
            </Link>
            <div className="flex gap-4 text-sm text-muted">
              <Link href="/" className="py-1 hover:text-fg">
                Precios
              </Link>
              <Link href="/professions" className="py-1 hover:text-fg">
                Profesiones
              </Link>
              <Link href="/admin/houses" className="py-1 hover:text-fg">
                Casas
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
