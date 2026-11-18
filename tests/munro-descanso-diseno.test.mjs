import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("modules/empleados/components/schedules/MunroWeeklySchedule.tsx");
const css=read("modules/empleados/components/schedules/munro-weekly.css");
const polish=read("modules/empleados/components/schedules/munro-weekly-polish.css");
const matrix=read("modules/empleados/components/schedules/munro-weekly-matrix.css");

test("Staff Munro muestra un solo selector por día al editar, no 14 botones",()=>{
  assert.ok(ui.includes('<select aria-label={"Descanso · "+cabecera(f)+" · "+fechaCorta(dia)}'));
  assert.ok(ui.includes('<option value="off">OFF</option>'));
  assert.ok(ui.includes('<option value="medio_off">Medio OFF</option>'));
  assert.ok(ui.includes('value={d.descanso||""}'));
  assert.ok(ui.includes('mhs-descanso-valor'));
  assert.doesNotMatch(ui,/mhs-descanso-boton/);
});
test("No cambia los datos guardados ni permite marcar OFF sobre horarios existentes",()=>{
  assert.ok(ui.includes('if(nuevo===(actual.descanso||""))return;'));
  assert.ok(ui.includes('cambiarDia(f.id,dia,"descanso",nuevo)'));
  assert.ok(ui.includes('if(nuevo==="off"&&(hayMañana||hayTarde))'));
  assert.ok(ui.includes('if(nuevo==="medio_off"&&hayMañana&&hayTarde)'));
  assert.ok(ui.includes('if(nuevo&&actual.vacaciones_dia)'));
});
test("Las tres hojas de estilo no recrean dos columnas para OFF y Medio OFF",()=>{
  for(const [nombre,texto] of [["base",css],["polish",polish],["matrix",matrix]]){
    assert.doesNotMatch(texto,/mhs-descanso-boton/,nombre);
    assert.doesNotMatch(texto,/\.mhs-descansos\s*\{[^}]*grid-template-columns:repeat\(2/,nombre);
  }
  assert.match(matrix,/\.mhs-matriz-etiquetas\{[^}]*padding-top:36px/);
  assert.match(matrix,/\.mhs-tabla \.mhs-cuatro\{[^}]*padding-top:36px/);
});
