import { rpc } from "@/features/access/api";
import type { JoinLink } from "@/types/invitations";
export const onboardingApi = {
  preauthorizeCollaborator: (company: string, email: string) => rpc<void>("rm_app_preauthorize_collaborator", { p_company: company, p_email: email }),
  collaboratorPreauthorizations: () => rpc<{ email: string; company_id: string; company_name: string; registered: boolean }[]>("rm_app_collaborator_preauthorizations"),
  ownerCode: (org: string, rotate = false) => rpc<{ company_id: string; code: string; expires_at: string }>("rm_app_owner_join_code", { p_org: org, p_rotate: rotate }),
  joinOwner: (number: string, code: string, accepted: boolean) => rpc<void>("rm_app_join_as_owner", { p_number: number, p_code: code, p_accept: accepted }),
  ownerInvitations: () =>
    rpc<{ email: string; created_at: string }[]>("rm_app_owner_invitations"),
  allowOwner: (email: string, enable: boolean) =>
    rpc<void>("rm_app_allow_owner", { p_email: email, p_enable: enable }),
  register: (kind: "owner" | "collaborator", name: string, accepted: boolean) =>
    rpc<void>("rm_app_register_choice", {
      p_kind: kind,
      p_name: name,
      p_accept: accepted,
    }),
};
export const joinApi = {
  create: (company: string, local: string | null) =>
    rpc<JoinLink>("rm_app_create_join_link", {
      p_company: company,
      p_local: local,
    }),
  list: (company: string) =>
    rpc<JoinLink[]>("rm_app_join_links", { p_company: company }),
  revoke: (link: string) =>
    rpc<void>("rm_app_revoke_join_link", { p_link: link }),
  preview: (token: string) =>
    rpc<{
      company_name: string;
      space_name: string;
      local_name: string | null;
    }>("rm_app_join_preview", { p_token: token }),
  join: (token: string) => rpc<void>("rm_app_join_by_link", { p_token: token }),
};

/** Only gerentes authorized in a specific local may issue these links.
 * Acceptance is atomic: verified Google user -> employee role + company/local
 * + empty private paysheet + manager's pending personnel record.
 */
export const managerStaffInviteApi = {
  create: (local: string) => rpc<{token:string;local_id:string;local_name:string;expires_at:string}>(
    "rm_app_manager_staff_invite_create", {p_local:local}
  ),
  createGeneral: (local: string) => rpc<{token:string;local_id:string;local_name:string;expires_at:string;group_shared:boolean}>(
    "rm_app_manager_staff_group_create", {p_local:local}
  ),
  status: (local: string) => rpc<{local_id:string;pending:number;accepted:number;expired:number;revoked:number}>(
    "rm_app_manager_staff_invite_status", {p_local:local}
  ),
  preview: async (token: string): Promise<{company_name:string;local_name:string;expires_at:string;group_shared?:boolean}> => {
    try {return await rpc<{company_name:string;local_name:string;expires_at:string;group_shared:boolean}>("rm_app_manager_staff_group_preview", {p_token:token});}
    catch {return rpc<{company_name:string;local_name:string;expires_at:string}>("rm_app_manager_staff_invite_preview", {p_token:token});}
  },
  accept: (token: string, isGeneral = false) => rpc<{local_id:string;profile_id:string;joined:boolean}>(
    isGeneral ? "rm_app_manager_staff_group_accept" : "rm_app_manager_staff_invite_accept",
    {p_token:token}
  ),
};
