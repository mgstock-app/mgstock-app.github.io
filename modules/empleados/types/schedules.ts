import type { SchedulePermissions } from "./access";
import type { Role } from "./report";
export interface ScheduleRow {
  name: string;
  unit: "horas" | "turnos";
  worked: number;
  off: number;
  holiday: number;
  justified: number;
  unjustified: number;
}
export interface Schedule {
  id: string;
  company_id: string;
  organization_id: string;
  period: "semanal" | "mensual";
  starts_on: string;
  ends_on: string;
  rows: ScheduleRow[];
  notes: string;
  status: "draft" | "published";
  version: number;
  updated_at: string;
  published_at: string | null;
}
export interface ScheduleContext {
  permissions: SchedulePermissions;
  collaborators: { id: string; name: string }[];
}
export interface ScheduleComment {
  id: string;
  author_name: string;
  author_role: Role;
  body: string;
  created_at: string;
}
