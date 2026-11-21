import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('recomprar crea nueva conversación sin cambiar el pedido existente',()=>{
 const js=read('public/chat/chat.js');
 assert.match(js,/function nuevaConversacion\(\)/);
 assert.match(js,/removeItem\('gestlok-chat:token:'/);
 assert.match(js,/\['terminado','rechazado'\]/);
 assert.match(js,/Hacer un nuevo pedido/);
 assert.match(js,/\['pendiente','confirmado'\]\.includes\(S\.pedido\.estado\)/);
});
test('push de clientes con consentimiento, scope propio y sin permisos automáticos',()=>{
 const html=read('public/chat/index.html');
 const push=read('public/chat/cliente-push.js');
 const sw=read('public/chat/sw.js');
 assert.match(html,/src="\/chat\/cliente-push\.js/);
 assert.match(html,/href="\/chat\/manifest\.webmanifest"/);
 assert.match(push,/Notification\.requestPermission\(\)/);
 assert.match(push,/scope:'\/chat\/'/);
 assert.match(push,/promos\.input\.disabled/);
 assert.match(push,/await endpoint\('subscribe'/);
 assert.match(sw,/showNotification\(/);
 assert.doesNotMatch(sw,/clientes?\.nombre|telefono|direccion/i);
});
test('la portada ingresa por login y conserva PWA del sitio',()=>{
 assert.match(read('app/page.tsx'),/location\.replace\('\/login\/'/);
 assert.match(read('app/login/page.tsx'),/<StockRuntime \/>/);
 assert.match(read('scripts/sw-template.js'),/'\/login\/'/);
 assert.match(read('public/stock/app.js'),/\.\.\/sw\.js/);
});
test('backend push no expone clientes ni mezcla suscripciones administrativas',()=>{
 const sql=read('supabase/migrations/20261121163000_gestlok_chat_cliente_webpush.sql');
 const edge=read('supabase/functions/gestlok-chat-push/index.ts');
 assert.match(sql,/gestlok_chat_cliente_push_devices/);
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/gestlok_chat_private\.exigir\(p_sucursal/);
 assert.match(sql,/gestlok_chat_push_public_config/);
 assert.match(edge,/validEndpoint/);
 assert.match(edge,/await checkCron/);
 assert.match(edge,/gestlok_chat_cliente_push_vincular/);
 assert.match(edge,/webpush\.sendNotification/);
});
