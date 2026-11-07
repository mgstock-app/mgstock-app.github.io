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
 assert.doesNotMatch(sql,/insert into gestlok_mg_orders_private.menu_items\s*\([^)]*\)\s*values\s*\(\s*'(munro|torcuato)'/si);
 assert.match(sql,/payment_method/);
 assert.match(sql,/'efectivo'/);
 assert.doesNotMatch(sql,/update\s+gestlok_mg_online_private|update\s+public\.stock|update\s+gestlok_caja_private/i);
 assert.match(ui,/gestlok_mg_orders_catalog_save/);
 assert.match(ui,/gestlok_mg_orders_catalog_disable/);
 assert.match(ui,/Carta y precios para WhatsApp/);
});

test('habilitación por etapas: Munro funciona solo y Torcuato continúa aislado',()=>{
 const start=source.indexOf('const config = () => ({');
 const end=source.indexOf('function json(',start);
 assert.ok(start>=0&&end>start,'código de configuración verificado');
 const segment=ts.transpileModule(source.slice(start,end),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
 }).outputText;
 const base={
  MG_WA_ENABLED:'true',
  MG_WA_APP_SECRET:'firma-meta-pruebas',
  MG_WA_VERIFY_TOKEN:'verificacion-meta-pruebas',
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'local-test-only',
  MG_WA_PHONE_ID_MUNRO:'111111111111111',
  MG_WA_TOKEN_MUNRO:'test-token-munro'
 };
 const evaluate=overrides=>{
  const vars={...base,...overrides};
  const ctx={env:k=>vars[k]||''};
  const {config,ready,configured}=vm.runInNewContext(segment+';({config,ready,configured})',ctx);
  const c=config();
  return {ready:ready(c),munro:configured(c,'munro'),torcuato:configured(c,'torcuato')};
 };
 assert.equal(evaluate({}).ready,true,'Munro se configura sin activar Torcuato');
 assert.equal(evaluate({}).torcuato,false);
 assert.equal(evaluate({MG_WA_ENABLED:'false'}).ready,false,'bot desactivado por defecto');
 assert.equal(evaluate({MG_WA_TOKEN_MUNRO:''}).ready,false,'falta token');
 assert.equal(evaluate({MG_WA_PHONE_ID_MUNRO:''}).ready,false,'falta ID');
 assert.equal(evaluate({MG_WA_APP_SECRET:''}).ready,false,'falta firma del webhook');
 assert.equal(evaluate({MG_WA_PHONE_ID_TORCUATO:'222222222222222',MG_WA_TOKEN_TORCUATO:'test-token-torcuato'}).ready,true,'ambas sucursales son independientes');
 assert.equal(evaluate({MG_WA_PHONE_ID_TORCUATO:'111111111111111',MG_WA_TOKEN_TORCUATO:'test-token-torcuato'}).ready,false,'un Phone Number ID nunca se comparte');
 assert.equal(evaluate({MG_WA_PHONE_ID_MUNRO:'',MG_WA_TOKEN_MUNRO:'',MG_WA_PHONE_ID_TORCUATO:'222222222222222',MG_WA_TOKEN_TORCUATO:'test-token-torcuato'}).ready,true,'Torcuato también puede configurarse por separado');
 assert.match(source,/configured\(c,k\)&&c\.ids\[k\]===phoneId/,'nunca aceptar eventos de una sucursal sin token autorizado');
});

test('Meta verifica el webhook antes de activar mensajes sin exponer datos',()=>{
 const get=source.indexOf('if(req.method==="GET"){');
 const ready=source.indexOf('if(!ready(c))return json(503');
 const post=source.indexOf('if(req.method!=="POST")');
 assert.ok(get>=0&&ready>get&&post>ready,'el bot no tiene que estar habilitado para verificar el webhook');
 assert.match(source,/if\(!c\.verify\)return json\(503/);
 assert.match(source,/token!==c.verify/);
 assert.match(source,/if\(!await signed\(req,c.secret,raw\)\)return json\(403/);
});
