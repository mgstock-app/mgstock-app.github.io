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
// Fetch independent, frequently used scripts in parallel while preserving their
// existing sequential execution order and module initialization dependencies.
function preloadStartupScripts(visitor: boolean) {
  const common = [
    "/vendor/supabase.js", "/stock/config.js",
    "/stock/gestlok-offline.js?rev=offline-20261027",
    "/stock/gestlok-commerce.js",
    "/stock/gestlok-owner-areas.js?rev=menu-empresa-20261108",
    "/stock/gestlok-form-draft-guard.js?rev=sin-sugerencias-20261101",
    "/stock/app.js?rev=creadora-acceso-empresas-20261108",
  ];
  const privateScripts = [
    "/stock/gestlok-registration.js",
    "/stock/auth.js?rev=auth-invites-google-20261107",
    "/stock/gestlok-logout.js?rev=logout-profile-menu-20261107",
    "/stock/gestlok-pilot.js?rev=zayro-creadora-operativa-20261108",
    "/stock/gestlok-cami-monthly.js?rev=cami-monthly-20261106",
    "/stock/gestlok-zayro-admin.js?rev=zayro-public-shop-20261108",
    "/stock/gestlok-scanner-menu.js?rev=zayro-creadora-operativa-20261108",
    "/stock/gestlok-invites.js?rev=invite-google-20261107",
    "/stock/gestlok-molino.js?rev=envios-roles-20261109",
  ];
  for (const src of visitor ? common : [...common, ...privateScripts]) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "script";
    link.href = basePath + src;
    document.head.appendChild(link);
  }
}

export function StockRuntime() {
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    // Prevent duplicate listeners and subscriptions under Strict Mode.
    startup ??= (async () => {
      preloadStartupScripts(new URLSearchParams(location.search).get("demo") === "1");
      await load("/stock/gestlok-pwa-update.js");
      await load("/vendor/supabase.js");
      await load("/stock/config.js");
      // Modo sin conexión de ambas áreas: debe cargarse antes de crear el cliente de Supabase.
      await load("/stock/gestlok-offline.js?rev=offline-20261027");
      // La demo usa EXACTAMENTE los módulos operativos de GestLok, pero nunca la
      // autenticación, las claves privilegiadas ni el backend de empresas reales.
      const visitor = new URLSearchParams(location.search).get("demo") === "1";
      if (!visitor) await load("/stock/gestlok-registration.js");
      if (!visitor) await load("/stock/gestlok-invites.js?rev=invite-google-20261107");
      await load(visitor ? "/stock/gestlok-visitor-demo.js" : "/stock/auth.js?rev=auth-invites-google-20261107");
      // Perfil seguro: salida dentro de Mi perfil, también accesible para cuentas pendientes.
      if (!visitor) await load("/stock/gestlok-logout.js?rev=logout-profile-menu-20261107");
      if (!visitor) await load("/stock/gestlok-ios-install.js?rev=ios-home-screen-20261030");
      await load("/stock/gestlok-updates.js?rev=gerente-avisos-20261026");
      if (!visitor) await load("/stock/gestlok-push.js");
      await load("/stock/munro-daily.js");
      await load("/stock/mi-gusto-resenas.js?rev=resenas-editar-20261027");
      if (!visitor) await load("/stock/mi-gusto-resenas-contactos.js?rev=whatsapp-cupon-20261030");
      if (!visitor) await load("/stock/gestlok-reclamos-internos.js?rev=reclamos-global-20261029");
      if (!visitor) await load("/stock/mi-gusto-cierre-online.js?rev=ok-preservar-filas-20261105");
      if (!visitor) await load("/stock/mi-gusto-pedidos-clientes.js?rev=whatsapp-munro-meta-20261107");
      await load("/stock/munro-motos.js?rev=motos-historial-gerentes-20261102");
      await load("/stock/gestlok-commerce.js");
      if (!visitor) await load("/stock/gestlok-pilot.js?rev=zayro-creadora-operativa-20261108");
      if (!visitor) await load("/stock/gestlok-mis-productos.js?rev=cami-tarjetas-fotos-20261107");
      if (!visitor) await load("/stock/gestlok-cami-monthly.js?rev=cami-monthly-20261106");
      if (!visitor) await load("/stock/gestlok-zayro-admin.js?rev=zayro-public-shop-20261108");
      if (!visitor) await load("/stock/gestlok-scanner-menu.js?rev=zayro-creadora-operativa-20261108");
      if (!visitor) await load("/stock/gestlok-pedidos.js?rev=zayro-creadora-operativa-20261108");
      if (!visitor) await load("/stock/gestlok-precios-stock.js?rev=zayro-creadora-operativa-20261108");
      if (!visitor) await load("/stock/gestlok-future-pricing.js?rev=precios-locales-20261029");
      if (!visitor) await load("/stock/gestlok-molino.js?rev=envios-roles-20261109");
      // Caja diaria por empresa (pedido #200): el servidor decide qué empresa la ve.
      if (!visitor) await load("/stock/gestlok-caja-diaria.js?rev=caja-integrada-20261104");
      if (!visitor) await load("/stock/gestlok-scanner-invites.js");
      await load("/stock/gestlok-owner-areas.js?rev=menu-empresa-20261108");
      await load("/stock/gestlok-creator-mode.js?rev=creadora-inicio-20261026");
      await load("/stock/gestlok-creator-support.js?rev=creadora-permisos-20261108");
      // NFC y QR: solo la creadora. La librería de QR se carga antes del panel que la usa.
      if (!visitor) await load("/vendor/qrcode-generator.js");
      if (!visitor) await load("/stock/gestlok-nfc-qr.js?rev=nfc-comercios-20261102");
      await load("/stock/gestlok-creator-home.js?rev=molino-microapps-20261107");
      await load("/stock/gestlok-tienda.js");
      if (visitor) await load("/stock/gestlok-demo-horarios.js");
      await load("/stock/gestlok-demo.js");
      await load("/stock/gestlok-demo-metrics.js");
      await load("/stock/gestlok-creator.js?rev=el-molino-pendiente-20261107");
      if (!visitor) await load("/stock/gestlok-support.js?rev=menu-empresa-20261108");
      if (!visitor) await load("/stock/gestlok-role-switcher.js?rev=roles-logout-profile-20261107");
      await load("/stock/gestlok-provider-pdf.js");
      // Preservación global de entradas antes de iniciar la app.
      await load("/stock/gestlok-form-draft-guard.js?rev=sin-sugerencias-20261101");
      // Versioned URLs prevent installed PWAs from reusing older registration controllers.
      await load("/stock/app.js?rev=creadora-acceso-empresas-20261108");
      await load("/stock/gestlok-sidebar-polish.js?rev=white-20261028-v2");
      await load("/stock/gestlok-mobile-dock.js?rev=menu-empresa-20261108");
      if (!visitor) await load("/stock/gestlok-navigation-editor.js?rev=menu-empresa-20261108");
      if (visitor) await load("/stock/gestlok-demo-pagos.js?rev=pagos-online-20261029");
      if (visitor) await load("/stock/gestlok-demo-tour.js?rev=pagos-online-20261029");
    })();
    startup.catch(() => { startup = undefined; if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return error ? (
    <div role="alert" style={{ position: "fixed", bottom: 16, left: 16, zIndex: 9999, background: "white", padding: 20 }}>
      No se pudo iniciar la aplicación. Revisá la conexión.{" "}
      <button onClick={() => window.location.reload()}>Reintentar</button>
    </div>
  ) : null;
}
