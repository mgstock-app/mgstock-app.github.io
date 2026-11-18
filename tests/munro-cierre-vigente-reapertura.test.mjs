import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("modules/empleados/components/schedules/MunroWeeklySchedule.tsx");
const guard=read("supabase/migrations/20261118193300_munro_staff_cierre_vigente_y_reaperturas.sql");
const audit=read("supabase/migrations/20261118194000_munro_staff_auditoria_reaperturas.sql");

test("Munro no permite cerrar una semana hasta que comienza el lunes siguiente",()=>{
  assert.match(ui,/if\(semana>=semanaActual\(\)\)/);
  assert.match(ui,/semana>=semanaActual\(momento\)/);
  assert.match(ui,/El cierre se habilita el lunes/);
  assert.match(guard,/new\.semana >= v_lunes/);
  assert.match(guard,/before insert on rm_test_private\.munro_horarios_semanas_cerradas/);
});
test("la semana restaurada conserva las correcciones auditadas sin borrar planillas",()=>{
  assert.match(guard,/munro_horarios_reaperturas/);
  assert.match(guard,/cierre_original jsonb not null/);
  assert.match(guard,/planillas_previas jsonb not null/);
  assert.match(audit,/munro_horarios_semanas_registradas/);
  assert.match(audit,/foreign key \(semana\) references rm_test_private\.munro_horarios_semanas_registradas/);
  assert.match(audit,/mhs_registrar_cierre_auditoria/);
});
test("no se heredan inactivos a semanas nuevas sin planilla, pero se conservan históricos",()=>{
  assert.match(guard,/c\.estado<>''inactivo''/);
  assert.match(guard,/v_ultima_cerrada is not null and v_semana<=v_ultima_cerrada/);
  assert.match(guard,/or exists\(select 1 from rm_test_private\.munro_horarios_planillas/);
});
