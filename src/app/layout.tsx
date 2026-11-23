import type { Metadata, Viewport } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { IngestStatus } from "@/components/IngestStatus";
import { LangToggle, LangToggleView } from "@/components/LangToggle";
import { Logo } from "@/components/Logo";
import { BottomNav, BottomNavFallback, TopNav, TopNavFallback } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/** Solo para la marca: el toque de WoW sin cargar la interfaz. */
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["700"] });

export const metadata: Metadata = {
  title: "Forever AH",
  description: "Precios de la casa de subastas de WoW: Forever (EU · PvP · Alianza)",
};

export const viewport: Viewport = { themeColor: "#0a0c11", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
            <Logo
              subtitle={
                <>
                  EU · Alianza ·{" "}
                  <Suspense fallback={<span>PvP</span>}>
                    <IngestStatus />
                  </Suspense>
                </>
              }
            />
            <div className="flex items-center gap-3">
              <Suspense fallback={<TopNavFallback />}>
                <TopNav />
              </Suspense>
              <Suspense fallback={<LangToggleView lang={null} />}>
                <LangToggle />
              </Suspense>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 md:pb-12">{children}</main>
        <Suspense fallback={<BottomNavFallback />}>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
