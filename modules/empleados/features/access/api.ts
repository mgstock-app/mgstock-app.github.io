import { createClient } from "@/lib/supabase/browser";
import type {
  AppUser,
  AppLocal,
  ReportAccess,
  AccessRequest,
  Organization,
  Company,
} from "@/types/access";
import type { Role } from "@/types/report";
export async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await createClient().rpc(name, args);
  if (error) {
    if (["42501", "PGRST301"].includes(error.code))
      throw new Error(
        "Tu cuenta no tiene permiso para esta acción. Actualizá tu sesión.",
      );
    if (["PGRST202", "42P01", "42883"].includes(error.code))
      throw new Error(
        "Falta aplicar la actualización de roles en la base de datos.",
      );
    throw new Error(error.message || "No se pudo completar la operación.");
  }
  return data as T;
}
export const accessApi = {
  organizations: () => rpc<Organization[]>("rm_app_organizations"),
  companies: async (): Promise<Company[]> => {
    const { data, error } = await createClient()
      .from("rm_companies")
      .select("id,organization_id,name")
      .order("name");
    if (error) throw new Error("No se pudieron consultar las empresas.");
    return data;
  },
  ownerCount: () => rpc<number>("rm_app_owner_count"),
  createOwner: (email: string, name: string) =>
    rpc<string>("rm_app_create_owner", { p_email: email, p_name: name }),
  invite: (org: string, email: string) =>
    rpc<void>("rm_app_invite", { p_org: org, p_email: email }),
  adminAccess: (org: string, email: string, enable: boolean) =>
    rpc<void>("rm_app_admin_access", {
      p_org: org,
      p_email: email,
      p_enable: enable,
    }),
  createCompany: (org: string, name: string) =>
    rpc<void>("rm_app_create_company", { p_org: org, p_name: name }),
  createBranch: (company: string, name: string, cycle: AppLocal["cycle"]) =>
    rpc<void>("rm_app_create_branch", {
      p_company: company,
      p_name: name,
      p_cycle: cycle,
    }),
  me: () => rpc<AppUser>("rm_app_me"),
  assignManager: (
    user: string,
    company: string,
    edit: boolean,
    publish: boolean,
    comment: boolean,
    local: string,
    sheet: string | null,
  ) =>
    rpc<void>("rm_app_assign_manager_report", {
      p_user: user,
      p_company: company,
      p_edit: edit,
      p_publish: publish,
      p_comment: comment,
      p_local: local,
      p_sheet: sheet,
    }),
  users: () => rpc<AppUser[]>("rm_app_users"),
  locals: () => rpc<AppLocal[]>("rm_app_locals"),
  assign: (
    user: string,
    role: Role,
    local: string | null,
    sheet: string | null,
  ) =>
    rpc<void>("rm_app_assign", {
      p_user: user,
      p_role: role,
      p_local: local,
      p_sheet: sheet,
    }),
  reject: (user: string) => rpc<void>("rm_app_reject", { p_user: user }),
  createLocal: (name: string, cycle: AppLocal["cycle"], owner: string | null) =>
    rpc<void>("rm_app_create_local", {
      p_name: name,
      p_cycle: cycle,
      p_owner: owner,
    }),
  access: () => rpc<ReportAccess>("rm_app_access_state"),
  open: () => rpc<ReportAccess>("rm_app_open_report"),
  image: () =>
    rpc<{ image: string; expires_at: string; server_now: string }>(
      "rm_app_report_image",
    ),
  request: () => rpc<void>("rm_app_request_access"),
  requests: () => rpc<AccessRequest[]>("rm_app_access_requests"),
  review: (user: string, approve: boolean) =>
    rpc<void>("rm_app_review_access", { p_user: user, p_approve: approve }),
};

