const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const code = ts.transpileModule(fs.readFileSync("utils/manager-staff-invite.ts","utf8"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const mod={};
new Function("exports","require",code)(mod,()=>{throw Error("Unexpected import")});
const token = "a".repeat(64);
assert(mod.validManagerStaffInvite(token));
for(const value of ["x", "G".repeat(64), "../", "a".repeat(63), token+"a", ""]) {
  assert(!mod.validManagerStaffInvite(value));
  assert.throws(()=>mod.managerStaffInviteUrl("https://gestlok.com.ar","/empleados",value));
}
assert.equal(mod.managerStaffInviteUrl("https://gestlok.com.ar","/empleados",token),
  "https://gestlok.com.ar/empleados/unirse/?invitacion="+token);
assert.throws(()=>mod.managerStaffInviteUrl("http://example.com","/empleados",token),/HTTPS/);
const namedLink = mod.managerStaffInviteUrl("https://gestlok.com.ar","/empleados",token,"Don Torcuato");
assert.equal(new URL(namedLink).searchParams.get("local"),"Don Torcuato");
assert.equal(new URL(namedLink).searchParams.get("invitacion"),token);
assert.equal(new URL(mod.managerStaffInviteUrl("https://gestlok.com.ar","/empleados",token,"Munro")).searchParams.get("local"),"Munro");
const androidLink = mod.chromeInviteUrl(namedLink,"android");
assert(androidLink.startsWith("intent://gestlok.com.ar/empleados/unirse/?"));
assert(androidLink.includes("package=com.android.chrome"));
assert(androidLink.includes("S.browser_fallback_url="));
assert(androidLink.includes(encodeURIComponent(namedLink)));
assert(mod.chromeInviteUrl(namedLink,"ios").startsWith("googlechromes://gestlok.com.ar/empleados/unirse/?"));
for(const bad of [
  "http://gestlok.com.ar/empleados/unirse/?invitacion="+token,
  "https://bad.example/empleados/unirse/?invitacion="+token,
  "https://gestlok.com.ar/empleados/unirse/?invitacion=invalid",
  "https://gestlok.com.ar/otra/?invitacion="+token
]) assert.throws(()=>mod.chromeInviteUrl(bad,"android"),/inválido/);

assert(mod.staffInviteMessage("Don Torcuato","https://gestlok.com.ar/empleados/unirse/?invitacion="+token).includes("Abrir en Google Chrome"),"El mensaje explica cómo salir de WhatsApp");
assert(mod.staffInviteMessage("Munro","https://gestlok.com.ar").includes("Cada persona"));
const sql = fs.readFileSync("../../supabase/migrations/20261028183500_invitaciones_gerente_automaticas.sql","utf8");
for(const required of [
 "manager_staff_invites enable row level security",
 "token_hash text not null unique",
 "sha256(convert_to(raw_token,'UTF8'))",
 "rm_test_private.rm_employee_profile_scope(target_local.organization_id,target_local.id)",
 "rm_test_private.app_role()='manager'",
 "rm_test_private.gestlok_gerente_locals()",
 "rm_test_private.app_role() in ('admin','owner','employee')",
 "and mp.can_edit=true",
 "if invite.redeemed_by is not null",
 "current_role is not null",
 "current_org<>invite.organization_id",
 "status='approved',account_kind='collaborator'",
 "insert into public.rm_organization_members",
 "insert into public.rm_test_documents",
 "insert into public.rm_test_members(user_id,role,sheet_id,local_id)",
 "insert into public.rm_employee_profiles",
 "true) returning id into v_profile",
 "update rm_test_private.manager_staff_invites",
 "perform pg_advisory_xact_lock(216103)",
 "where i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')",
 "expires_at>clock_timestamp()",
]) assert(sql.includes(required),"Required SQL security: "+required);
assert(!sql.includes("on conflict(user_id) do update set role"),"Existing user roles must never be overwritten");
const immediate = fs.readFileSync("../../supabase/migrations/20261030040000_invitaciones_gerentes_acceso_inmediato_colaborador.sql","utf8");
const create = immediate.slice(immediate.indexOf("-- GESTLOK: ruta para crear enlaces de gerentes"),immediate.indexOf("create or replace function rm_test_private.rm_manager_staff_invite_accept"));
assert(create.includes("rm_test_private.app_role()=''"),"Gerentes nativos GESTLOK deben tener ruta propia");
assert(create.includes("p_local=any(rm_test_private.gestlok_gerente_locals())"),"Local debe ser del gerente");
assert(create.includes("e.data->>'rol'='gerente'"),"No permitir invitaciones de editores");
assert(create.includes("e.tenant_id=(select gestlok_tenancy.current_tenant_id())"),"Restringir tenant");
assert(create.includes("case s.id when 'torcuato' then 'dt' else s.id end = p_local"),"Restringir sucursal de la misma asignación");
assert(create.includes("rm_test_private.rm_employee_profile_scope(target_local.organization_id,target_local.id)"));
const fn = immediate.slice(immediate.indexOf("create or replace function rm_test_private.rm_manager_staff_invite_accept"),immediate.indexOf("revoke all on function"));
assert.match(fn, /v_member_role text/,"No usar current_role: palabra reservada PostgreSQL");
assert.match(fn, /select role into v_member_role/);
assert.match(fn, /v_member_role is not null/);
assert.doesNotMatch(fn, /\bcurrent_role\b/);
assert.match(fn, /status='approved',account_kind='collaborator'/,"El alta no necesita aprobación");
assert.match(fn, /insert into public.rm_test_members\(user_id,role,sheet_id,local_id\)/,"Asignación automática al local");
assert.match(fn, /insert into public.rm_employee_profiles/,"Legajo pendiente de completar");
assert.match(fn, /if invite.redeemed_by=v_uid and invite.profile_id is not null/,"Repetir callback OAuth no duplica");
assert.match(fn, /invite.revoked_at is not null or invite.expires_at<=clock_timestamp\(\)/,"Invitación caducada/revocada se rechaza");
assert.match(fn, /current_org<>invite.organization_id/,"No admitir cambios de empresa");
assert.match(fn, /where u.id=auth.uid\(\)/,"Google confirmado");

const manager = fs.readFileSync("components/legajos/ManagerLegajos.tsx","utf8");
assert(manager.includes('Invitar Colaborador'));
assert(manager.includes('showInvite && locals.length>0'));
assert(manager.includes('Invitar colaborador'),"Los dueños también pueden invitar sin editar legajos");
assert(manager.includes('Pendiente de completar'));
assert(manager.includes('onClose={()=>{setShowInvite(false);updateView();}}'));
const update = fs.readFileSync("features/legajos/api.ts","utf8");
assert(update.includes("needs_completion: false"),"Completing an invited profile clears its pending state");
const authorization = fs.readFileSync("features/access/api.ts","utf8");
assert(authorization.includes("rm_app_manager_staff_invite_accept"));
assert(authorization.includes("Cambiar cuenta") === false); // La explicación vive en el formulario.
const upgrade = fs.readFileSync("../../supabase/migrations/20261029030000_invitaciones_gerente_dueno_multiempresa.sql","utf8");
assert(upgrade.includes("rm_test_private.manages_organization(target_local.organization_id)"));
assert(upgrade.includes("rm_test_private.app_role()='owner'"));
assert(upgrade.includes("rm_test_private.app_role()='manager'"));
assert(upgrade.includes("rm_employee_profile_scope(target_local.organization_id,target_local.id)"));
assert(upgrade.includes("p_local=any(rm_test_private.gestlok_gerente_locals())"));
const flow = fs.readFileSync("components/invitations/JoinStaffInvitation.tsx","utf8");
assert(flow.includes("await managerStaffInviteApi.accept(token,preview.group_shared===true)"));
assert(flow.includes("await refresh()"));
assert(flow.includes("Cambiar cuenta de Google"));
assert(flow.includes("Bienvenido a GESTLOK"),"Bienvenida por local");
assert(flow.includes("local {displayLocal}"),"Nombre de local parametrizado");
assert(flow.includes("Abrir en Google Chrome"),"Salida a Chrome con gesto explícito");
assert(flow.includes('href={chromeLink}'),"Enlace real y funcional, sin temporizadores");
assert(flow.includes("copyInvite"),"Alternativa para navegadores que bloquean intents");
assert(flow.includes("googlechromes://") === false,"Deep link seguro se construye en utils");
assert(flow.includes('<GoogleSignIn returnTo="/unirse" compact />'),"Invitación debe tener un único acceso Google");
assert(flow.includes('className="jsi-page"'),"Pantalla móvil integrada");
assert(!flow.includes("¡Te invitaron a un equipo!"),"No repetir bienvenidas genéricas");
const google = fs.readFileSync("components/auth/GoogleSignIn.tsx","utf8");
assert(google.includes("compact = false"),"Login habitual conserva su diseño");
assert(google.includes("if (compact) return"),"Login compacto sin segunda tarjeta");
const navbar = fs.readFileSync("components/layout/AppNavbar.tsx","utf8");
assert(navbar.includes('path === "/unirse"'),"No se muestran dos cabeceras en invitaciones");
const inviteStyle = fs.readFileSync("components/invitations/join-staff-invitation.css","utf8");
assert(inviteStyle.includes("color-scheme:light"),"Invitación blanca incluso con teléfono oscuro");
assert(inviteStyle.includes("min-height:52px"),"Acceso táctil cómodo");

assert(flow.includes("signOut({ scope: \"local\" })"));
assert(flow.includes('router.replace("/")'));
const router = fs.readFileSync("components/invitations/JoinCompany.tsx","utf8");
assert(router.includes('params.has("invitacion")'));
assert(router.includes('params.has("codigo")'));
assert(router.includes("recibonet_staff_invitation"));
const invite = fs.readFileSync("components/invitations/ManagerStaffInvite.tsx","utf8");
assert(invite.includes("https://wa.me/?text="));
assert(invite.includes("managerStaffInviteApi.createGeneral(selectedLocal.id)"));
console.log("PASS: manager-only one-time invitation, automatic employee role/local, pending personnel record and WhatsApp");
