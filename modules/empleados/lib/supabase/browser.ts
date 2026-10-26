import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { reportConfig } from "@/utils/report-config";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (!reportConfig.url || !reportConfig.publishableKey)
    throw new Error("Falta configurar la conexión de la aplicación.");
  if (typeof window !== "undefined" && browserClient) return browserClient;
  // GitHub Pages is entirely static. Share the SDK's default localStorage key
  // with stock/auth.js (same origin + Supabase project), rather than SSR cookies.
  // getUser and the RPC/RLS checks still validate identity and permissions remotely.
  const client = createSupabaseClient(reportConfig.url, reportConfig.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  if (typeof window !== "undefined") browserClient = client;
  return client;
}
