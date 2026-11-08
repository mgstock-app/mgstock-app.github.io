"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "./zayro.css";

// El servidor y el primer render del navegador DEBEN devolver el mismo HTML.
// Recién después de hidratar se monta la tienda que consulta Supabase.
function ZayroLoading() {
  return (
    <main className="zayro">
      <div className="zayro-topnote">ZAYRO · Fragancias y cuidado personal</div>
      <div className="zayro-state" role="status">Preparando la tienda ZAYRO…</div>
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
    setHydrated(true);
  }, []);
  return hydrated ? <Storefront /> : <ZayroLoading />;
}
