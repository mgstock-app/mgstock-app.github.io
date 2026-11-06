import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('supabase/functions/mi-gusto-whatsapp/index.ts');
const sql=read('supabase/migrations/20261106220000_mi_gusto_whatsapp_bot.sql');
const ui=read('public/stock/mi-gusto-pedidos-clientes.js');

test('compila el controlador WhatsApp y la pantalla de carta',()=>{
 const out=ts.transpileModule(source,{fileName:'index.ts',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 assert.deepEqual((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[]);
 assert.ok(out.outputText.includes('crypto.subtle.verify'));
 new vm.Script(ui);
});

test('dos Phone Number ID únicos, sin compartir sesión ni pedidos',()=>{
 assert.match(source,/MG_WA_PHONE_ID_MUNRO/);
 assert.match(source,/MG_WA_PHONE_ID_TORCUATO/);
 assert.match(source,/c.ids.munro!==c.ids.torcuato/);
 assert.match(sql,/primary key\(local,sender\)/);
 assert.match(sql,/primary key\(local,message_id\)/);
 assert.match(sql,/where id=v_id and local=p_local and active=true/);
 assert.match(sql,/external_message_id/);
 assert.match(sql,/where local=p_local and message_id=p_message_id/);
});

test('fallo seguro sin credenciales, firma real Meta y acceso privado a RPC',()=>{
 assert.match(source,/MG_WA_ENABLED/);
 assert.match(source,/if\(!ready\(c\)\)return json\(503/);
 assert.match(source,/x-hub-signature-256/);
 assert.match(source,/crypto.subtle.verify\("HMAC"/);
 assert.match(source,/MG_WA_TOKEN_MUNRO/);
 assert.match(source,/MG_WA_TOKEN_TORCUATO/);
 assert.match(sql,/grant execute on function public.gestlok_mg_whatsapp_turn/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/grant execute on function public.gestlok_mg_whatsapp_turn[^;]+to authenticated/s);
 assert.match(read('supabase/config.toml'),/\[functions.mi-gusto-whatsapp\]\nverify_jwt = false/);
});

test('sin precios inventados ni pagos, sin tocar módulos de Mi Gusto',()=>{
 assert.match(sql,/create table if not exists gestlok_mg_orders_private.menu_items/);
 assert.doesNotMatch(sql,/insert into gestlok_mg_orders_private.menu_items\(/i);
 assert.match(sql,/payment_method/);
 assert.match(sql,/'efectivo'/);
 assert.doesNotMatch(sql,/update\s+gestlok_mg_online_private|update\s+public\.stock|update\s+gestlok_caja_private/i);
 assert.match(ui,/gestlok_mg_orders_catalog_save/);
 assert.match(ui,/gestlok_mg_orders_catalog_disable/);
 assert.match(ui,/Carta y precios para WhatsApp/);
});
