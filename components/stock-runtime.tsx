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
// Los módulos independientes se descargan en paralelo (8 por tanda), pero
// se EJECUTAN en orden usando scripts dinámicos no-async. Así se respetan
// las dependencias existentes sin esperar una petición de red por archivo.
async function loadInOrderedBatches(paths: string[], maxAtOnce = 8) {
  for (let i = 0; i < paths.length; i += maxAtOnce) {
    const batch = paths.slice(i, i + maxAtOnce);
    await new Promise<void>((resolve, reject) => {
      let completed = 0;
      let failed = false;
      for (const src of batch) {
        const script = document.createElement("script");
        script.async = false; // Los navegadores ejecutan estos scripts por orden de inserción.
        script.src = basePath + src;
        script.onload = () => {
          completed++;
          if (completed === batch.length && !failed) resolve();
        };
        script.onerror = () => {
          if (!failed) {
            failed = true;
            reject(new Error(`No se pudo cargar ${src}`));
          }
        };
        document.body.appendChild(script);
      }
    });
  }
}
// Fetch independent, frequently used scripts in parallel while preserving their
// existing sequential execution order and module initialization dependencies.
function preloadStartupScripts(visitor: boolean) {
  const common = [
    "/vendor/supabase.js", "/stock/config.js",
    "/stock/gestlok-offline.js?rev=offline-20261027",
    "/stock/gestlok-commerce.js", "/stock/mi-gusto-conteo-morning.js?rev=conciliacion-20261116",
    "/stock/mi-gusto-conteo.js?rev=mi-gusto-historial-editable-auditado-20261116-comparar-turnos",
    "/stock/gestlok-owner-areas.js?rev=munro-staff-sidebar-20261113",
    "/stock/gestlok-form-draft-guard.js?rev=sin-sugerencias-20261101",
    "/stock/app.js?rev=munro-staff-pc-20261113",
  ];
  const privateScripts = [
    "/stock/gestlok-registration.js",
    "/stock/auth.js?rev=auth-invites-google-20261107",
    "/stock/gestlok-logout.js?rev=logout-profile-menu-20261107",
    "/stock/gestlok-pilot.js?rev=zayro-creadora-operativa-20261108",
    "/stock/gestlok-cami-monthly.js?rev=cami-monthly-20261106",
    "/stock/gestlok-zayro-admin.js?rev=zayro-diseno-tienda-20261109",
    "/stock/gestlok-tiendanube.js?rev=zayro-tiendanube-20261110",
    "/stock/gestlok-scanner-menu.js?rev=zayro-creadora-operativa-20261108",
    "/stock/gestlok-invites.js?rev=invite-google-20261107",
    "/stock/gestlok-molino.js?rev=pedidosya-20261109",
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
      // Preparar en orden; descargar ocho recursos por tanda en lugar de uno por uno.
      const queuedScripts: string[] = [];
      const queueLoad = (src: string) => { queuedScripts.push(src); };
      // Perfil seguro: salida dentro de Mi perfil, también accesible para cuentas pendientes.
      if (!visitor) queueLoad("/stock/gestlok-logout.js?rev=logout-profile-menu-20261107");
      if (!visitor) queueLoad("/stock/gestlok-ios-install.js?rev=ios-home-screen-20261030");
      queueLoad("/stock/gestlok-updates.js?rev=avisos-solo-por-solicitud-20261113");
      if (!visitor) queueLoad("/stock/gestlok-push.js");
      queueLoad("/stock/munro-daily.js");
      queueLoad("/stock/mi-gusto-resenas.js?rev=resenas-editar-20261027");
      if (!visitor) queueLoad("/stock/mi-gusto-resenas-contactos.js?rev=whatsapp-cupon-20261030");
      if (!visitor) queueLoad("/stock/gestlok-reclamos-internos.js?rev=reclamos-global-20261029");
      if (!visitor) queueLoad("/stock/mi-gusto-cierre-online.js?rev=posnet-foto-20261111");
      if (!visitor) queueLoad("/stock/mi-gusto-conteo-morning.js?rev=conciliacion-20261116");
      if (!visitor) queueLoad("/stock/mi-gusto-conteo.js?rev=mi-gusto-historial-editable-auditado-20261116-comparar-turnos");
      if (!visitor) queueLoad("/stock/mi-gusto-pedidos-clientes.js?rev=whatsapp-pestana-avisos-20261115");
      queueLoad("/stock/munro-motos.js?rev=motos-autoguardado-20261113");
      queueLoad("/stock/gestlok-commerce.js");
      if (!visitor) queueLoad("/stock/gestlok-pilot.js?rev=zayro-creadora-operativa-20261108");
      if (!visitor) queueLoad("/stock/gestlok-mis-productos.js?rev=cami-belisa-descarga-v2-20261113");
      if (!visitor) queueLoad("/stock/gestlok-tiendanube.js?rev=zayro-tiendanube-20261110");
      if (!visitor) queueLoad("/stock/gestlok-cami-monthly.js?rev=cami-monthly-20261106");
      if (!visitor) queueLoad("/stock/gestlok-zayro-admin.js?rev=zayro-diseno-tienda-20261109");
      if (!visitor) queueLoad("/stock/gestlok-scanner-menu.js?rev=zayro-tiendanube-20261110");
      if (!visitor) queueLoad("/stock/gestlok-pedidos.js?rev=zayro-creadora-operativa-20261108");
      if (!visitor) queueLoad("/stock/gestlok-precios-stock.js?rev=zayro-creadora-operativa-20261108");
      if (!visitor) queueLoad("/stock/gestlok-future-pricing.js?rev=precios-locales-20261029");
      // PedidosYa: exclusivo de Molino Café · Acassuso (el servidor valida empresa y sucursal).
      if (!visitor) queueLoad("/stock/gestlok-molino-pya.js?rev=pedidosya-categorias-v2-20261113");
      if (!visitor) queueLoad("/stock/gestlok-molino.js?rev=pedidosya-20261109");
      // Caja diaria por empresa (pedido #200): el servidor decide qué empresa la ve.
      if (!visitor) queueLoad("/stock/gestlok-caja-diaria.js?rev=caja-integrada-20261104");
      if (!visitor) queueLoad("/stock/gestlok-scanner-invites.js");
      queueLoad("/stock/gestlok-owner-areas.js?rev=munro-staff-sidebar-20261113");
      queueLoad("/stock/gestlok-creator-mode.js?rev=creadora-inicio-20261026");
      queueLoad("/stock/gestlok-creator-support.js?rev=creadora-permisos-20261108");
      // NFC y QR: solo la creadora. La librería de QR se carga antes del panel que la usa.
      if (!visitor) queueLoad("/vendor/qrcode-generator.js");
      if (!visitor) queueLoad("/stock/gestlok-nfc-qr.js?rev=nfc-comercios-20261102");
      queueLoad("/stock/gestlok-creator-home.js?rev=molino-brand-20261109");
      queueLoad("/stock/gestlok-tienda.js");
      if (visitor) queueLoad("/stock/gestlok-demo-horarios.js");
      queueLoad("/stock/gestlok-demo.js");
      queueLoad("/stock/gestlok-demo-metrics.js");
      queueLoad("/stock/gestlok-creator.js?rev=el-molino-pendiente-20261107");
      if (!visitor) queueLoad("/stock/gestlok-support.js?rev=burbuja-arrastrable-20261113");
      // Modo diseño: solo la creadora ve el botón; los cambios se leen por empresa.
      if (!visitor) queueLoad("/stock/gestlok-design-mode.js?rev=modo-diseno-lateral-20261109");
      if (!visitor) queueLoad("/stock/gestlok-role-switcher.js?rev=roles-logout-profile-20261107");
      queueLoad("/stock/gestlok-provider-pdf.js");
      // Preservación global de entradas antes de iniciar la app.
      queueLoad("/stock/gestlok-form-draft-guard.js?rev=sin-sugerencias-20261101");
      await loadInOrderedBatches(queuedScripts);
      // Versioned URLs prevent installed PWAs from reusing older registration controllers.
      await load("/stock/app.js?rev=munro-staff-pc-20261113");
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
