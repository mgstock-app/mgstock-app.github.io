import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('WhatsApp opcional: solicitudes privadas por sucursal, nunca conexión ficticia',()=>{
 const s=read('supabase/migrations/20261126020500_gestlok_chat_whatsapp_solicitudes.sql');
 const p=read('public/chat/panel/panel.js');
 assert.match(s,/sucursal_id uuid primary key/);assert.match(s,/exigir\(p_sucursal,'configurar'\)/);
 assert.match(s,/exigir\(p_sucursal,'ver'\)/);assert.match(s,/enable row level security/);
 assert.match(s,/'conectado',false,'respuestas_automaticas',false/);assert.match(s,/where sucursal_id=s.id/);
 assert.match(p,/editable&&!DEMO/);assert.match(p,/p_sucursal:canalId/);assert.match(p,/No vinculado/);
 assert.match(p,/S.suc\?\.id===canalId/);
});