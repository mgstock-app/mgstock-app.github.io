import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261123023000_mi_gusto_duenos_ver_turnos_abiertos.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/stock/mi-gusto-conteo.js',import.meta.url),'utf8');

test('dueños ven el estado en curso y finalizado en los dos RPC mensuales de sus locales',()=>{
  for(const local of ['munro','torcuato']){
    const fn='public.gestlok_'+local+'_conteo_history';
    const part=sql.split('CREATE OR REPLACE FUNCTION '+fn+'(p_month date)')[1]?.split('CREATE OR REPLACE FUNCTION')[0];
    assert.ok(part,'Falta RPC historial de '+local);
    assert.match(part,new RegExp('gestlok_'+local+'_conteo_private\\.require_access\\(false,false\\)'));
    assert.match(part,new RegExp('from gestlok_'+local+'_conteo_private\\.shifts s'));
    assert.doesNotMatch(part,/mi_rol\(\)\s*<>\s*'dueno'|s\.status='finalizado'/);
  }
  assert.match(ui,/\['borrador','finalizado'\]\.includes\(r\.status\)/);
  assert.match(ui,/Turno abierto/);
  assert.match(ui,/data-gcm-history-retry/);
});

test('consulta diaria disponible para dueña, pero ninguna función de escritura cambia',()=>{
  for(const local of ['munro','torcuato']){
    const fn='public.gestlok_'+local+'_conteo_state';
    const part=sql.split('CREATE OR REPLACE FUNCTION '+fn+'(p_day date DEFAULT NULL::date)')[1]?.split('CREATE OR REPLACE FUNCTION')[0];
    assert.ok(part,'Falta RPC lectura del día de '+local);
    assert.match(part,/\x27counts\x27,coalesce\(/);
    assert.doesNotMatch(part,/case when public\.mi_rol\(\)='dueno' then '\[\]'::jsonb/);
    assert.match(part,new RegExp('gestlok_'+local+'_conteo_private\\.require_access\\(false,false\\)'));
    assert.match(sql,new RegExp('revoke all on function public\\.gestlok_'+local+'_conteo_history\\(date\\) from public, anon'));
    assert.match(sql,new RegExp('grant execute on function public\\.gestlok_'+local+'_conteo_state\\(date\\) to authenticated'));
  }
  assert.doesNotMatch(sql,/\b(insert into|update\s+gestlok_|delete from|alter policy|drop function|drop table)\b/i);
  assert.doesNotMatch(ui,/ownerHistoryOnly\(\)\|\|r\.status==='finalizado'/);
  assert.match(ui,/const editable=\(\)=>allowed\(\)&&!ownerHistoryOnly\(\)/);
});
