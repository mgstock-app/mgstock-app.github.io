import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('supabase/functions/mi-gusto-whatsapp/index.ts');
const sql=read('supabase/migrations/20261106220000_mi_gusto_whatsapp_bot.sql');
const sqlMunro=read('supabase/migrations/20261107020000_mi_gusto_whatsapp_munro_conexion.sql');
const ui=read('public/stock/mi-gusto-pedidos-clientes.js');
async function toJs(src){
 if(typeof nodeModule.stripTypeScriptTypes==='function'){process.removeAllListeners('warning');return nodeModule.stripTypeScriptTypes(src);}
 const ts=(await import('typescript')).default;
 return ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
}

test('compila el controlador WhatsApp y la pantalla de carta',async()=>{
 const out=await toJs(source);
 assert.ok(out.includes('crypto.subtle.verify'));
 new vm.Script(out.replace(/^import[^\n]+\n/m,''));
 new vm.Script(ui);
});

test('dos Phone Number ID únicos, sin compartir sesión ni pedidos',()=>{
 assert.match(source,/MG_WA_PHONE_ID_MUNRO/);
 assert.match(source,/MG_WA_PHONE_ID_TORCUATO/);
 assert.match(source,/c\.ids\.munro===c\.ids\.torcuato/);
 assert.match(sql,/primary key\(local,sender\)/);
 assert.match(sql,/primary key\(local,message_id\)/);
 assert.match(sqlMunro,/where id=v_id and local=p_local and active=true/);
 assert.match(sqlMunro,/external_message_id/);
 assert.match(sqlMunro,/phone_number_id text not null unique/);
 assert.match(sqlMunro,/Ese número ya pertenece a otra sucursal/);
});

