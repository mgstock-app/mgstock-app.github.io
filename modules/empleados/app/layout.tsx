import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { GestlokProvider } from "@/components/gestlok/GestlokContext";
import { GestlokModuleBar } from "@/components/gestlok/GestlokModuleBar";
import "@/styles/gestlok-module.css";
import Link from "next/link";
import "@/styles/management.css";
import type { Metadata } from "next";
import { brand } from "@/utils/brand";
import "./globals.css";
import "@/styles/access.css";
import "@/styles/reports.css";
import "@/styles/schedules.css";
export const metadata: Metadata = {
  title: { default: brand.name, template: `%s | ${brand.name}` },
  applicationName: brand.name,
  description: brand.description,
  openGraph: {
    title: brand.name,
    siteName: brand.name,
    description: brand.description,
    locale: "es_AR",
    type: "website",
  },
  appleWebApp: { title: "GESTLOK", capable: true },
  // Misma instalación PWA que GESTLOK: el manifiesto y los íconos son los de la aplicación principal.
  manifest: `${process.env.NEXT_PUBLIC_GESTLOK_HOME}manifest.webmanifest`,
  icons: { icon: `${process.env.NEXT_PUBLIC_GESTLOK_HOME}icons/gestlok.svg`, apple: `${process.env.NEXT_PUBLIC_GESTLOK_HOME}icons/gestlok-apple-v2-180.png` },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <GestlokProvider>
        <AuthProvider>
          <div className="app-shell">
            <GestlokModuleBar />
            <AppNavbar />
            {children}
            <footer aria-label="Documentos legales de GESTLOK Empleados" style={{
              borderTop: "1px solid #dfe6ee", padding: "14px 16px 22px",
              display: "flex", justifyContent: "center", flexWrap: "wrap",
              alignItems: "center", gap: "10px 18px", fontSize: 12,
              background: "#f8fafc", color: "#475569",
            }}>
              <span>GESTLOK · Empleados · Uso privado</span>
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Condiciones de uso</Link>
              <Link href="/almacenamiento">Cookies y almacenamiento</Link>
            </footer>
          </div>
        </AuthProvider>
        </GestlokProvider>
      </body>
    </html>
  );
}
