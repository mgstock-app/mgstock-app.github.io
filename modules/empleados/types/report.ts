export type Role = "admin" | "owner" | "employee" | "manager";
export type LocalCode = string;
export type AccessStatus =
  "ready" | "active" | "expired" | "requested" | "disabled" | "unavailable";
export interface ReportConfig {
  url: string;
  publishableKey: string;
  table: string;
  members: string;
}
export interface PayrollItem {
  c?: number | null;
  i?: number | null;
  v?: number | null;
}
export interface PayrollSheet {
  nombre?: string;
  local?: LocalCode;
  ausente?: boolean;
  ausJust?: boolean;
  vac?: boolean;
  agu?: boolean;
  items?: Partial<
    Record<"trab" | "off" | "fer" | "aus" | "vac" | "agu", PayrollItem>
  >;
}
