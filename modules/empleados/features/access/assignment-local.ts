import { accessApi } from "./api";
import type { AppLocal, Company } from "@/types/access";

export async function resolveAssignmentLocal(company: Company, cycle: AppLocal["cycle"]) {
  const matching = (rows: AppLocal[]) => rows.filter((row) =>
    row.company_id === company.id && row.organization_id === company.organization_id);
  let locals = matching(await accessApi.locals());
  if (!locals.length) {
    try {
      await accessApi.createBranch(company.id, company.name.slice(0, 80), cycle);
    } catch (cause) {
      // Another assignment may have created the same company destination.
      locals = matching(await accessApi.locals());
      if (!locals.length) throw cause;
    }
    locals = matching(await accessApi.locals());
  }
  if (locals.length !== 1) {
    throw new Error("La empresa tiene varios locales. Cerrá y abrí la asignación para elegir el correspondiente.");
  }
  return locals[0].id;
}
