import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("modules/empleados/components/schedules/MunroWeeklySchedule.tsx");
const css=read("modules/empleados/components/schedules/munro-weekly-matrix.css");

test("Semana abierta editable automáticamente, sin Modificar, Listo ni Guardar",()=>{
 assert.match(ui,/const editarPersona=\(id:number\)=>puedeEditar&&\(!semanaCerrada\|\|\(editando&&personaEnEdicion===id\)\)/);
 assert.match(ui,/if\(!puedeEditar\|\|!semanaCerrada\)return null;/);
 assert.doesNotMatch(ui,/Guardar ahora|<Save size/); // 'Listo' permanece únicamente en historial finalizado.
 assert.match(ui,/if\(!editarPersona\(id\)\)return;/);
 assert.match(ui,/if\(!puedeEditar\|\|\(semanaCerrada&&!editando\)\|\|guardadoEnCurso\.current\)return;/);
 assert.match(ui,/void guardar\(\);/);
});
test("Auto guardado confirma sin modificar el diseño ni perder el foco",()=>{
 assert.match(ui,/mhs-guardado-flotante/);
 assert.match(ui,/Guardando…/);
 assert.match(ui,/Guardado automáticamente\./);
 assert.match(css,/\.mhs-guardado-flotante\{[\s\S]*?position:fixed/);
 assert.match(ui,/document\.activeElement\?\.closest\(/);
 assert.match(ui,/revisionLocal\.current!==revisionAnterior/);
 assert.match(ui,/guardadoEnCurso\.current\|\|campoEnUso\(\)/);
 assert.match(ui,/JSON\.stringify\(prev\)===JSON\.stringify\(nuevas\)\?prev:nuevas/);
});
test("Semana finalizada conserva botón Modificar y correcciones con auditoría",()=>{
 assert.match(ui,/const controlesPersona=/);
 assert.match(ui,/onClick=\{\(\)=>empezarEdicionPersona\(f\.id\)\}/);
 assert.match(ui,/rm_munro_horarios_corregir_cierre/);
 assert.match(ui,/p_motivo:"Corrección de carga en semana finalizada"/);
});
