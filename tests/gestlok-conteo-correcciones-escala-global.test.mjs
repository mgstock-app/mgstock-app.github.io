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
test('El historial ofrece corregir total del producto, decomiso, responsable y extras sin motivo',()=>{
 assert.match(js,/function historyCorrectionPanel\(rec\)/);
 assert.match(js,/Editar turno cerrado/);
 assert.match(js,/Guardar corrección auditada/);
 assert.doesNotMatch(js,/Motivo obligatorio de la corrección|gcm-history-fix-reason/);
 assert.match(js,/\['total','Cantidad total del producto'\]/);
 assert.doesNotMatch(js,/\['cell','Cantidad por vencimiento'\]/);
 assert.match(js,/gestlok_munro_conteo_correct_closed/);
 assert.match(js,/gestlok_munro_conteo_correction_history/);
 assert.match(js,/p_expected:expected,p_reason:null/);
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
 assert.match(runtime,/mi-gusto-conteo\.js\?rev=[\w-]+/);
});
test('Los módulos JS no contienen errores de sintaxis',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotThrow(()=>new vm.Script(fonts));
});

const fix=read('supabase/migrations/20261123033000_mi_gusto_conteo_correccion_total_sin_motivo.sql');
for(const local of ['munro','torcuato']){
 test('Conteo de '+local+': corrección por total, motivo opcional y sin choque de alias r',()=>{
  const schema='gestlok_'+local+'_conteo_private';
  assert.match(fix,new RegExp('alter table '+schema+'\\.closed_corrections alter column reason drop not null'));
  assert.match(fix,new RegExp('create or replace function public\\.gestlok_'+local+'_conteo_correct_closed\\(','i'));
  assert.match(fix,new RegExp('create or replace function public\\.gestlok_'+local+'_conteo_sin_stock\\(','i'));
  assert.match(fix,/if p_kind='total' then/);
  assert.match(fix,/'total_corregido',true/);
  assert.match(fix,/El total no puede ser menor que el decomiso registrado/);
  assert.match(fix,/if not found or r.status<>'finalizado'/);
  assert.match(fix,/where day=p_day and shift=p_shift and status='finalizado'/);
 });
}
test('La corrección no vuelve a usar el alias r dentro de funciones con la variable r',()=>{
 assert.doesNotMatch(fix,/pack_rate_snapshots r\b/);
 assert.doesNotMatch(fix,/not between 8 and 300/);
 assert.doesNotMatch(fix,/set status='borrador'|set finished_at=null|delete from .*shifts/i);
});
