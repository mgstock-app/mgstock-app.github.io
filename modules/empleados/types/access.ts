import type { Role } from "./report";
export interface AppUser {
  user_id: string;
  email: string;
  display_name: string;
  role: Role | null;
  local_id: string | null;
  local_name: string | null;
  sheet_id: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  organization_id: string | null;
  owner_public_id: string | null;
  manager_company_id?: string | null;
  invited_company_id?: string | null;
  schedule_permissions?: SchedulePermissions | null;
  account_kind?: "owner" | "collaborator" | null;
  /** Gerente del equipo de GESTLOK: solo accede a Horarios de sus locales (no es un rol propio de Empleados). */
  gestlok_gerente?: { local_ids: string[] } | null;
}
export interface AppLocal {
  id: string;
  name: string;
  cycle: "mensual" | "semanal";
  owner_id: string | null;
  organization_id: string;
  company_id: string;
  /** Optional store image supplied by an authorized company/local configuration. */
  image_url?: string | null;
  logo_url?: string | null;
  photo_url?: string | null;
}
export interface Organization {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_public_id: string | null;
  created_by: string;
}
export interface Company {
  id: string;
  organization_id: string;
  name: string;
}
export interface SchedulePermissions {
  edit: boolean;
  publish: boolean;
  comment: boolean;
}
export interface ReportAccess {
  status: "ready" | "active" | "expired" | "requested" | "unavailable";
  server_now: string;
  expires_at: string | null;
  can_request: boolean;
}
export interface AccessRequest {
  user_id: string;
  display_name: string;
  local_name: string;
  requested_at: string | null;
}
