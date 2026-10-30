"use client";

import { useEffect, useState } from "react";

// React owns the host; the preserved controller owns its table DOM.
let startup: Promise<void> | undefined;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
function load(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = basePath + src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.body.appendChild(script);
  });
}
export function StockRuntime() {
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    // Prevent duplicate listeners and subscriptions under Strict Mode.
    startup ??= (async () => {
      await load("/stock/gestlok-pwa-update.js");
      await load("/vendor/supabase.js");
      await load("/stock/config.js");
      // Modo sin conexión de ambas áreas: debe cargarse antes de crear el cliente de Supabase.
      await load("/stock/gestlok-offline.js?rev=offline-20261027");
      // La demo usa EXACTAMENTE los módulos operativos de GestLok, pero nunca la
      // autenticación, las claves privilegiadas ni el backend de empresas reales.
      const visitor = new URLSearchParams(location.search).get("demo") === "1";
      if (!visitor) await load("/stock/gestlok-registration.js");
      await load(visitor ? "/stock/gestlok-visitor-demo.js" : "/stock/auth.js?rev=salir-local-20261027");
      await load("/stock/gestlok-updates.js?rev=gerente-avisos-20261026");
      if (!visitor) await load("/stock/gestlok-push.js");
      await load("/stock/munro-daily.js");
      await load("/stock/mi-gusto-resenas.js?rev=resenas-editar-20261027");
      if (!visitor) await load("/stock/gestlok-reclamos-internos.js?rev=reclamos-global-20261029");
      if (!visitor) await load("/stock/mi-gusto-cierre-online.js?rev=fotos-movil-20261030");
      await load("/stock/munro-motos.js?rev=motos-guardar-20261027");
      await load("/stock/gestlok-commerce.js");
      if (!visitor) await load("/stock/gestlok-pilot.js?rev=piloto-perfumes-20261029");
      if (!visitor) await load("/stock/gestlok-pedidos.js?rev=pedidos-cami-20261029");
      if (!visitor) await load("/stock/gestlok-precios-stock.js?rev=precios-stock-cami-20261029");
      if (!visitor) await load("/stock/gestlok-future-pricing.js?rev=precios-locales-20261029");
      await load("/stock/gestlok-owner-areas.js?rev=branding-20261026");
      await load("/stock/gestlok-creator-mode.js?rev=creadora-inicio-20261026");
      await load("/stock/gestlok-creator-support.js?rev=soporte-20261026");
      await load("/stock/gestlok-creator-home.js?rev=ocultar-diario-20261029");
      await load("/stock/gestlok-tienda.js");
      if (visitor) await load("/stock/gestlok-demo-horarios.js");
      await load("/stock/gestlok-demo.js");
      await load("/stock/gestlok-demo-metrics.js");
      await load("/stock/gestlok-creator.js");
      if (!visitor) await load("/stock/gestlok-support.js");
      if (!visitor) await load("/stock/gestlok-role-switcher.js?rev=roles-20261028");
      await load("/stock/gestlok-provider-pdf.js");
      // Preservación global de entradas antes de iniciar la app.
      await load("/stock/gestlok-form-draft-guard.js?rev=inputs-20261030");
      // Versioned URLs prevent installed PWAs from reusing older registration controllers.
      await load("/stock/app.js?rev=nav-pagos-debajo-inicio-20261030");
      await load("/stock/gestlok-sidebar-polish.js?rev=white-20261028-v2");
      await load("/stock/gestlok-mobile-dock.js?rev=accesos-diarios-20261030");
      if (!visitor) await load("/stock/gestlok-navigation-editor.js?rev=stock-menu-fix-ff0917e-20261030");
      if (visitor) await load("/stock/gestlok-demo-pagos.js?rev=pagos-online-20261029");
      if (visitor) await load("/stock/gestlok-demo-tour.js?rev=pagos-online-20261029");
    })();
    startup.catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return error ? (
    <div role="alert" style={{ position: "fixed", bottom: 16, left: 16, zIndex: 9999, background: "white", padding: 20 }}>
      No se pudo iniciar la aplicación. Revisá la conexión.{" "}
      <button onClick={() => window.location.reload()}>Reintentar</button>
    </div>
  ) : null;
}
