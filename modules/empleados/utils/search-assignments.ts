import type { AppUser, AppLocal, Company } from "@/types/access";
import { needsAssignment } from "@/utils/assignment-selection";
export const normalizeAssignmentText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es-AR").trim();
export function searchAssignmentUsers(
  users: AppUser[], locals: AppLocal[], companies: Company[],
  search: string, onlyPending = false, localFilter = "todos",
): AppUser[] {
  const q = normalizeAssignmentText(search);
  const localById = new Map(locals.map(l => [l.id,l]));
  const companyById = new Map(companies.map(c => [c.id,c]));
  return users.filter(user => {
    if (onlyPending && !needsAssignment(user)) return false;
    if (localFilter !== "todos" && user.local_id !== localFilter) return false;
    if (!q) return true;
    const local = user.local_id ? localById.get(user.local_id) : null;
    const companyId = local?.company_id || user.manager_company_id;
    const company = companyId ? companyById.get(companyId) : null;
    return normalizeAssignmentText([
      user.display_name, user.email, local?.name, company?.name, user.local_name,
      user.role || "sin asignar", user.status,
    ].filter(Boolean).join(" ")).includes(q);
  });
}
