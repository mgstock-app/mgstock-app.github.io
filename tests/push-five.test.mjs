import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('public/stock/gestlok-push.js');
const app=read('public/stock/app.js');
const css=read('app/globals.css');
const sw=read('scripts/sw-template.js');
const edge=read('supabase/functions/gestlok-push/index.ts');
const sql=read('supabase/migrations/20261025_gestlok_push_five_categories.sql');
const keys=['order_ready','due_soon','due_today','urgent_chat','important_changes'];
test('Dueña tiene el interruptor general y los cinco individuales',()=>{
 assert.doesNotThrow(()=>new Script(client));
 assert.doesNotThrow(()=>new Script(app));
 assert.match(client,/data-gl-push-pref/);
 assert.match(client,/role="switch"/);
 assert.match(client,/aria-checked/);
 assert.match(client,/key!=='master'/);
 for(const k of ['master',...keys]){
  assert.match(client,new RegExp(k));
  assert.match(edge,new RegExp(k));
  assert.match(sql,new RegExp(k));
 }
 assert.match(css,/\.gl-push-switch\.on/);
 assert.match(client,/set-preference/);
 assert.match(edge,/\.upsert\(/);
 assert.match(edge,/admin\.auth\.getUser/);
 assert.match(edge,/mi_acceso/);
 assert.match(edge,/rol!=="dueno"/);
});
test('Solo Gerente puede marcar un mensaje como urgente; envío reintentable',()=>{
 assert.match(app,/miRol\(\)==='gerente'\?/);
 assert.match(app,/id="gl-chat-urgent-input"/);
 assert.match(app,/urgente:miRol\(\)==='gerente'/);
 assert.match(app,/urgente:payload\.urgente===true/);
 assert.match(sql,/typ='chat' and rol='gerente'/);
 assert.match(sql,/d\.data->>'urgente'='true'/);
 assert.match(sql,/typ='proveedores_historial' and rol='gerente'/);
 assert.match(sql,/tg_op='INSERT'/);
});
test('Vencimientos 08 Argentina, una vez por categoría y local/día',()=>{
 assert.match(sql,/America\/Argentina\/Buenos_Aires/);
 assert.match(sql,/today\+3/);
 assert.match(sql,/today::text/);
 assert.match(sql,/on conflict\(event_key\) do nothing/);
 assert.match(sql,/gestlok_push_queue_due/);
 assert.match(sql,/gestlok_push_capture_roles/);
 assert.match(sql,/interval '30 minutes'/);
 assert.match(sql,/abs\(new_n-old_n\)>=20/);
 assert.match(sql,/abs\(new_n-old_n\)\/old_n>=0\.30/);
 assert.match(edge,/\.eq\("tenant_id",evt\.tenant_id\)/);
 assert.match(edge,/!prefs\.master \|\| !prefs\[evt\.category as Flag\]/);
 assert.match(edge,/gestlok_push_deliveries/);
});
test('El push se entrega solo a cuenta autorizada y el clic navega en el local correcto',()=>{
 assert.match(edge,/verifyCron/);
 assert.match(edge,/getUserById/);
 assert.match(edge,/s\.data\?\.rol==="dueno"/);
 assert.match(edge,/webpush\.sendNotification/);
 assert.match(edge,/privateKey/);
 assert.match(edge,/endpointValid/);
 assert.match(sw,/gestlok-push-open/);
 assert.match(app,/localesMios\(\)\.some\(x=>x\.id===p\.local\)/);
 assert.match(app,/applyPushNavigation/);
});
