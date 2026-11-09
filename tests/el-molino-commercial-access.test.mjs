import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const migration=readFileSync('supabase/migrations/20261107175000_el_molino_acceso_comercial_creadora.sql','utf8');
const areas=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';

test('El Molino sólo otorga a la creadora preparación comercial sin dueño ficticio ni empleados',()=>{
 assert.match(migration,/El Molino Café/);
 assert.match(migration,/kmu15lopez@gmail\.com/);
 assert.match(migration,/join auth\.users u on u\.id=a\.user_id/);
 assert.match(migration,/rol','creadora'/);
 assert.match(migration,/alcance','preparacion_comercial'/);
 assert.match(migration,/owner_email is null/);
 assert.match(migration,/Acassuso','San Isidro/);
 assert.doesNotMatch(migration,/rol','dueno'|insert into (?:gestlok_platform\.company_modules|public\.rm_app_local|public\.rm_test_members)/i);
 assert.doesNotMatch(migration,/\b(?:delete from|truncate|drop table|update public\.docs)\b/i);
 assert.match(runtime,/gestlok-owner-areas\.js\?rev=molino-brand-20261109/);
 assert.match(runtime,/gestlok-creator-support\.js\?rev=creadora-permisos-20261108/);
});

test('La creadora sólo ve Administración de tienda en El Molino; Empleados permanece invisible',async()=>{
 const window={addEventListener(){},GestLokSupabase:{rpc:async()=>({
   data:{scope:'metadata_only',companies:[{tenant_id:TENANT,name:'El Molino Café',
     locals:[{id:'acassuso',name:'Acassuso'},{id:'san-isidro',name:'San Isidro'}],
     modules:{comercial:true,recibos_personal:false},recibonet:null}]},error:null
 })}};
 vm.runInNewContext(areas,{window,document:{addEventListener(){}}});
 const api=window.GestLokOwnerAreas;
 api.attach({role:()=> 'creadora',S:{loaded:{e:true},me:{tenant_id:TENANT,email:'kmu15lopez@gmail.com'},equipo:[]},render(){}});
 await api.refresh();
 const html=api.view([{id:'acassuso'},{id:'san-isidro'}],()=> '');
 assert.doesNotMatch(html,/Administrar <span>mi tienda<\/span>/);
 assert.doesNotMatch(html,/gl-owner-employees-locked|data-owner-area-staff|a los empleados/);
 assert.match(html,/El Molino Café/);
});

test('El diseño comercial de Mi Gusto y otras empresas se conserva',async()=>{
 const window={addEventListener(){},GestLokSupabase:{rpc:async()=>({
   data:{scope:'metadata_only',companies:[{tenant_id:'mi-gusto',name:'Mi Gusto',
     locals:[{id:'munro',name:'Munro'}],
     modules:{comercial:true,recibos_personal:false},recibonet:null}]},error:null
 })}};
 vm.runInNewContext(areas,{window,document:{addEventListener(){}}});
 const api=window.GestLokOwnerAreas;
 api.attach({role:()=> 'creadora',S:{loaded:{e:true},me:{tenant_id:'mi-gusto',email:'kmu15lopez@gmail.com'},equipo:[]},render(){}});
 await api.refresh();
 const html=api.view([{id:'munro'}],()=> '');
 assert.match(html,/Administrar <span>mi empresa<\/span>/);
 assert.match(html,/gl-owner-employees-locked/);
});
