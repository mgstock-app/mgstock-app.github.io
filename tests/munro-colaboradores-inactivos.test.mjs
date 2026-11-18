import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql=fs.readFileSync(new URL("../supabase/migrations/20261118224000_munro_excluir_inactivos_antes_de_semana.sql",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../modules/empleados/components/schedules/MunroWeeklySchedule.tsx",import.meta.url),"utf8");

test("Munro excluye inactivos desde el inicio de semana, aunque exista planilla",()=>{
  assert.match(sql,/c\.estado<>''inactivo''/);
  assert.match(sql,/c\.inactivo_desde>v_semana/);
  assert.doesNotMatch(sql,/or exists\(select 1 from rm_test_private\.munro_horarios_planillas/);
});
test("las semanas archivadas mantienen su personal histórico",()=>{
  assert.match(sql,/or v_cerrada;/);
});
test("Staff dibuja las personas autorizadas por la consulta y no revive planillas de inactivos",()=>{
  assert.match(ui,/const actual=p\.personas\.map\(persona=>/);
});
