/* eslint-disable @next/next/no-page-custom-font -- Shared font stylesheet in the App Router root layout. */
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./gestlok-intro.css";
import "./owner-mobile-refinements.css";
import "./munro-motos.css";
import "./mi-gusto-resenas.css";
import "./gestlok-reclamos-internos.css";
import "./gestlok-nav-fixes.css";
import "./mi-gusto-pagos-online.css";
import "./inicio-compacto.css";
import "./white-unified.css";
import "./mobile-navigation.css";
import "./desktop-gestlok.css";
import "./login-welcome.css";
import "./gestlok-pilot.css";
import "./gestlok-orders.css";
import "./responsive-global.css";
import "./gestlok-precios-stock.css";
import "./gestlok-future-pricing.css";
import "./gestlok-experience.css";
import "./gestlok-ios-install.css";
import "./gestlok-nfc-qr.css";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://gestlok.com.ar"),
  title: "GESTLOK | Software de gestión de negocios y locales",
  description: "GESTLOK: todo tu negocio, en orden. Organizá stock, proveedores, operaciones y sucursales desde una plataforma web. Conocé sus funciones y probá la demo.",
  alternates: { canonical: "/" },
  // Google Search Console: verification for the https://gestlok.com.ar/ URL-prefix property.
  verification: { google: "AUtQ56Jt0oBiuGWVHklpmNKiJxpkSpRiF6OZbHLHCoM" },
  openGraph: {
    title: "GESTLOK | Todo tu negocio, en orden",
    description: "Plataforma web para organizar stock, proveedores y equipos de tus negocios y sucursales.",
    url: "https://gestlok.com.ar/",
    siteName: "GESTLOK",
    locale: "es_AR",
    type: "website",
  },
  twitter: { card: "summary", title: "GESTLOK", description: "Todo tu negocio, en orden." },
  // Preserve original manifest URL for installed Android/desktop PWA update tracking.
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${basePath}/icons/gestlok-favicon-v2-32.png?rev=gestlok-installed-brand-20261024-r3`, type: "image/png", sizes: "32x32" },
      { url: `${basePath}/icons/gestlok.svg`, type: "image/svg+xml" },
    ],
    apple: `${basePath}/icons/gestlok-apple-v2-180.png?rev=gestlok-installed-brand-20261024-r3`,
  },
  appleWebApp: { capable: true, title: "GestLok", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#11283c" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es-AR"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@600;700&display=swap" /></head><body>{children}</body></html>;
}
