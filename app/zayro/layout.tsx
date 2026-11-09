import type { Metadata, Viewport } from "next";

const title = "ZAYRO Parfum | Fragancias que te representan";
const description = "Perfumes femeninos, masculinos y unisex y cuidado capilar. Asesoramiento personalizado por WhatsApp y envíos a todo el país desde Zona Norte.";

export const metadata: Metadata = {
  title,
  description,
  // Dirección única de la tienda, sin parámetros de seguimiento.
  alternates: { canonical: "/zayro/" },
  openGraph: {
    title,
    description,
    url: "https://gestlok.com.ar/zayro/",
    siteName: "ZAYRO Parfum",
    locale: "es_AR",
    type: "website",
  },
  twitter: { card: "summary", title, description },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Great+Vibes&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,500;1,600;1,700&family=Poppins:wght@300;400;500;600&display=swap";

export default function ZayroLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- Tipografías exclusivas de la tienda ZAYRO; no se cargan en el resto de GESTLOK. */}
      <link rel="stylesheet" href={FONTS} precedence="zayro-fonts" />
      {children}
    </>
  );
}
