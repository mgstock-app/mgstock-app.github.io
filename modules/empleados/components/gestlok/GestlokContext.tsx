"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Contexto visual de GESTLOK (nombre y logo autorizados de la empresa).
// Lee la sesión que GESTLOK ya guardó en este mismo navegador SIN renovarla ni modificarla:
// solo la usa si sigue vigente, para no interferir con la sesión de la aplicación principal.
// No concede permisos: los datos de empleados siempre los autoriza el backend de ReciboNet.
export interface GestlokCompany {
  company_name: string;
  logo_id: string | null;
  recibonet: { organization_number: string; internal_name: string } | null;
}
const Context = createContext<GestlokCompany | null>(null);
const url = process.env.NEXT_PUBLIC_GESTLOK_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_GESTLOK_PUBLISHABLE_KEY || "";
const storageKey = url ? `sb-${new URL(url).hostname.split(".")[0]}-auth-token` : "";

function currentToken(): string | null {
  try {
    const raw = storageKey ? window.localStorage.getItem(storageKey) : null;
    if (!raw) return null;
    const session = JSON.parse(raw) as { access_token?: string; expires_at?: number };
    if (!session.access_token || !session.expires_at) return null;
    return session.expires_at * 1000 > Date.now() + 30000 ? session.access_token : null;
  } catch {
    return null;
  }
}
const text = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");

export async function loadGestlokCompany(fetcher: typeof fetch = fetch): Promise<GestlokCompany | null> {
  const token = currentToken();
  if (!token || !url || !key) return null;
  try {
    const response = await fetcher(`${url}/rest/v1/rpc/gestlok_owner_area_context`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || data.role !== "dueno") return null;
    const link = data.recibonet;
    return {
      company_name: text(data.company_name) || "Mi empresa",
      logo_id: data.logo_id === "mi-gusto" ? "mi-gusto" : null,
      recibonet: link && /^[0-9]{7}$/.test(String(link.organization_number))
        ? { organization_number: String(link.organization_number), internal_name: text(link.internal_name) }
        : null,
    };
  } catch {
    return null;
  }
}

export function GestlokProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<GestlokCompany | null>(null);
  useEffect(() => {
    let alive = true;
    void loadGestlokCompany().then((value) => { if (alive) setCompany(value); });
    return () => { alive = false; };
  }, []);
  return <Context.Provider value={company}>{children}</Context.Provider>;
}
export function useGestlokCompany() {
  return useContext(Context);
}
/** Nombre visible: la empresa vinculada se muestra con su nombre de GESTLOK (p. ej. Mi Gusto). */
export function useDisplayName() {
  const company = useContext(Context);
  return (name: string | null | undefined) => {
    const value = name || "";
    const internal = company?.recibonet?.internal_name?.trim().toLowerCase();
    return internal && value.trim().toLowerCase() === internal ? company!.company_name : value;
  };
}
