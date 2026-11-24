import type { Metadata } from "next";
import { GestlokDemo } from "@/components/gestlok-demo";
import "../inicio-publico.css";

// Demo pública de GESTLOK Chat: local, productos y pedidos ficticios (sin red ni base real).
export const metadata: Metadata = {
  title: "Probá GESTLOK Chat | Demo de pedidos por chat",
  description: "Probá GESTLOK Chat: hacé un pedido como cliente y mirá cómo le llega al panel del local. Local, productos y pedidos de ejemplo.",
  alternates: { canonical: "/demo/" },
};

export default function Demo() {
  return <GestlokDemo />;
}
