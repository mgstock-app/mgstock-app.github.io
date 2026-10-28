const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=path=>fs.readFileSync(path,"utf8");
const sql=read("../../supabase/migrations/20261028201000_recibo_personal_gerente_multirrol.sql");
const legacy=read("../../supabase/migrations/20261028202800_recibo_personal_gerente_legacy.sql");
const context=read("../../supabase/migrations/20261028195000_perfil_multirrol_tenants.sql");
for(const x of [
 "manager_personal_sheets enable row level security",
 "revoke all on rm_test_private.manager_personal_sheets",
 "v_uid:=auth.uid()","v_tenant:=gestlok_tenancy.current_tenant_id()",
 "public.mi_rol() not in ('gerente','editor')",
 "p_local=any(rm_test_private.gestlok_gerente_locals())",
 "m.module='recibos_personal' and m.enabled",
 "user_id=v_uid and tenant_id=v_tenant and local_id=p_local",
 "s.user_id=auth.uid()",
 "s.tenant_id=gestlok_tenancy.current_tenant_id()",
 "s.local_id=p_local",
 "d.updated_at=i.report_version",
 "i.sheet_id=v_sheet",
])assert(sql.includes(x),"Privacidad del gerente: "+x);
assert(sql.includes("if public.mi_rol() in ('gerente','editor')"),
 "El contexto gerencial debe ganar sobre la empresa propia seleccionada");
assert(sql.includes("perform rm_test_private.activate_preapproved_shared_owner()"),
 "Conservar flujo existente del dueño");
assert(!sql.includes("delete from public.rm_test_members"),"No eliminar pertenencias anteriores");
assert(legacy.includes("rm_test_private.app_role() not in ('employee','manager')"),
 "Gerente legacy ve solo su recibo individual bajo app_sheet()");
assert(legacy.includes("a.user_id=rm_test_private.uid()"));
assert(legacy.includes("a.sheet_id=rm_test_private.app_sheet()"));
assert(!context.includes("raw_user_meta_data"),"Los roles nunca se toman de metadatos editables");
assert(context.includes("where a.user_id=auth.uid()"));
const profile=read("components/layout/RoleProfileSwitcher.tsx");
assert(profile.includes("gestlok_choose_role_context"));
assert(profile.includes("gestlok_my_role_contexts"));
assert(profile.includes("GestLokOffline"));
assert(profile.includes("gestlok:profile-next-local"));
assert(profile.includes("c.local_names.map"));
const gerente=read("components/pages/GerenteHome.tsx");
assert(gerente.includes("Mi recibo personal"));
assert(gerente.includes("<ManagerPersonalReceipt/>"));
const detail=read("components/reports/ManagerPersonalReceipt.tsx");
assert(detail.includes('rm_app_manager_personal_receipt_status'));
assert(detail.includes('rm_app_manager_personal_receipt_detail'));
assert(detail.includes("<PrivateReceiptDetail receipt={detail}/>"));
assert(!detail.includes('rm_test_documents'),"No leer documentos salariales directamente desde cliente");
const layout=read("app/layout.tsx");
assert(layout.includes("<SupportWhatsApp />"));
assert(layout.includes("<RoleProfileSwitcher />"));
console.log("PASS: perfiles multirrol, recibo gerente propio privado, permisos por local y soporte global");
