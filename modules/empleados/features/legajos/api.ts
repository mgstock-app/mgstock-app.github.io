import { createClient } from "@/lib/supabase/browser";
import type { AppLocal } from "@/types/access";

export type LegajoStatus = "activo" | "refuerzo" | "inactivo";
export type Legajo = {
  id: string;
  organization_id: string;
  local_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  payment_alias: string;
  notes: string;
  status: LegajoStatus;
  reinforcement_dates: string[];
  last_worked_on: string | null;
  started_on: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};
export type LegajoInput = Pick<Legajo,
  "organization_id" | "local_id" | "first_name" | "last_name" |
  "phone" | "payment_alias" | "notes" | "status" |
  "reinforcement_dates" | "last_worked_on" | "started_on"
>;
export type LegajoHistory = {
  id: number;
  actor_id: string;
  recorded_at: string;
  previous_status: LegajoStatus | null;
  status: LegajoStatus;
  action: "alta" | "actualizacion";
  reinforcement_dates: string[];
  last_worked_on: string | null;
};

export const stateNames: Record<LegajoStatus, string> = {
  activo: "Activo", refuerzo: "Refuerzo", inactivo: "Inactivo",
};

export function dateToDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? [match[3], match[2], match[1]].join("/") : "";
}
export function dateToIso(value: string): string | null {
  const v = value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!match) return null;
  const d = Number(match[1]), m = Number(match[2]), y = Number(match[3]);
  if (y < 1900 || y > 2200) return null;
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCDate() !== d || day.getUTCMonth() !== m - 1 || day.getUTCFullYear() !== y) return null;
  return [String(y).padStart(4, "0"), String(m).padStart(2, "0"), String(d).padStart(2, "0")].join("-");
}
export function cleanLegajo(input: LegajoInput): LegajoInput {
  const first_name = input.first_name.trim().replace(/\s+/g, " ");
  const last_name = input.last_name.trim().replace(/\s+/g, " ");
  const phone = input.phone.trim();
  const payment_alias = input.payment_alias.trim();
  const notes = input.notes.trim();
  if (!first_name || first_name.length > 100 || !last_name || last_name.length > 100)
    throw new Error("Ingresá nombre y apellido (máximo 100 caracteres cada uno).");
  if (phone.length > 35 || (phone && !/^[+\d\s()-]+$/.test(phone)))
    throw new Error("Revisá el teléfono; debe contener solo números, espacios, +, - o paréntesis.");
  if (payment_alias.length > 120 || notes.length > 1500)
    throw new Error("El alias o las observaciones superan el largo permitido.");
  const dates = [...new Set(input.reinforcement_dates)].sort();
  if (dates.some(d => !dateToIso(dateToDisplay(d)) || dateToIso(dateToDisplay(d)) !== d))
    throw new Error("Hay una fecha de refuerzo inválida.");
  if (input.status === "refuerzo" && dates.length === 0)
    throw new Error("Para Refuerzo, agregá al menos una fecha trabajada (dd/mm/aaaa).");
  if (input.status === "inactivo" && !input.last_worked_on)
    throw new Error("Para Inactivo, indicá hasta qué día trabajó (dd/mm/aaaa).");
  for (const d of [input.last_worked_on, input.started_on]) {
    if (d && dateToIso(dateToDisplay(d)) !== d) throw new Error("La fecha indicada no es válida.");
  }
  return {
    ...input, first_name, last_name, phone, payment_alias, notes,
    reinforcement_dates: dates,
    last_worked_on: input.status === "inactivo" ? input.last_worked_on : null,
  };
}

export async function loadLegajoLocals(): Promise<AppLocal[]> {
  const { data, error } = await createClient().rpc("rm_employee_profile_locals");
  if (error || !Array.isArray(data)) throw new Error("No se pudieron consultar los locales autorizados.");
  return (data as AppLocal[]).filter(l => typeof l?.id === "string" && typeof l?.organization_id === "string");
}
export async function loadLegajos(locals: AppLocal[]): Promise<Legajo[]> {
  if (!locals.length) return [];
  const orgIds = [...new Set(locals.map(l => l.organization_id))];
  const { data, error } = await createClient().from("rm_employee_profiles").select("*")
    .in("organization_id", orgIds).in("local_id", locals.map(l => l.id))
    .order("last_name").order("first_name");
  if (error) throw new Error("No se pudieron consultar los legajos de tus locales.");
  const authorized = new Set(locals.map(l => l.organization_id + ":" + l.id));
  return (data || []).filter(r => authorized.has(r.organization_id + ":" + r.local_id)) as Legajo[];
}
export async function createLegajo(input: LegajoInput): Promise<Legajo> {
  const cleaned = cleanLegajo(input);
  const { data, error } = await createClient().from("rm_employee_profiles")
    .insert(cleaned).select("*").single();
  if (error || !data) throw new Error("No se pudo guardar el legajo. Comprobá los campos, conexión y permisos.");
  return data as Legajo;
}
export async function updateLegajo(original: Legajo, input: LegajoInput): Promise<Legajo> {
  if (input.organization_id !== original.organization_id || input.local_id !== original.local_id)
    throw new Error("No se puede cambiar un legajo de local o empresa.");
  const cleaned = cleanLegajo(input);
  const { data, error } = await createClient().from("rm_employee_profiles")
    .update(cleaned)
    .eq("id", original.id)
    .eq("organization_id", original.organization_id)
    .eq("local_id", original.local_id)
    .eq("updated_at", original.updated_at)
    .select("*").maybeSingle();
  if (error || !data) throw new Error("No se pudo actualizar: puede haber cambios de otro gerente. Actualizá los datos e intentá nuevamente.");
  return data as Legajo;
}
export async function loadLegajoHistory(profile: Legajo): Promise<LegajoHistory[]> {
  const { data, error } = await createClient().from("rm_employee_profile_history")
    .select("id,actor_id,recorded_at,previous_status,status,action,reinforcement_dates,last_worked_on")
    .eq("profile_id", profile.id)
    .eq("organization_id", profile.organization_id)
    .eq("local_id", profile.local_id)
    .order("recorded_at", { ascending: false })
    .limit(60);
  if (error) throw new Error("No se pudo consultar el historial de cambios.");
  return (data || []) as LegajoHistory[];
}

export type PreviousEmployee = {
  organization_id: string;
  local_id: string;
  source_id: string;
  full_name: string;
  status: LegajoStatus;
};
/** Only names and previous status are exposed to the manager; NEVER payroll data. */
export async function loadPreviousEmployees(locals: AppLocal[]): Promise<PreviousEmployee[]> {
  if (!locals.length) return [];
  const { data, error } = await createClient().rpc("rm_employee_profile_roster");
  if (error || !Array.isArray(data)) throw new Error("No se pudo consultar la nómina anterior.");
  const keys = new Set(locals.map(l => l.organization_id + ":" + l.id));
  return (data as PreviousEmployee[]).filter(r =>
    keys.has(r.organization_id + ":" + r.local_id)
    && typeof r.full_name === "string" && typeof r.source_id === "string");
}
