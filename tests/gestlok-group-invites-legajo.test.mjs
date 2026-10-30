import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261030224511_gestlok_shared_local_invites_self_legajo.sql');
const panel=read('modules/empleados/components/invitations/ManagerStaffInvite.tsx');
const join=read('modules/empleados/components/invitations/JoinStaffInvitation.tsx');
const onboard=read('modules/empleados/features/onboarding/api.ts');
const self=read('modules/empleados/components/legajos/EmployeeSelfLegajo.tsx');

test('El enlace general funciona para varias personas de un solo local sin cambiar las invitaciones individuales',()=>{
  assert.match(sql,/add column if not exists group_shared boolean not null default false/);
  assert.match(sql,/group_shared=true, expires_at=clock_timestamp\(\)\+interval '30 days'/);
  assert.match(sql,/update rm_test_private\.manager_staff_invites set revoked_at=clock_timestamp\(\)/);
  assert.match(sql,/organization_id=v_org and local_id=v_local/);
  assert.match(sql,/group_shared and revoked_at is null/);
  assert.match(sql,/rm_manager_staff_invite_create\(p_local\)/);
  assert.match(sql,/group_shared and i\.revoked_at is null and i\.expires_at>clock_timestamp\(\)/);
  assert.match(sql,/rm_manager_staff_invite_accept\(v_token\)/);
  assert.match(sql,/return result;/);
  assert.match(sql,/manager_staff_group_not_consumed/);
  assert.match(sql,/redeemed_by is null and redeemed_at is null and profile_id is null/);
  assert.doesNotMatch(sql,/on conflict\s*\(user_id\)\s*do update set role/i);
  assert.match(panel,/createGeneral\(selectedLocal\.id\)/);
  assert.match(panel,/un único enlace general/);
  assert.match(panel,/mismo enlace funciona para/);
  assert.match(panel,/Renovar enlace general/);
  assert.match(join,/accept\(token,preview\.group_shared===true\)/);
  assert.match(onboard,/rm_app_manager_staff_group_create/);
  assert.match(onboard,/rm_app_manager_staff_group_preview/);
  assert.match(onboard,/rm_app_manager_staff_group_accept/);
  assert.match(onboard,/rm_app_manager_staff_invite_accept/);
});

test('El alta requiere Google verificado y no permite usar un enlace general para mover cuentas existentes',()=>{
  assert.match(sql,/if auth\.uid\(\) is null/);
  assert.match(sql,/not rm_test_private\.ensure_directory\(\)/);
  assert.match(sql,/perform pg_catalog\.pg_advisory_xact_lock\(216103\)/);
  assert.match(sql,/prior\.organization_id=shared\.organization_id/);
  assert.match(sql,/prior\.local_id=shared\.local_id/);
  assert.match(sql,/m\.role='employee' and m\.local_id=shared\.local_id/);
  assert.match(sql,/manager_staff_invites where token_hash=v_hash/);
  assert.match(sql,/sha256\(convert_to\(result->>'token','UTF8'\)\)/);
  assert.doesNotMatch(sql,/insert into public\.rm_employee_profiles\(/,
    'Reutiliza la RPC existente para crear legajos en lugar de duplicar una ruta insegura');
  assert.match(sql,/revoke all on function public\.rm_app_manager_staff_group_accept\(text\) from public,anon,authenticated/);
  assert.match(sql,/grant execute on function public\.rm_app_manager_staff_group_accept\(text\) to authenticated/);
});

test('El colaborador solo edita su legajo enlazado, no puede cambiar status, notas, local ni recibos',()=>{
  assert.match(sql,/i\.profile_id=old\.id and i\.redeemed_by=auth\.uid\(\)/);
  for(const field of ['new.status','new.notes','new.reinforcement_dates','new.last_worked_on']){
    assert.ok(sql.includes(field+' is not distinct from old.'+field.slice(4)),field);
  }
  assert.match(sql,/new\.needs_completion=false/);
  assert.match(sql,/new\.local_id<>old\.local_id/);
  assert.match(sql,/new\.organization_id<>old\.organization_id/);
  assert.match(sql,/where i\.redeemed_by=auth\.uid\(\)/);
  assert.match(sql,/rm_app_staff_self_profile_save/);
  assert.match(sql,/rm_app_staff_self_profile\(\)/);
  assert.match(sql,/p_started_on date default null/);
  assert.match(sql,/set first_name=v_first,last_name=v_last,phone=v_phone,payment_alias=v_alias,/);
  assert.match(sql,/started_on=p_started_on,needs_completion=false/);
  for(const key of ['Nombre','Apellido','Teléfono','Alias para transferencias','Fecha de ingreso','opcional','Guardar mi legajo']){
    assert.ok(self.includes(key),key);
  }
  const shell=read('modules/empleados/components/pages/EmployeePortalShell.tsx');
  assert.match(shell,/EmployeeSelfLegajo/);
  assert.match(shell,/Mi legajo/);
  assert.match(shell,/user\.user_id/);
  assert.doesNotMatch(self,/rm_employee_profiles|select\(\*\)|\.from\("rm_employee_profiles"\)/);
});

test('Las funciones privadas no se exponen sin inicio de sesión',()=>{
  for(const f of ['rm_manager_staff_group_create','rm_manager_staff_group_preview','rm_manager_staff_group_accept'])
    assert.ok(sql.includes('revoke all on function rm_test_private.'+f+'(text) from public,anon,authenticated'),f);
  for(const f of ['rm_app_staff_self_profile()','rm_app_staff_self_profile_save(text,text,text,text,date)'])
    assert.ok(sql.includes('revoke all on function public.'+f),f);
});
