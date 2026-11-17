import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('public/stock/mi-gusto-conteo.js');
const sql=read('supabase/migrations/20261116163200_gestlok_conteo_correcciones_cerradas_auditadas.sql');
const fonts=read('public/stock/gestlok-font-controls.js');
const layout=read('app/layout.tsx');
const employees=read('modules/empleados/app/layout.tsx');
const runtime=read('components/stock-runtime.tsx');

for(const local of ['munro','torcuato']){
 test('Conteo de '+local+' permite correcciones cerradas pero mantiene aislamiento, auditoría y protección de concurrencia',()=>{
  const name='gestlok_'+local+'_conteo';
  const schema=name+'_private';
  const block=sql.split('create table if not exists '+schema+'.closed_corrections(')[1];
  assert.ok(block,'tabla auditada del local');
  assert.match(sql,new RegExp('create or replace function public\\.'+name+'_correct_closed\\('));
  assert.match(sql,new RegExp('perform '+schema+'\\.require_access\\(true,false\\)'));
  assert.match(sql,new RegExp('if not found or r.status<>\\x27finalizado\\x27'));
  assert.match(sql,new RegExp('insert into '+schema+'\\.closed_corrections\\('));
  assert.match(sql,/if old_value is distinct from coalesce\(p_expected,'null'::jsonb\)/);
  assert.match(sql,/length\(trim\(p_reason\)\) not between 8 and 300/);
  assert.match(sql,new RegExp('alter table '+schema+'\\.closed_corrections enable row level security'));
  assert.match(sql,new RegExp('revoke all on '+schema+'\\.closed_corrections from public, anon, authenticated'));
  assert.match(sql,new RegExp('grant execute on function public\\.'+name+'_correct_closed'));
  assert.match(sql,new RegExp('create or replace function public\\.'+name+'_correction_history'));
  assert.match(sql,/where day=p_day and shift=p_shift and status='finalizado'/);
  assert.doesNotMatch(sql,/set status='borrador'|set finished_at=null|delete from .*shifts/i);
 });
}
test('El historial ofrece editar cantidad, decomiso, responsable y extras con motivo',()=>{
 assert.match(js,/function historyCorrectionPanel\(rec\)/);
 assert.match(js,/Editar turno cerrado/);
 assert.match(js,/Guardar corrección auditada/);
 assert.match(js,/Motivo obligatorio de la corrección/);
 assert.match(js,/gestlok_munro_conteo_correct_closed/);
 assert.match(js,/gestlok_munro_conteo_correction_history/);
 assert.match(js,/p_expected:expected,p_reason:reason/);
 assert.match(js,/if\(!response\?\.ok\)throw Error/);
 assert.match(js,/if\(!fresh\|\|fresh.status!=='finalizado'\)/);
 assert.match(js,/historyPreviewUrl=historyA4Image\(fresh\)/);
 assert.match(js,/historyCorrectionsLoaded=true/);
});
test('El control global de letra se retiró de todas las pantallas',()=>{
 assert.doesNotMatch(layout,/gestlok-font-controls/);
 assert.doesNotMatch(employees,/gestlok-font-controls/);
 assert.doesNotMatch(fonts,/MutationObserver|data-font-global|setScreenPercent/);
 assert.match(fonts,/control global de escalado retirado/);
 assert.match(runtime,/mi-gusto-conteo\.js\?rev=turno-visible-20261117/);
});
test('Los módulos JS no contienen errores de sintaxis',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotThrow(()=>new vm.Script(fonts));
});
