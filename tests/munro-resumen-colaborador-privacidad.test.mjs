import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");

const sql=read("supabase/migrations/20261117115000_munro_resumen_empleado_solo_lectura.sql");
const mine=read("modules/empleados/components/schedules/EmployeeMunroWeeklySummary.tsx");
const portal=read("modules/empleados/components/schedules/EmployeeScheduleLink.tsx");
const links=read("modules/empleados/components/schedules/MunroEmployeeLinks.tsx");
const staff=read("modules/empleados/components/schedules/MunroWeeklySchedule.tsx");

test("Munro: empleado ve exclusivamente su propia semana, sin escrituras",()=>{
 assert.match(sql,/rm_munro_horarios_mi_resumen\(\)/);
 assert.match(sql,/rm_test_private\.app_role\(\)<>'employee'/);
 assert.match(sql,/m\.local_id='munro' and d\.status='approved'/);
 assert.match(sql,/v\.usuario_id=v_usuario/);
 assert.match(sql,/p\.colaborador_id=v_persona/);
 assert.match(sql,/\(j\.value->>'id'\)::integer=v_persona/);
 assert.match(sql,/revoke all on function public\.rm_munro_horarios_mi_resumen\(\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.rm_munro_horarios_mi_resumen\(\) to authenticated/);
 assert.doesNotMatch(sql,/\bupdate rm_test_private\.munro_horarios_planillas\b|\bdelete from rm_test_private\.munro_horarios_planillas\b/i);
 assert.match(portal,/user\.local_id==="munro"&&<EmployeeMunroWeeklySummary/);
 assert.match(mine,/rm_munro_horarios_mi_resumen/);
 assert.match(mine,/Mi resumen semanal/);
 assert.match(mine,/Solo lectura/);
 assert.doesNotMatch(mine,/Modificar|Guardar ahora|rm_munro_horarios_guardar/);
});

test("Munro: vinculación exige gerente autorizado y nunca coincide por nombre",()=>{
 assert.match(sql,/horarios_puede_archivar\('munro'\)/);
 assert.match(sql,/create table if not exists rm_test_private\.munro_horarios_cuentas/);
 assert.match(sql,/usuario_id uuid primary key/);
 assert.match(sql,/colaborador_id integer not null unique/);
 assert.match(sql,/revoke all on rm_test_private\.munro_horarios_cuentas from public,anon,authenticated/);
 assert.match(sql,/m\.user_id=p_usuario and m\.role='employee' and m\.local_id='munro'/);
 assert.match(sql,/d\.status='approved'/);
 assert.match(sql,/auth\.users u on u\.id=d\.user_id and u\.email_confirmed_at is not null/);
 assert.match(sql,/vinculado',false/);
 assert.match(links,/rm_munro_horarios_cuentas_listar/);
 assert.match(links,/rm_munro_horarios_cuentas_vincular/);
 assert.match(links,/Sin vincular/);
 assert.match(staff,/puedeEditar&&<MunroEmployeeLinks personas=\{filas\}/);
 assert.doesNotMatch(sql,/\bwhere lower\(d\.display_name\)\s*=\s*lower\(c\.nombre\)/);
});

test("solo Munro habilita el resumen en la vista individual, resto conserva Google Sheets",()=>{
 assert.match(portal,/user\?\.role !== "employee" \|\| user\.status !== "approved"/);
 assert.match(portal,/user\.local_id==="munro"/);
 assert.match(portal,/rm_app_employee_schedule_view/);
 assert.match(portal,/Ver planilla \(solo lectura\)/);
 assert.match(mine,/e\.target\.value/);
});
