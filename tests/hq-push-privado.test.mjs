import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Alex: notificaciones opt-in privadas y cola de un solo informe',()=>{
const s=read('supabase/migrations/20261125231000_gestlok_hq_push_privado.sql');
assert.match(s,/require_creator\(\)/);assert.match(s,/d.creator_id=new.creator_id/);assert.match(s,/t.agent='lider'/);assert.match(s,/unique\(run_id,endpoint\)/);assert.match(s,/for update of j skip locked/);assert.match(s,/u.email_confirmed_at is not null/);assert.match(s,/grant execute on function public.gestlok_hq_push_claim\(\) to service_role/);assert.match(s,/attempts<3/);assert.match(s,/enable row level security/);
const e=read('supabase/functions/gestlok-push/index.ts');
assert.match(e,/Tenés un informe nuevo para revisar en tu oficina/);assert.match(e,/endpointValid\(j.endpoint\)/);assert.match(e,/gestlok_hq_push_ack/);
const ui=read('public/stock/gestlok-creator-home.js');
assert.match(ui,/Notification.requestPermission\(\)/);assert.match(ui,/GestLokHQPushLogout/);assert.match(ui,/data-ch-hq-push/);
assert.match(read('public/stock/gestlok-push.js'),/GestLokHQPushLogout/);
});
