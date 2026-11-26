import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261126023500_mi_gusto_stock_local_vaciar_al_cerrar.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/stock/app.js',import.meta.url),'utf8');

test('reinicio sólo por cierre nuevo, restringido a Stock Local de Mi Gusto y su hoja',()=>{
  assert.match(sql,/after insert on public\.docs/i);
  assert.match(sql,/new\.col not in \('munro\/conteos','torcuato\/conteos'\)/);
  assert.match(sql,/cb0dc04a-9a13-434f-a3d0-47f1d8f39670/);
  assert.match(sql,/lower\(btrim\(d\.data->>'nombre'\)\) = 'stock local'/);
  assert.match(sql,/d\.tenant_id = new\.tenant_id and d\.col = v_col and d\.data->>'hoja' = v_hoja/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/revoke all on function gestlok_platform\.stock_local_vaciar_al_cerrar\(\) from public, anon, authenticated/);
  assert.doesNotMatch(sql,/delete from|truncate|drop table/i);
});

test('la copia se valida y bloquea antes de limpiar, conservando nulos y cero distintos',()=>{
  const lock=sql.indexOf('for update;'),check=sql.indexOf('v_n <> jsonb_array_length'),clear=sql.indexOf('update public.docs d');
  assert.ok(lock>=0 && check>lock && clear>check);
  assert.match(sql,/f->>'pid' = d\.id/);
  assert.match(sql,/coalesce\(f->'local','null'::jsonb\) = coalesce\(d\.data->'local','null'::jsonb\)/);
  assert.match(sql,/coalesce\(f->'fabrica','null'::jsonb\) = coalesce\(d\.data->'fabrica','null'::jsonb\)/);
  assert.match(sql,/'local',null,'fabrica',null,'sinStock',false/);
  assert.match(sql,/v_actualizadas <> v_n/);
  assert.match(sql,/raise exception 'El turno ya está cerrado; usá Modificar turno en Historial'/);
});

test('la planilla nueva no representa ausencia de carga como cero ni modifica el historial al dibujar',()=>{
  assert.match(app,/const fTotalVisible = it => stockLocalEnVista\(\) && fVal\(it,'l'\)==null && fVal\(it,'f'\)==null \? '—'/);
  assert.equal((app.match(/placeholder="\$\{stockLocalEnVista\(\)\?'—':'0'\}"/g)||[]).length,2);
  assert.match(app,/Después de guardar el historial, las cantidades de Local e Ingreso quedarán vacías/);
});
