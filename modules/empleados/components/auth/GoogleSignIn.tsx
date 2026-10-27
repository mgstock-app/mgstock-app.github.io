"use client";
import { useState } from "react";
import { brand } from "@/utils/brand";
import { createClient } from "@/lib/supabase/browser";
import { reportConfig } from "@/utils/report-config";
export function GoogleSignIn({ returnTo }: { returnTo?: "/unirse" } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    try {
      try {
        if (returnTo) sessionStorage.setItem("recibonet_return_to", returnTo);
      } catch {
        /* Reopen the invitation if storage is disabled. */
      }
      const response = await fetch(`${reportConfig.url}/auth/v1/settings`, {
        headers: { apikey: reportConfig.publishableKey },
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("No se pudo comprobar la conexión con Google.");
      const settings: { external?: { google?: boolean } } =
        await response.json();
      if (!settings.external?.google) {
        setError(
          "Google todavía no está habilitado para esta aplicación. La administración debe completar su configuración en Supabase.",
        );
        setBusy(false);
        return;
      }
      const { error: cause } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_MODULE_BASE}/auth/callback/`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (cause) throw cause;
    } catch {
      setError(
        "No se pudo iniciar Google. Comprobá que el proveedor esté habilitado e intentá nuevamente.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="login-card">
      <span className="eyebrow">{brand.name}</span>
      <h1>Tu cuenta, tus reportes</h1>
      <p>Ingresá o registrate con la cuenta de Google de tu dispositivo.</p>
      <button
        className="primary-button google-button"
        onClick={login}
        disabled={busy}
      >
        <span aria-hidden="true">G</span>
        {busy ? "Conectando con Google…" : "Continuar con Google"}
      </button>
      <p className="hint">
        Al registrarte podrás elegir dueño o colaborador. Los dueños necesitan
        un correo autorizado; los colaboradores ingresan con la invitación de su
        dueño.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </main>
  );
}
