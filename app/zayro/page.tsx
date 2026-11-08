"use client";

import dynamic from "next/dynamic";
import "./zayro.css";

// Los datos del catálogo son públicos, pero se obtienen al abrir la tienda.
// Renderizar el componente solo en el navegador evita diferencias de hidratación
// entre el HTML estático de GitHub Pages y el estado interactivo de React.
const Storefront = dynamic(() => import("./zayro-store-client"), {
  ssr: false,
  loading: () => (
    <main className="zayro">
      <div className="zayro-topnote">ZAYRO · Fragancias y cuidado personal</div>
      <div className="zayro-state" role="status">Preparando la tienda ZAYRO…</div>
    </main>
  ),
});

export default function ZayroPage() {
  return <Storefront />;
}
