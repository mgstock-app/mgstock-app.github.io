import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("modules/empleados/components/schedules/MunroWeeklySchedule.tsx");
const model=read("modules/empleados/features/schedules/munro-model.ts");
const css=read("modules/empleados/components/schedules/munro-weekly.css");
const sql=read("supabase/migrations/20261116094500_munro_staff_cierre_semanal.sql");

test("Staff Munro muestra siete días juntos sin ancho fijo y mantiene encabezados fijos",()=>{
 assert.match(ui,/const DIAS=\["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"\]/);
 assert.match(ui,/Semana completa · lunes a domingo/);
 assert.match(ui,/aria-label="Semana completa visible"/);
 assert.match(ui,/aria-label="Horarios de lunes a domingo, semana completa visible; desplazamiento vertical"/);
 assert.doesNotMatch(ui,/moverTabla\("final"\)|ref=\{tablaScrollRef\}/);
 assert.match(css,/\.mhs-tabla\{[\s\S]*?table-layout:fixed;[\s\S]*?width:100%;[\s\S]*?min-width:0;/);
 assert.doesNotMatch(css,/width:2370px;/);
 assert.match(css,/\.mhs-tabla thead th\{[\s\S]*?position:sticky;[\s\S]*?top:0/);
 assert.match(css,/\.mhs-tabla tbody th\{[\s\S]*?position:sticky;[\s\S]*?left:0/);
 assert.match(css,/\.mhs-tabla \.mhs-cuatro>label:not\(\.mhs-dia-extra\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.mhs-tabla \.mhs-cuatro input\[type=time\]\{[\s\S]*?width:100%;[\s\S]*?min-width:0/);
});
test("cierre se confirma, se guarda con RPC autorizada y crea semana limpia",()=>{
 assert.match(ui,/Semana finalizada<\/button>/);
 assert.match(ui,/window\.confirm\("¿Finalizar la semana/);
 assert.match(ui,/rm_munro_horarios_finalizar_semana/);
 assert.match(ui,/pendientes\.length/);
 assert.match(ui,/setPlanilla\(null\);setFilas\(\[\]\);setPendientes\(\[\]\)/);
 assert.match(ui,/setSemana\(resultado\.siguiente_semana\)/);
 assert.match(model,/semana_cerrada\?:boolean; cierres\?:string\[\]/);
});
test("schema de semanas finalizadas es privado, no borra horarios ni cambia otros locales",()=>{
 assert.match(sql,/create table if not exists rm_test_private\.munro_horarios_semanas_cerradas/);
 assert.match(sql,/alter table rm_test_private\.munro_horarios_semanas_cerradas enable row level security/);
 assert.match(sql,/revoke all on rm_test_private\.munro_horarios_semanas_cerradas from public,anon,authenticated/);
 assert.match(sql,/horarios_puede_archivar\('munro'\)/);
 assert.match(sql,/auth\.uid\(\) is null/);
 assert.match(sql,/grant execute on function public\.rm_munro_horarios_finalizar_semana\(date\) to authenticated/);
 assert.match(sql,/mhs_planillas_no_editar_cerrada/);
 assert.match(sql,/mhs_feriados_no_editar_cerrada/);
 assert.match(sql,/no hay horarios guardados/i);
 assert.match(sql,/p_semana>v_lunes/);
 assert.doesNotMatch(sql,/drop table|delete from rm_test_private\.munro_horarios_planillas/i);
 assert.doesNotMatch(sql,/insert into rm_test_private\.munro_horarios_semanas_cerradas[\s\S]*?values\s*\('2026-11/);
});
test("el historial conserva copias inmutables y excluye las filas duplicadas de semanas cerradas",()=>{
 assert.match(sql,/jsonb_array_elements\(c\.registros\)/);
 assert.match(sql,/not exists\(select 1 from rm_test_private\.munro_horarios_semanas_cerradas c where c\.semana=p\.semana\)/);
 assert.match(sql,/v_ultima_cerrada is null or v_semana<=v_ultima_cerrada[\s\S]*?or c\.estado<>'inactivo'/);
 assert.match(sql,/v_semana[\s\S]*?'semana_cerrada',v_cerrada,'cierres',v_cierres/);
});
