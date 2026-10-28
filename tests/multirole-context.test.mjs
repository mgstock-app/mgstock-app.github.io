import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261028195000_perfil_multirrol_tenants.sql');
const receipts=read('supabase/migrations/20261028201000_recibo_personal_gerente_multirrol.sql');
const personal=read('supabase/migrations/20261028202800_recibo_personal_gerente_legacy.sql');
const support=read('supabase/migrations/20261028202000_soporte_colaboradores.sql');
const offline=read('public/stock/gestlok-offline.js');
const selector=read('public/stock/gestlok-role-switcher.js');
test('Cambiar roles solo verifica pertenencias reales del servidor',()=>{
 for(const term of [
  "account_active_tenant enable row level security",
  "revoke all on gestlok_tenancy.account_active_tenant",
  "gestlok_tenancy.verified_role_context_email()",
  "e.col='equipo'","lower(e.data->>'email')=v_email",
  "where a.user_id=auth.uid()",
  "gestlok_tenancy.choose_role_context(p_tenant uuid)",
  "gestlok_choose_role_context(p_tenant uuid)",
  "current_tenant_id()"
 ])assert(sql.includes(term),term);
 assert(!sql.includes('raw_user_meta_data'),'No usar metadatos editables como autorización');
 assert(!sql.includes('insert into public.docs'),'El perfil nunca crea roles');
 assert(!sql.includes('update public.docs'),'El perfil nunca eleva roles');
});
test('La selección de empresa no reutiliza datos offline ni envía cambios pendientes',()=>{
 assert(offline.includes("path.endsWith('/gestlok_choose_role_context')||path.endsWith('/gestlok_my_role_contexts')"));
 assert(offline.includes("async invalidateContext()"));
 assert(selector.includes("window.GestLokOffline?.pending?.()"));
 assert(selector.includes("window.GestLokOffline?.invalidateContext?.()"));
 assert(selector.includes("gestlok_choose_role_context"));
 assert(selector.includes("gestlok_my_role_contexts"));
 assert(selector.includes("location.reload()"));
});
test('La vista de gerente es propia, no accede a otros recibos',()=>{
 for(const term of [
  "manager_personal_sheets enable row level security",
  "revoke all on rm_test_private.manager_personal_sheets",
  "p_local=any(rm_test_private.gestlok_gerente_locals())",
  "public.mi_rol() not in ('gerente','editor')",
  "s.user_id=auth.uid()",
  "s.tenant_id=gestlok_tenancy.current_tenant_id()",
  "s.local_id=p_local",
  "d.updated_at=i.report_version",
  "i.sheet_id=v_sheet"
 ]) assert(receipts.includes(term),term);
 assert(personal.includes("rm_test_private.app_role() not in ('employee','manager')"));
 const ui=read('modules/empleados/components/reports/ManagerPersonalReceipt.tsx');
 assert(ui.includes("Mi recibo personal"));
 assert(ui.includes("rm_app_manager_personal_receipt_status"));
 assert(ui.includes("rm_app_manager_personal_receipt_detail"));
 assert(!ui.includes("from(\"rm_test_documents\")"),"El cliente nunca consulta la nómina salarial");
});
test('Soporte unificado sigue siendo lectura y no expone escritura',()=>{
 assert(support.includes("gestlok_support_employee_read"));
 assert(support.includes("d.status='approved'"));
 assert(!support.includes("for update"));
 const stock=read('public/stock/gestlok-support.js');
 assert(stock.includes("['dueno','gerente','lectura','colaborador']"));
 const moduleLayout=read('modules/empleados/app/layout.tsx');
 assert(moduleLayout.includes("<SupportWhatsApp />"));
 assert(moduleLayout.includes("<RoleProfileSwitcher />"));
 assert(read('components/stock-runtime.tsx').includes('gestlok-role-switcher.js'));
});
