import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { GestlokProvider } from "@/components/gestlok/GestlokContext";
import { GestlokModuleBar } from "@/components/gestlok/GestlokModuleBar";
import { SupportWhatsApp } from "@/components/layout/SupportWhatsApp";
import { RoleProfileSwitcher } from "@/components/layout/RoleProfileSwitcher";
import "@/styles/gestlok-module.css";
import Link from "next/link";
import Script from "next/script";
import "@/styles/management.css";
import type { Metadata } from "next";
import { brand } from "@/utils/brand";
import "./globals.css";
import "@/styles/access.css";
import "@/styles/reports.css";
import "@/styles/schedules.css";
import "@/styles/white-dashboard.css";
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
        {/* Modo sin conexión de GESTLOK: se carga antes que la aplicación para que todas las consultas lo usen. */}
        <Script src={`${process.env.NEXT_PUBLIC_GESTLOK_HOME || "/"}stock/gestlok-offline.js?rev=offline-20261026`} strategy="beforeInteractive" />
        <GestlokProvider>
        <AuthProvider>
          <div className="app-shell">
            <GestlokModuleBar />
            <AppNavbar />
            {children}
            <RoleProfileSwitcher />
            <SupportWhatsApp />
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
