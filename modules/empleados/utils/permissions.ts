import type { AppUser } from "@/types/access";
import type { Role } from "@/types/report";
export const roleLabels: Record<Role, string> = {
  admin: "Administrador/a",
  owner: "Dueño/a",
  employee: "Colaborador/a",
  manager: "Gerente",
};
/** Gerente de GESTLOK habilitado por el servidor: solo la carpeta Horarios de sus locales. */
export function isGestlokGerente(user: AppUser | null) {
  return (
    !!user &&
    user.status === "approved" &&
    !user.role &&
    (user.gestlok_gerente?.local_ids?.length ?? 0) > 0
  );
}
export function canManage(user: AppUser | null) {
  return (
    !!user &&
    user.status === "approved" &&
    (user.role === "admin" || (user.role === "owner" && !!user.organization_id))
  );
}
export function hasAssignment(user: AppUser | null) {
  return (
    !!user &&
    user.status === "approved" &&
    (user.role === "admin" ||
      (user.role === "owner" && !!user.organization_id) ||
      (user.role === "manager" &&
        !!user.organization_id &&
        !!user.manager_company_id) ||
      (user.role === "employee" && !!user.local_id && !!user.organization_id))
  );
}
export function canUseSchedules(user: AppUser | null) {
  return (
    canManage(user) ||
    (hasAssignment(user) && user?.role === "manager") ||
    isGestlokGerente(user)
  );
}
export function allowed(role: Role | null, action: string) {
  if (role === "admin") return true;
  if (role === "owner")
    return [
      "view_reports",
      "view_history",
      "edit_reports",
      "delete_reports",
      "manage_collaborators",
      "reopen_access",
      "export_reports",
      "backups",
    ].includes(action);
  return (
    role === "employee" && ["view_reports", "reopen_access"].includes(action)
  );
}
export function displayDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(value))
    : "—";
}
