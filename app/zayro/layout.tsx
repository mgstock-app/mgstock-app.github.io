import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZAYRO | Perfumes y cuidado capilar",
  description: "Explorá fragancias femeninas, masculinas y unisex en ZAYRO. Consultá disponibilidad y pedidos directamente por WhatsApp.",
};

export default function ZayroLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