test('fallo seguro: firma real de Meta, secretos fuera del navegador y RPC privadas',()=>{
 assert.match(source,/MG_WA_ENABLED/);
 assert.match(source,/if\(!cfg\.secret\)return json\(503/);
 assert.match(source,/x-hub-signature-256/);
 assert.match(source,/crypto\.subtle\.verify\("HMAC"/);
 assert.match(source,/if\(!await signed\(req,cfg\.secret,raw\)\)return json\(403/);
 assert.match(source,/MG_WA_TOKEN_MUNRO/);
 assert.match(source,/MG_WA_TOKEN_TORCUATO/);
 assert.match(sql,/to service_role/);
 for(const fn of ['gestlok_mg_whatsapp_turn','gestlok_mg_whatsapp_route','gestlok_mg_whatsapp_server_config','gestlok_mg_whatsapp_connection_save','gestlok_mg_whatsapp_webhook_verified']){
  const grant=sqlMunro.split('grant execute on function').slice(1).find(g=>g.includes('public.'+fn+'('));
  assert.ok(grant&&/to service_role/.test(grant),fn+' solo service_role');
  assert.doesNotMatch(grant,/to authenticated/,fn+' nunca authenticated');
 }
 assert.match(sqlMunro,/vault\.create_secret/);
 assert.match(sqlMunro,/vault\.decrypted_secrets/);
 assert.doesNotMatch(ui,/service_role|SERVICE_ROLE|app_secret_id|decrypted/);
 assert.match(read('supabase/config.toml'),/\[functions.mi-gusto-whatsapp\]\nverify_jwt = false/);
});

test('sin precios inventados ni pagos, sin tocar módulos de Mi Gusto',()=>{
 assert.match(sql,/create table if not exists gestlok_mg_orders_private.menu_items/);
 for(const s of [sql,sqlMunro]){
  assert.doesNotMatch(s,/insert into gestlok_mg_orders_private.menu_items\s*\([^)]*\)\s*values\s*\(\s*'(munro|torcuato)'/si);
  assert.doesNotMatch(s,/update\s+gestlok_mg_online_private|update\s+public\.stock|update\s+gestlok_caja_private|update\s+gestlok_scanner/i);
 }
 assert.match(sqlMunro,/'efectivo'/);
 assert.match(ui,/gestlok_mg_orders_catalog_save/);
 assert.match(ui,/gestlok_mg_orders_catalog_disable/);
 assert.match(ui,/Carta y precios para WhatsApp/);
});

test('habilitación por etapas: Munro funciona solo y Torcuato continúa aislado',async()=>{
 const start=source.indexOf('const config = () => ({');
 const end=source.indexOf('type ServerCfg',start);
 assert.ok(start>=0&&end>start,'código de configuración verificado');
 const segment=(await toJs(source.slice(start,end)));
 const base={
  MG_WA_ENABLED:'true',MG_WA_APP_SECRET:'firma-meta-pruebas',MG_WA_VERIFY_TOKEN:'verificacion-meta-pruebas',
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-test-only',
  MG_WA_PHONE_ID_MUNRO:'111111111111111',MG_WA_TOKEN_MUNRO:'test-token-munro'
 };
 const evaluate=overrides=>{
  const vars={...base,...overrides};
  const {config,configured,envRoutesValid}=vm.runInNewContext(segment+';({config,configured,envRoutesValid})',{env:k=>vars[k]||''});
  const c=config();
  return {valid:envRoutesValid(c),munro:configured(c,'munro'),torcuato:configured(c,'torcuato'),enabled:c.enabled};
 };
 assert.equal(evaluate({}).munro,true,'Munro se configura sin activar Torcuato');
 assert.equal(evaluate({}).torcuato,false);
 assert.equal(evaluate({MG_WA_ENABLED:'false'}).enabled,false,'bot desactivado por defecto');
 assert.equal(evaluate({MG_WA_TOKEN_MUNRO:''}).munro,false,'falta token');
 assert.equal(evaluate({MG_WA_PHONE_ID_MUNRO:''}).munro,false,'falta ID');
 assert.equal(evaluate({MG_WA_PHONE_ID_TORCUATO:'222222222222222',MG_WA_TOKEN_TORCUATO:'t'}).valid,true,'ambas sucursales son independientes');
 assert.equal(evaluate({MG_WA_PHONE_ID_TORCUATO:'111111111111111',MG_WA_TOKEN_TORCUATO:'t'}).valid,false,'un Phone Number ID nunca se comparte');
 assert.match(source,/configured\(c,k\)&&c\.ids\[k\]===phoneId/,'nunca aceptar eventos de una sucursal sin token autorizado');
 assert.match(sqlMunro,/if p_local<>'munro' then\s+raise exception 'Conexión habilitada solo para Munro'/);
});

test('Meta verifica el webhook antes de activar mensajes sin exponer datos',()=>{
 const get=source.indexOf('if(req.method==="GET"){');
 const secret=source.indexOf('if(!cfg.secret)return json(503');
 const post=source.indexOf('if(req.method!=="POST")');
 assert.ok(get>=0&&post>get&&secret>post,'el bot no tiene que estar habilitado para verificar el webhook');
 assert.match(source,/if\(!cfg\.verify\)return json\(503/);
 assert.match(source,/!sameText\(token,cfg\.verify\)/);
 assert.match(sqlMunro,/verify_token text not null default encode\(extensions\.gen_random_bytes/);
});

test('Munro: sin carga manual, número de pedido, observaciones y textos editables',()=>{
 assert.match(sqlMunro,/if p_local='munro' then\s+raise exception 'En Munro los pedidos ingresan solamente desde WhatsApp'/);
 assert.match(sqlMunro,/'MG-'\|\|lpad\(p_number::text,3,'0'\)/);
 assert.match(sqlMunro,/stage in \('start','catalog','quantity','cart','name','notes','review','human'\)/);
 assert.match(sqlMunro,/¡Bienvenido a Mi Gusto! 🥟/);
 assert.match(sqlMunro,/'Hacer un pedido','Ver carta y precios','Hablar con el local'/);
 assert.match(sqlMunro,/return p_local='munro'\s+and coalesce\(gestlok_mg_orders_private\.allowed\(p_local\),false\)\s+and public\.mi_rol\(\) in \('dueno','creadora'\)/);
 assert.doesNotMatch(sqlMunro,/drop table|delete from gestlok_mg_orders_private\.orders|truncate/i,'no borra pedidos históricos');
});
