import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync('public/stock/gestlok-molino.js','utf8');
const sql=readFileSync('supabase/migrations/20261109014000_molino_envio_sender_note.sql','utf8');
const legacy=readFileSync('supabase/migrations/20261107203000_molino_precios_envios_devoluciones.sql','utf8');

const extract=name=>{
 const match=js.match(new RegExp('const '+name+'=\\(\\)=>[^;]+;'));
 assert.ok(match, 'Función faltante '+name);
 return match[0];
};
function flags(roleName,branch){
 const parts=['canSend','canReturn','canAckSent','canAckReturned','canSenderObserve'].map(extract).join('\n');
 const ctx={role:()=>roleName,activeBranch:()=>branch};
 return vm.runInNewContext(parts+'\n({send:canSend(),senderNote:canSenderObserve(),ackSent:canAckSent(),ackReturn:canAckReturned()})',ctx);
}
test('San Isidro puede enviar y observar, pero no marcar OK en Productos enviados',()=>{
 for(const role of ['admin','dueno','san_isidro']){
  const a=flags(role,'san_isidro');
  assert.equal(a.send,true,role);
  assert.equal(a.senderNote,true,role);
  assert.equal(a.ackSent,false,role);
  assert.equal(a.ackReturn,true,role);
 }
});
test('Acassuso marca OK de envíos, pero no puede modificar notas del emisor ni confirmar devoluciones',()=>{
 for(const role of ['admin','dueno','acassuso']){
  const a=flags(role,'acassuso');
  assert.equal(a.send,false,role);
  assert.equal(a.senderNote,false,role);
  assert.equal(a.ackSent,true,role);
  assert.equal(a.ackReturn,false,role);
 }
 assert.equal(flags('acassuso','san_isidro').ackSent,false);
 assert.equal(flags('san_isidro','acassuso').ackSent,false); // Nunca aprobar fuera del rol y la sucursal.
});
test('San Isidro y Acassuso conservan observaciones independientes sin modificar el OK',()=>{
 assert.match(js,/data-mol-sender-save/);
 assert.match(js,/gestlok_molino_save_sender_note/);
 assert.match(js,/data-mol-ack-note/);
 assert.match(js,/gestlok_molino_save_observation/);
 assert.match(js,/gestlok_molino_acknowledge/);
 assert.match(js,/Observación de '\+\(isSent\?'San Isidro':'Acassuso'\)/);
 assert.match(sql,/note=coalesce\(p_note,''\)/);
 assert.doesNotMatch(sql,/set\s+acknowledged_at\s*=/i);
 assert.match(sql,/kind='envio' and acknowledged_at is null/);
 assert.match(sql,/v_scope not in \('admin','dueno','san_isidro'\)/);
 assert.match(legacy,/v_scope='acassuso' and kind='envio'/);
 assert.match(legacy,/v_scope='san_isidro' and kind='devolucion'/);
 assert.match(sql,/auth\.uid\(\) is null/);
 assert.match(sql,/revoke all on function public\.gestlok_molino_save_sender_note/);
 new vm.Script(js);
});
