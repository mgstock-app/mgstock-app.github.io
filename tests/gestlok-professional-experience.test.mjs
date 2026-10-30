import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Tema profesional compartido en empresa y empleados, sin reemplazar marcas",()=>{
 const a=read("app/layout.tsx"), b=read("modules/empleados/app/layout.tsx");
 const main=read("app/gestlok-experience.css");
 const staff=read("modules/empleados/styles/gestlok-experience.css");
 assert.match(a,/import "\.\/gestlok-experience\.css"/);
 assert.match(b,/import "@\/styles\/gestlok-experience\.css"/);
 for(const className of [".gl-owner-area",".gl-home-essential-links","#snav",".gl-mobile-dock",".savebar"]){
   assert(main.includes(className),"Falta acabado para "+className);
 }
 for(const className of [".mlg-invite-overview",".mlg-pending-filter",".mlg-form",".mlg-tabs",".gl-gerente__sidebar"]){
   assert(staff.includes(className),"Falta acabado empleados: "+className);
 }
 assert.match(main,/filter:none!important/,"Las marcas originales no cambian de color");
 assert.doesNotMatch(main,/display\s*:\s*none\s*!important/, "No ocultar acciones ni menús");
});
test("Invitaciones privadas y legajos editables seguros por local",()=>{
 const client=read("modules/empleados/features/onboarding/api.ts");
 const manager=read("modules/empleados/components/legajos/ManagerLegajos.tsx");
 const sql=read("supabase/migrations/20261030061000_manager_staff_invite_status_private.sql");
 assert.match(client,/rm_app_manager_staff_invite_status/);
 for(const phrase of ["setInviteStats(","inviteKey(local)","Pendientes de completar","Aceptadas","Vencidas","draftDirty","beforeunload","window.confirm"]){
   assert(manager.includes(phrase),"Falta funcionalidad: "+phrase);
 }
 assert.match(sql,/security definer/);
 assert.match(sql,/v_local\.organization_id/);
 assert.match(sql,/i\.company_id=v_local\.company_id/);
 assert.match(sql,/i\.created_by=v_uid/);
 assert.match(sql,/e\.data->>'rol'='gerente'/);
 assert.match(sql,/gestlok_tenancy\.verified_role_context_email\(\)/);
 assert.match(sql,/p_local text/);
 assert.match(sql,/revoke all on function public\.rm_app_manager_staff_invite_status\(text\) from public,anon/);
 assert.match(sql,/grant execute on function public\.rm_app_manager_staff_invite_status\(text\) to authenticated/);
 assert.doesNotMatch(sql,/token_hash|redeemed_by.*jsonb_build_object|raw_token/,"No retornar secretos");
});
