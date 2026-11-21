import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { IngestStatus } from "@/components/IngestStatus";
import { BottomNav, BottomNavFallback, TopNav, TopNavFallback } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Forever AH",
  description: "Precios de la casa de subastas de WoW: Forever (EU · PvP · Alianza)",
};

export const viewport: Viewport = { themeColor: "#0e1014", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Link href="/" className="font-semibold text-gold">
                Forever AH
              </Link>
              <Suspense>
                <IngestStatus />
              </Suspense>
            </div>
            <Suspense fallback={<TopNavFallback />}>
              <TopNav />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-24 sm:pb-8">{children}</main>
        <Suspense fallback={<BottomNavFallback />}>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
