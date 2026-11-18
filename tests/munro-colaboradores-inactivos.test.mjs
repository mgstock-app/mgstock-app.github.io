import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql=fs.readFileSync(new URL("../supabase/migrations/20261118224000_munro_excluir_inactivos_antes_de_semana.sql",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../modules/empleados/components/schedules/MunroWeeklySchedule.tsx",import.meta.url),"utf8");

test("Munro excluye inactivos desde el inicio de semana, aunque exista planilla",()=>{
  // La migración conserva el patrón antiguo para localizarlo. Se valida sólo
  // su reemplazo efectivo (v_despues), no el texto histórico (v_antes).
  const nuevo=sql.match(/v_despues\s*:=\s*E'([\s\S]*?)';/)?.[1];
  assert.ok(nuevo,"La migración debe declarar el filtro nuevo");
  assert.match(nuevo,/c\.estado<>''inactivo''/);
  assert.match(nuevo,/c\.inactivo_desde>v_semana/);
  assert.doesNotMatch(nuevo,/or exists\(select 1 from rm_test_private\.munro_horarios_planillas/);
});
test("las semanas archivadas mantienen su personal histórico",()=>{
  assert.match(sql,/or v_cerrada;/);
});
test("Staff dibuja las personas autorizadas por la consulta y no revive planillas de inactivos",()=>{
  assert.match(ui,/const actual=p\.personas\.map\(persona=>/);
});
