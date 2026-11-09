// ZAYRO · configuración pública de Supabase (misma clave anon que usa GESTLOK).
export type Config = { url: string; key: string };

type RpcResult = { data: unknown; error: { message?: string } | null };
export type SupaClient = {
  auth: { getSession(): Promise<{ data: { session: unknown | null } }> };
  rpc(fn: string, args?: Record<string, unknown>): Promise<RpcResult>;
};
declare global {
  interface Window {
    SPM_CONFIG?: Config;
    supabase?: { createClient(url: string, key: string, options?: Record<string, unknown>): SupaClient };
  }
}

function loadScript(src: string, ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ready()) { resolve(); return; }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => ready() ? resolve() : reject(Error("No se pudo preparar " + src));
    script.onerror = () => reject(Error("No se pudo cargar " + src));
    document.head.appendChild(script);
  });
}

let configPromise: Promise<Config> | null = null;
export function getConfig(): Promise<Config> {
  if (!configPromise) {
    configPromise = loadScript("/stock/config.js", () => !!window.SPM_CONFIG)
      .then(() => window.SPM_CONFIG as Config)
      .catch(error => { configPromise = null; throw error; });
  }
  return configPromise;
}

export async function publicRpc<T>(config: Config, fn: string): Promise<T> {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(config.url) || !config.key) throw Error("Configuración no disponible");
  const res = await fetch(config.url + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: { apikey: config.key, Authorization: "Bearer " + config.key, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!res.ok) throw Error("No disponible");
  return res.json() as Promise<T>;
}

// Sesión de GESTLOK en este navegador (misma dirección): solo si existe se carga el cliente completo.
export function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      if (/^sb-[a-z0-9]+-auth-token$/.test(key) && localStorage.getItem(key)) return true;
    }
  } catch { /* almacenamiento bloqueado: se trata como visitante */ }
  return false;
}

export async function sessionClient(config: Config): Promise<SupaClient | null> {
  await loadScript("/vendor/supabase.js", () => !!window.supabase?.createClient);
  const client = window.supabase!.createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { data } = await client.auth.getSession();
  return data?.session ? client : null;
}
