import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { reportConfig } from "@/utils/report-config";

let browserClient: SupabaseClient | undefined;
// Modo sin conexión compartido con «Administrar mi empresa» (public/stock/gestlok-offline.js).
type OfflineApi = {
  transport: (base: string, apikey: string, fetcher?: typeof fetch) => typeof fetch;
  attach: (client: SupabaseClient, base: string, home?: string) => SupabaseClient;
};
function offlineApi(): OfflineApi | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { GestLokOffline?: OfflineApi }).GestLokOffline;
}

export function createClient() {
  if (!reportConfig.url || !reportConfig.publishableKey)
    throw new Error("Falta configurar la conexión de la aplicación.");
  if (typeof window !== "undefined" && browserClient) return browserClient;
  // GitHub Pages is entirely static. Share the SDK's default localStorage key
  // with stock/auth.js (same origin + Supabase project), rather than SSR cookies.
  // getUser and the RPC/RLS checks still validate identity and permissions remotely.
  const offline = offlineApi();
  const direct: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });
  const client = createSupabaseClient(reportConfig.url, reportConfig.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
    global: {
      // Sin conexión: lecturas desde este equipo y cambios en cola que se envían solos al volver internet.
      fetch: offline ? offline.transport(reportConfig.url, reportConfig.publishableKey, direct) : direct,
    },
  });
  if (typeof window !== "undefined") {
    browserClient = client;
    offline?.attach(client, reportConfig.url, process.env.NEXT_PUBLIC_GESTLOK_HOME || "/");
  }
  return client;
}
