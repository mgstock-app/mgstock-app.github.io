import { createBrowserClient } from "@supabase/ssr";
import { reportConfig } from "@/utils/report-config";
import { authCookieOptions } from "./cookie-options";
export function createClient() {
  if (!reportConfig.url || !reportConfig.publishableKey)
    throw new Error("Falta configurar la conexión de la aplicación.");
  return createBrowserClient(reportConfig.url, reportConfig.publishableKey, {
    cookieOptions: authCookieOptions,
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
