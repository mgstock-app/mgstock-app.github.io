import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261107190000_el_molino_solo_dueno_gerente.sql','utf8');
const app=readFileSync('public/stock/app.js','utf8');
const areas=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const TENANT='6c8717ea-5f78-426b-9458-74a5dcac6e4e';

test('Los roles asignables de El Molino son Dueño y Gerente, sin otros perfiles',()=>{
 assert.match(sql,/roles_permitidos/);
 assert.match(sql,/'\["dueno","gerente"\]'/);
 assert.match(sql,/gestlok_el_molino_roles_dueno_gerente/);
 assert.match(sql,/coalesce\(data->>'rol',''\) in \('dueno','gerente'\)/);
 assert.match(sql,/data->>'rol'='creadora'/);
 assert.match(sql,/El Molino Café/);
 assert.match(sql,/from gestlok_platform\.companies/);
 assert.doesNotMatch(sql,/\b(?:delete from|truncate|drop table)\b/i);
 assert.match(app,/const molinoRoles = \(\) => S\.me\?\.tenant_id/);
 assert.match(app,/molinoRoles\(\)\s*\? \`<select class="rolsel"/);
 assert.match(app,/El Molino Café tiene únicamente dos roles de trabajo/);
 assert.match(app,/El Molino Café solo permite Dueño y Gerente/);
});

test('El gerente de El Molino ve la tienda sin Empleados',()=>{
 const window={addEventListener(){}};
 vm.runInNewContext(areas,{window,document:{addEventListener(){}}});
 const api=window.GestLokOwnerAreas;
 api.attach({role:()=> 'gerente',
   S:{me:{tenant_id:TENANT},local:'acassuso',localesDB:[{id:'acassuso',nombre:'Acassuso'}],equipo:[]},
   render(){}});
 const html=api.gerenteHome();
 assert.match(html,/Administrar <span>mi tienda<\/span>/);
 assert.doesNotMatch(html,/a los empleados|data-gerente-empleados|gl-owner-employees-locked/);
 assert.equal(api.gerenteCard(),'');
});

test('Los gerentes de otras empresas conservan tarjeta de Empleados',()=>{
 const window={addEventListener(){}};
 vm.runInNewContext(areas,{window,document:{addEventListener(){}}});
 const api=window.GestLokOwnerAreas;
 api.attach({role:()=> 'gerente',
   S:{me:{tenant_id:'otra-empresa'},local:'local',localesDB:[{id:'local',nombre:'Local'}],equipo:[]},
   render(){}});
 const html=api.gerenteHome();
 assert.match(html,/Administrar <span>mi empresa<\/span>/);
 assert.match(html,/gl-owner-employees-locked/);
});
