/* eslint-disable @next/next/no-page-custom-font -- Shared font stylesheet in the App Router root layout. */
import type { Metadata, Viewport } from "next";
import "./globals.css";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "GestLok",
  description: "Productos, proveedores, conteos y movimientos en un espacio seguro por local. Acceso gratuito con autorización.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: { icon: `${basePath}/icons/icon-32.png`, apple: `${basePath}/icons/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "GestLok", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#11283c" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es-AR"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@600;700&display=swap" /></head><body>{children}</body></html>;
}
