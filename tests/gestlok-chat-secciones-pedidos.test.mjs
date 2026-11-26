import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync('public/chat/panel/panel.js','utf8');
const css=readFileSync('public/chat/panel/panel.css','utf8');
const sql=readFileSync('supabase/migrations/20261126233000_gestlok_chat_asistencia_catalogo.sql','utf8');
test('la Central agrupa las herramientas existentes y conserva los avisos',()=>{
  assert.match(js,/id:'pedidos', titulo:'Pedidos'/);
  assert.match(js,/id:'ajustes', titulo:'Configuración'/);
  assert.match(js,/id:'soporte', titulo:'Reclamos'/);
  for(const item of ['pedidos','whatsapp','reporte','stock','clientes','ajustes','carta','mensajes','excluidos','soporte'])assert.ok(js.includes("['"+item+"',"));
  assert.match(js,/id:'globo'/);
  assert.match(js,/id:'globo-soporte'/);
  assert.match(js,/ADMIN_CONFIG\) return \['ajustes','carta','mensajes'\]\.includes\(pestana\)/);
});
test('cada estado tiene un color diferente, etiqueta y filtro',()=>{
  const colores=new Set();
  for(const x of ['pendiente','confirmado','terminado','rechazado','cancelado']){
    const color=css.match(new RegExp('\\.tarjeta\\.'+x+'[^{}]*\\{[^}]*--estado-fondo:(#[a-f0-9]+)'));
    assert.ok(color,x);colores.add(color[1]);
    assert.ok(js.includes("['"+x+"',"));
  }
  assert.equal(colores.size,5);
  assert.match(js,/ESTADOS\[p.estado\]/);
  assert.match(js,/Confirmar y pasar a preparación/);
  assert.match(js,/rpc\('panel_decidir'/);
});
test('asistencia administrativa solo añade acceso al catálogo con guardia de configuración',()=>{
  assert.equal([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.gestlok_chat_panel_/g)].length,3);
  assert.equal([...sql.matchAll(/gestlok_chat_private\.nivel_config\(p_sucursal,/g)].length,3);
  assert.doesNotMatch(sql,/panel_decidir|panel_pedidos|panel_whatsapp|grant execute|disable row level security/i);
  assert.match(sql,/Categoría de otra sucursal/);
  assert.match(sql,/where id = p_id and sucursal_id = s.id/);
  assert.match(sql,/gestlok_chat_private\.auditar/);
});
