import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Modo diseño de la Administradora General (09/11/2026): solo texto, por empresa, y
// escritura exclusiva de la creadora verificada. Sin datos reales.
const mod=readFileSync('public/stock/gestlok-design-mode.js','utf8');
const sql=readFileSync('supabase/migrations/20261109030000_gestlok_design_overrides.sql','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');

test('La tabla de diseño es aditiva y aislada por empresa', ()=>{
 assert.match(sql,/create table if not exists public\.gestlok_design_overrides/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public\.gestlok_design_overrides from anon/);
 assert.match(sql,/kind in \('text','hide','add'\)/);
 for(const p of ['read','insert','update','delete'])assert.match(sql,new RegExp('design_overrides_'+p));
 assert.match(sql,/tenant_id = \(select gestlok_tenancy\.current_tenant_id\(\)\)/);
 assert.match(sql,/gestlok_platform\.admins/);
 assert.doesNotMatch(sql,/\b(drop table|truncate|delete from)\b/i);
});

test('Solo la creadora ve el botón y los cambios nunca insertan HTML', ()=>{
 assert.match(mod,/creator===true/);
 assert.match(mod,/available&&isCreator\(\)/);
 assert.match(mod,/el\.textContent=o\.value/);
 assert.match(mod,/b\.textContent=o\.value/);
 assert.doesNotMatch(mod,/innerHTML\s*=\s*o\./);
 // Un cambio de texto se aplica solo si el texto original sigue igual (no pisa datos que cambian).
 assert.match(mod,/txt===norm\(o\.original\)/);
 // Mientras diseña, tocar la pantalla selecciona en vez de ejecutar acciones.
 assert.match(mod,/stopImmediatePropagation/);
});

test('El modo diseño se carga en toda la app (no en la demo de visitantes)', ()=>{
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-design-mode\.js\?rev=modo-diseno-20261109"\)/);
});
