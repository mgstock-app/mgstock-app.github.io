"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
// Regreso de Google. El cliente del navegador canjea el código PKCE (detectSessionInUrl)
// y recién después se vuelve al inicio del módulo. No se guardan tokens en la dirección.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      const failed = window.setTimeout(() => { if (alive) setError(true); }, 0);
      return () => { alive = false; window.clearTimeout(failed); };
    }
    const client = createClient();
    const finish = (ok: boolean) => { if (!alive) return; if (ok) router.replace("/"); else setError(true); };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) finish(true);
    });
    const timer = window.setTimeout(async () => {
      const { data } = await client.auth.getSession();
      finish(!!data.session);
    }, 4000);
    return () => { alive = false; subscription.unsubscribe(); window.clearTimeout(timer); };
  }, [router]);
  return (
    <main className="login-card" aria-live="polite">
      {error ? (
        <>
          <h1>No se pudo completar el ingreso</h1>
          <p>Volvé a intentar con tu cuenta de Google.</p>
          <a className="primary-button" href={`${process.env.NEXT_PUBLIC_MODULE_BASE}/`}>Volver a intentar</a>
        </>
      ) : (
        <p role="status">Completando el ingreso…</p>
      )}
    </main>
  );
}
