/** Choose a visible company, preserving an explicit selection. */
export function selectVisibleCompany(companies, selectedId, primaryOrganizationId, preferShared) {
  const selected = companies.find(company => company.id === selectedId);
  if (selected) return selected;
  if (preferShared && primaryOrganizationId) {
    const shared = companies.find(company => company.organization_id !== primaryOrganizationId);
    if (shared) return shared;
  }
  return companies[0];
}
