"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { cleanStoreHref } from "./store-url";
import "./zayro.css";

// La tienda siempre queda en /zayro/: si se entra con ?utm_source=chatgpt.com u otros
// parámetros de seguimiento, se quitan de la barra de direcciones sin recargar la página.
// Se usa history.replaceState después de hidratar. Con estado null, Next copia su estado
// interno y actualiza su router con la dirección limpia (no la vuelve a poner después).
function cleanAddressBar() {
  const clean = cleanStoreHref(window.location.href);
  if (clean) window.history.replaceState(null, "", clean);
}

// El servidor y el primer render del navegador DEBEN devolver el mismo HTML.
// Recién después de hidratar se monta la tienda que consulta Supabase.
function ZayroLoading() {
  return (
    <main className="zayro zayro-booting">
      <div className="zayro-topbar"><span>Envíos a todo el país</span></div>
      <div className="zayro-state zayro-state-boot" role="status">Preparando la tienda ZAYRO…</div>
    </main>
  );
}
const Storefront = dynamic(() => import("./zayro-store-client"), {
  ssr: false,
  loading: () => <ZayroLoading />,
});

export default function ZayroPage() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try { cleanAddressBar(); } catch { /* la tienda funciona igual aunque no se pueda limpiar */ }
    setHydrated(true);
  }, []);
  return hydrated ? <Storefront /> : <ZayroLoading />;
}
