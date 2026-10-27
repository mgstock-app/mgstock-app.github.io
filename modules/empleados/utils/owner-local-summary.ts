import type { AppLocal, AppUser, Company } from "@/types/access";

/** Owner memberships cover every branch of their organization, not one assigned local. */
export function formatOwnerLocalSummary(
  owner: Pick<AppUser, "role" | "organization_id">,
  locals: AppLocal[],
  companies: Company[],
): string {
  if (owner.role !== "owner" || !owner.organization_id) return "Sin locales visibles";

  const ownedCompanies = new Map(
    companies
      .filter((company) => company.organization_id === owner.organization_id)
      .map((company) => [company.id, company.name]),
  );
  const branches = locals.filter(
    (local) =>
      local.organization_id === owner.organization_id &&
      ownedCompanies.has(local.company_id) &&
      typeof local.name === "string" && local.name.trim().length > 0,
  );

  if (branches.length === 0) return "Sin locales creados";

  // When different companies use the same local name, identify the company.
  const companiesByName = new Map<string, Set<string>>();
  for (const branch of branches) {
    const key = branch.name.trim().toLocaleLowerCase("es");
    if (!companiesByName.has(key)) companiesByName.set(key, new Set());
    companiesByName.get(key)!.add(branch.company_id);
  }
  const names = [...new Set(branches.map((branch) => {
    const name = branch.name.trim();
    const repeatedInCompanies = (companiesByName.get(name.toLocaleLowerCase("es"))?.size ?? 0) > 1;
    return repeatedInCompanies ? `${name} (${ownedCompanies.get(branch.company_id)})` : name;
  }))].sort((a, b) => a.localeCompare(b, "es"));

  return names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}
