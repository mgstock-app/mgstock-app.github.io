import type { AppLocal, AppUser, Company } from "@/types/access";

export function assignmentSelection(
  target: AppUser,
  companies: Company[],
  locals: AppLocal[],
  requestedCompany = "",
  requestedLocal = "",
  allowUnlinkedAdminAssignment = false,
) {
  const mayLinkNewCollaborator = allowUnlinkedAdminAssignment && target.organization_id == null &&
    target.status === "pending" && target.role == null && target.account_kind !== "owner";
  const availableCompanies = companies.filter(
    (item) => item.organization_id === target.organization_id || mayLinkNewCollaborator,
  );
  const previousCompany = target.manager_company_id ||
    locals.find((item) => item.id === target.local_id)?.company_id || target.invited_company_id;
  const company = availableCompanies.find((item) => item.id === requestedCompany) ||
    (!requestedCompany && availableCompanies.find((item) => item.id === previousCompany)) ||
    (availableCompanies.length === 1 ? availableCompanies[0] : undefined);
  const availableLocals = locals.filter(
    (item) => !!company && item.company_id === company.id && item.organization_id === company.organization_id,
  );
  const local = availableLocals.find((item) => item.id === requestedLocal) ||
    (!requestedLocal && availableLocals.find((item) => item.id === target.local_id)) ||
    (availableLocals.length === 1 ? availableLocals[0] : undefined);
  return { availableCompanies, company, availableLocals, local };
}

export function needsAssignment(user: AppUser) {
  return user.status === "pending" ||
    (user.status === "approved" && (!user.role ||
      (user.role === "employee" && (!user.local_id || !user.sheet_id)) ||
      (user.role === "manager" && (!user.manager_company_id || !user.local_id || !user.sheet_id))));
}
