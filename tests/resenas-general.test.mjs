import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fileAudience} from '../scripts/pwa-release-scope.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ui=read('public/stock/gestlok-resenas-general.js');
const sql=read('supabase/migrations/20261116150000_gestlok_resenas_general.sql');
const MI_GUSTO='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
function load(){
 const root={document:{addEventListener:()=>{},querySelector:()=>null,body:{classList:{add(){},remove(){}}}},window:{},navigator:{onLine:true},Date,Intl,encodeURIComponent};
 vm.runInNewContext(ui,root);
 return root.window.GestLokResenasGeneral;
}
test('Reseñas general: sin habilitación del servidor no muestra nada',async()=>{
 const m=load();
 assert.ok(m);
 assert.equal(m.allowed(),false);
 assert.equal(m.homeTile(),'');
 await m.refresh(null);
 assert.equal(m.homeTile(),'');
});
test('Reseñas general: teléfono, búsqueda y mensaje de WhatsApp',()=>{
 const {phone,message,filter,MENSAJE}=load()._t;
 assert.equal(phone('+54 9 11 4444-5555'),'1144445555');
 assert.equal(phone('011 4444 5555'),'1144445555');
 assert.equal(phone('0054 9 351 555 1234'),'3515551234');
 const r={customer_name:'Ana Pérez',phone:'1144445555',code:'ABC234',discount:15,valid_until:'2026-12-05'};
 assert.equal(message('',r,'Centro'),'Hola Ana Pérez: gracias por tu visita a Centro. Tenés 15% de descuento con el código ABC234, válido hasta el 05/12/2026.');
 assert.equal(message('{codigo} · {descuento}% · {vence} · {desconocido}',r,'Centro'),'ABC234 · 15% · 05/12/2026 · {desconocido}');
 assert.match(MENSAJE,/\{codigo\}/);
 assert.equal(filter([r],'abc2').length,1);
 assert.equal(filter([r],'4444').length,1);
 assert.equal(filter([r],'pérez').length,1);
 assert.equal(filter([r],'zzz').length,0);
});
test('Reseñas general: aislada de Mi Gusto en la pantalla y en el servidor',()=>{
 assert.doesNotMatch(ui,/gestlok_resenas_(?!gen_)[a-z]/,'no llama a las funciones de Mi Gusto');
 assert.doesNotMatch(ui,/@gmail\.com|munro|torcuato/i);
 for(const fn of ['scope','list','create','redeem','update','settings_save'])assert.match(ui,new RegExp('gestlok_resenas_gen_'+fn));
 assert.match(ui,/scope\.tenant_id===host\.S\?\.me\?\.tenant_id/);
 assert.match(sql,new RegExp("check\\(tenant_id<>'"+MI_GUSTO+"'::uuid\\)"));
 assert.match(sql,/gestlok_tenancy\.current_tenant_id\(\)/);
 assert.match(sql,/public\.puede_editar_local\(p_local\)/);
 assert.doesNotMatch(sql,/gestlok_resenas_private\.(?!\)|coupons\) y)[a-z_]+\(/,'no usa funciones de las Reseñas de Mi Gusto');
 assert.doesNotMatch(sql,/\b(drop|delete|truncate)\b/i,'solo agrega');
 assert.match(sql,/revoke all on all tables in schema gestlok_resenas_gen_private from public,anon,authenticated/);
 assert.match(sql,/revoke all on all functions in schema gestlok_resenas_gen_private from public,anon,authenticated/);
});
test('Reseñas general: publicar cambios suyos no avisa a las empresas actuales',()=>{
 assert.deepEqual(fileAudience('public/stock/gestlok-resenas-general.js'),[]);
 assert.deepEqual(fileAudience('app/gestlok-resenas-general.css'),[]);
 assert.deepEqual(fileAudience('public/stock/mi-gusto-resenas.js'),[MI_GUSTO]);
});
test('Reseñas general: se carga después del inicio del dueño y aparece en dueño y gerente',()=>{
 const runtime=read('components/stock-runtime.tsx'),areas=read('public/stock/gestlok-owner-areas.js');
 assert.match(runtime,/\/stock\/gestlok-resenas-general\.js\?rev=/);
 assert.match(read('app/layout.tsx'),/gestlok-resenas-general\.css/);
 assert.equal(areas.match(/GestLokResenasGeneral\?\.homeTile\?\.\(\)/g).length,2);
 assert.match(areas,/GestLokResenasGeneral\?\.refresh\?\.\(api\)/);
});
