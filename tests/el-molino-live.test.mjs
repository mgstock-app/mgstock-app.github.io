import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sql=readFileSync('supabase/migrations/20261107203000_molino_precios_envios_devoluciones.sql','utf8');
const js=readFileSync('public/stock/gestlok-molino.js','utf8');
const css=readFileSync('public/stock/gestlok-molino.css','utf8');
const owner=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';

function loadModule(tenant=TENANT,role='creadora'){
 const listeners={};
 const window={};
 const document={
  addEventListener(n,fn){listeners[n]=fn;},
  getElementById(){return null;},
  createElement(){return {setAttribute(){}};},
  head:{appendChild(){}},
  querySelector(){return null;}
 };
 vm.runInNewContext(js,{window,document,Intl,Date,setTimeout:()=>0,clearTimeout,clearInterval,setInterval:()=>0,Number,String,Array});
 const api=window.GestLokMolino;
 api.attach({S:{me:{tenant_id:tenant}},role:()=>role});
 return {api,listeners};
}

test('El tablero tiene las cuatro pestañas y sólo aparece en El Molino',()=>{
 const a=loadModule();
 const html=a.api.homeTile();
 for(const tab of ['precios','envios','devoluciones','historial'])assert.match(html,new RegExp('data-mol-open="'+tab+'"'));
 assert.match(html,/Vínculo entre sucursales/);
 assert.equal(loadModule('cb0dc04a-9a13-434f-a3d0-47f1d8f39670').api.homeTile(),'');
 assert.equal(loadModule(TENANT,'lectura').api.homeTile(),'');
 new vm.Script(js);
});

test('Los OK son individuales, verdes y no confirman toda la lista',()=>{
 assert.match(js,/data-mol-ack="\x27\+escapeHTML\(m\.id\)/);
 assert.match(js,/acknowledged_at/);
 assert.match(js,/gl-molino-item\x27\+\(ok\?\x27 is-confirmed/);
 assert.match(css,/\.gl-molino-item\.is-confirmed/);
 assert.match(css,/\.gl-molino-status\.ok/);
 assert.match(sql,/where id=p_id and day=v_day and acknowledged_at is null/);
 assert.match(sql,/acknowledged_by=auth\.uid\(\)/);
 assert.doesNotMatch(sql,/update public\.gestlok_molino_movements\s+set acknowledged_at=now\(\)[\s\S]{0,200}where day=v_day(?! and)/i);
});

test('Las modificaciones ajenas quedan bloqueadas por RPC, no solo la interfaz',()=>{
 assert.match(sql,/gestlok_molino_scope\(\)/);
 assert.match(sql,/gestlok_tenancy\.verified_role_context_email\(\)/);
 assert.match(sql,/gestlok_tenancy\.current_tenant_id\(\)/);
 assert.match(sql,/v_scope not in \('admin','dueno','san_isidro'\)/);
 assert.match(sql,/v_scope='acassuso' and p_kind='devolucion'/);
 assert.match(sql,/v_scope='acassuso' and kind='envio'/);
 assert.match(sql,/v_scope='san_isidro' and kind='devolucion'/);
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/revoke all on public\.gestlok_molino_prices/);
 assert.match(sql,/grant select on public\.gestlok_molino_prices/);
 assert.match(sql,/grant execute on function public\.gestlok_molino_scope\(\) to authenticated/);
 assert.doesNotMatch(sql,/grant (?:update|insert|delete|all) on public\.gestlok_molino_prices to authenticated/);
});

test('El historial diario es inmutable, guarda observaciones y precios; cierre 23:59 AR',()=>{
 assert.match(sql,/America\/Argentina\/Buenos_Aires/);
 assert.match(sql,/to_char\(now\(\) at time zone 'America\/Argentina\/Buenos_Aires','HH24:MI'\)>='23:59'/);
 assert.match(sql,/cron\.schedule\('molino-cierre-2359-ar','59 2 \* \* \*'/);
 assert.match(sql,/cron\.schedule\('molino-cierre-respaldo'/);
 assert.match(sql,/on conflict\(day\) do nothing/);
 assert.match(sql,/acknowledgement_note/);
 assert.match(sql,/'cambios_precios'/);
 assert.match(sql,/'envios'/);
 assert.match(sql,/'devoluciones'/);
 assert.match(runtime,/await load\("\/stock\/gestlok-molino\.js\?rev=molino-live-20261107"\)/);
 assert.match(owner,/GestLokMolino\?\.homeTile\?\.\(\)/);
 assert.match(owner,/GestLokMolino\?\.attach\?\.\(ctx\)/);
});

test('Sincronización en vivo con Realtime y refresco seguro, sin interrumpir formularios',()=>{
 assert.match(js,/\.on\('postgres_changes',\{event:'\*',schema:'public',table:'gestlok_molino_prices'/);
 assert.match(js,/gestlok_molino_movements/);
 assert.match(js,/gestlok_molino_daily_archive/);
 assert.match(js,/setInterval\(\(\)=>\{if\(!opened\)return;void reload\(true\);\},12000\)/);
 assert.match(js,/form:focus-within/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(sql,/alter publication supabase_realtime add table/);
});


test('Acassuso puede guardar observación del envío sin marcar OK',()=>{
 assert.match(sql,/function public\.gestlok_molino_save_observation/);
 assert.match(sql,/v_scope not in \('admin','dueno','acassuso'\)/);
 assert.match(sql,/and kind='envio' and acknowledged_at is null/);
 assert.match(js,/data-mol-note/);
 assert.match(js,/gestlok_molino_save_observation/);
 assert.match(js,/el producto sigue pendiente de OK/);
 assert.match(css,/\.gl-molino-note-btn/);
});
