import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("modules/empleados/components/schedules/MunroWeeklySchedule.tsx");
const migration=read("supabase/migrations/20261117095500_munro_horarios_correcciones_cierre.sql");

test("un colaborador archivado puede corregirse con permiso, sin cambiar la semana viva",()=>{
 assert.match(ui,/const puedeEditar=planilla\?\.puede_editar===true;/);
 assert.match(ui,/rm_munro_horarios_corregir_cierre/);
 assert.match(ui,/semanaCerrada\s*\?await rpc/);
 assert.match(ui,/const fuentesResumen=filas;/);
 assert.match(ui,/editarPersona\(f\.id\)&&!semanaCerrada/);
 assert.match(ui,/puedeEditar&&!semanaCerrada&&<div className="mhs-agregar">/);
 assert.match(ui,/Semana finalizada · correcciones auditadas/);
});

test("la corrección de snapshot no elude permisos y conserva un historial de cambios",()=>{
 assert.match(migration,/horarios_puede_archivar\('munro'\)/);
 assert.match(migration,/auth\.uid\(\) is null/);
 assert.match(migration,/for update/);
 assert.match(migration,/v_ver:=coalesce\(\(v_registro->>'version'\)::integer,0\)/);
 assert.match(migration,/p_version<>v_ver/);
 assert.match(migration,/rm_test_private\.munro_horarios_correcciones_cierre/);
 assert.match(migration,/datos_antes jsonb not null/);
 assert.match(migration,/datos_despues jsonb not null/);
 assert.match(migration,/jsonb_set\(v_archivo\.registros/);
 assert.match(migration,/revoke all on function public\.rm_munro_horarios_corregir_cierre/);
 assert.match(migration,/grant execute on function public\.rm_munro_horarios_corregir_cierre.*authenticated/);
 assert.doesNotMatch(migration,/update rm_test_private\.munro_horarios_planillas|update rm_test_private\.munro_horarios_colaboradores/);
});
