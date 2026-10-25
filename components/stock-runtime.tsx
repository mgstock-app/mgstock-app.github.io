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
      await load("/vendor/supabase.js");
      await load("/stock/config.js");
      await load("/stock/auth.js");
      await load("/stock/gestlok-updates.js");
      await load("/stock/gestlok-push.js");
      await load("/stock/munro-daily.js");
      await load("/stock/gestlok-commerce.js");
      await load("/stock/gestlok-tienda.js");
      await load("/stock/gestlok-demo.js");
      await load("/stock/gestlok-creator.js");
      await load("/stock/gestlok-support.js");
      await load("/stock/gestlok-provider-pdf.js");
      await load("/stock/app.js");
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
