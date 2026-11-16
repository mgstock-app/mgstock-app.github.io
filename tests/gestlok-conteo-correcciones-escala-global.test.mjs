import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
test('Controles A−/A+ de 50 a 180 % por usuario, local, vista y tarjeta',()=>{
 assert.match(fonts,/const MIN=50,MAX=180,STEP=10/);
 assert.match(fonts,/GestLokNavContext/);
 assert.match(fonts,/nav\?\.uid/);
 assert.match(fonts,/nav\?\.tenant/);
 assert.match(fonts,/nav\?\.local/);
 assert.match(fonts,/readCard\(key,fallback\)/);
 assert.match(fonts,/data-font-global="-1"/);
 assert.match(fonts,/data-font-global="1"/);
 assert.match(fonts,/data-font-card="-1"/);
 assert.match(fonts,/data-font-card="1"/);
 assert.match(fonts,/localStorage\.setItem/);
 assert.match(fonts,/originals=new WeakMap/);
 assert.match(fonts,/getComputedStyle\(el\)\.fontSize/);
 assert.match(layout,/gestlok-font-controls\.js\?rev=texto-50-180-20261116/);
 assert.match(employees,/gestlok-font-controls\.js\?rev=texto-50-180-20261116/);
 assert.match(runtime,/mi-gusto-historial-editable-auditado-20261116/);
 assert.doesNotMatch(fonts,/\.zoom\s*=|document\.documentElement\.style\.zoom/);
});
