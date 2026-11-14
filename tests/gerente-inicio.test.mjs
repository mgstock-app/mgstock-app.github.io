import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app = readFileSync('public/stock/app.js', 'utf8');
const updates = readFileSync('public/stock/gestlok-updates.js', 'utf8');
test('Avisos queda habilitado para creadora, dueño y gerente, y no para otros roles', () => {
  assert.match(app, /const puedeVerAvisos = \(\) => esTotal\(\) \|\| miRol\(\) === 'gerente';/);
  assert.match(app, /\$\{puedeVerAvisos\(\) \? `<button data-go="avisos">/);
  assert.match(app, /\(v === 'avisos' && puedeVerAvisos\(\)\)/);
  assert.doesNotMatch(app, /\(v === 'avisos' && esTotal\(\)\)/);
});
test('La tarjeta de áreas redibuja el Inicio del local y no solo la lista de locales', () => {
  assert.match(app, /GestLokOwnerAreas\?\.attach\(\{S,role:miRol,isCreadora,render:\(\)=>S\.local\?render\(\):renderHub\(\),/);
});
test('El Inicio del gerente incluye avisos del local y la tarjeta de Empleados', () => {
  assert.doesNotMatch(app, /miRol\(\)==='gerente'\?\(window\.GestLokUpdates\?\.homeAlerts/);
  assert.match(app, /miRol\(\)==='gerente'\?\(window\.GestLokOwnerAreas\?\.gerenteCard\?\.\(\)\|\|''\):''/);
  assert.match(app, /S\.view === 'inicio' && miRol\(\) === 'gerente'\)\) render\(\)/);
});
test('homeAlerts muestra las 3 novedades más recientes, escapadas, y avisa cuando no hay', () => {
  const ctxMk = avisos => ({S: {local: 'munro', avisos}, localNombre: () => 'Munro'});
  const load = c => {
    const window = {}; const document = {addEventListener() {}};
    vm.runInNewContext(updates, {window, document, Intl, Date, setTimeout, crypto: {}});
    window.GestLokUpdates.attach(c); return window.GestLokUpdates;
  };
  const u = load(ctxMk([
    {fecha: 99, titulo: 'Conteo realizado'},
    {fecha: 1, titulo: 'Viejo', publicacion_autorizada: true},
    {fecha: 40, titulo: 'C', detalle: '<img src=x>',publicacion_autorizada:true},
    {fecha: 30, titulo: 'B',publicacion_autorizada:true},
    {fecha: 20, titulo: 'A',publicacion_autorizada:true}
  ]));
  const html = u.homeAlerts();
  assert.ok(html.includes('Avisos del local') && html.includes('data-go="avisos"'));
  assert.ok(html.includes('&lt;img src=x&gt;') && !html.includes('<img'));
  assert.ok(!html.includes('Viejo'));
  assert.ok(!html.includes('Conteo realizado'), 'No mostrar avisos automáticos históricos');
  assert.ok(html.indexOf('>C<') < html.indexOf('>B<') && html.indexOf('>B<') < html.indexOf('>A<'));
  assert.ok(load(ctxMk([])).homeAlerts().includes('Sin novedades por ahora'));
  assert.equal(load({S: {local: '', avisos: []}, localNombre: () => ''}).homeAlerts(), '');
});
for(const [local,backend] of [['munro','munro'],['torcuato','dt']])test('Dos tarjetas y Horarios propio para '+local,async()=>{
 const source=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
 const listeners={};let business=0;
 const tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
 const window={addEventListener(){},GestLokSupabase:{rpc:async()=>({data:{role:'gerente',tenant_id:tenant,local_ids:[backend]},error:null})}};
 vm.runInNewContext(source,{window,document:{addEventListener(k,f){listeners[k]=f;}}});
 const a=window.GestLokOwnerAreas;a.attach({role:()=> 'gerente',S:{loaded:{e:true},local,me:{tenant_id:tenant},localesDB:[{id:local,nombre:local}]},render(){},openBusiness(){business++;}});
 await a.refresh();const html=a.gerenteHome();
 assert.match(html,/gl-owner-business/);assert.match(html,/gl-owner-employees/);assert.match(html,/data-gerente-empleados/);
 assert.doesNotMatch(html,/Recibos de sueldo|Empleados y roles|Tienda física|Tienda mixta/);
 listeners.click({preventDefault(){},target:{closest:s=>s==='[data-gerente-business]'?{}:null}});
 assert.equal(business,1);
});

test('Munro: Staff es opción visible del menú lateral, sin duplicar Horarios y con caché PWA actualizada',()=>{
 const sidebar=readFileSync('public/stock/app.js','utf8');
 const areas=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
 const runtime=readFileSync('components/stock-runtime.tsx','utf8');
 assert.match(sidebar,/const puedeVerStaffMunro = \(\) => S\.me\?\.tenant_id === MI_GUSTO_TENANT && S\.local === 'munro'/);
 assert.match(sidebar,/staffMunro \? `<button type="button" data-act="staff-horarios"/);
 assert.match(sidebar,/case 'staff-horarios': window\.GestLokOwnerAreas\?\.openStaffHorarios\?\.\(\)/);
 assert.match(sidebar,/puedeVerStaffMunro\(\) \? '' : `<a class="snav-link"/);
 assert.match(areas,/staffNavVisible,openStaffHorarios/);
 assert.match(runtime,/app\.js\?rev=munro-staff-pc-20261113/);
});
test('El menú Staff exige autorización de servidor, empresa Mi Gusto y sucursal Munro',async()=>{
 const source=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
 const tenant='cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
 const make=async({local='munro',permit=true,company=tenant}={})=>{
  const window={addEventListener(){},GestLokSupabase:{rpc:async()=>permit
   ?{data:{role:'gerente',tenant_id:company,local_ids:[local]},error:null}
   :{data:null,error:{message:'sin permiso'}}}};
  const document={addEventListener(){},baseURI:'https://gestlok.com.ar/'};
  const assigned=[];
  const location={assign:url=>assigned.push(url)};
  vm.runInNewContext(source,{window,document,location,URL});
  const api=window.GestLokOwnerAreas;
  const S={loaded:{e:true},local,me:{tenant_id:company},localesDB:[{id:local,nombre:local}]};
  api.attach({role:()=> 'gerente',S,render(){}});
  assert.equal(api.staffNavVisible(),false,'No mostrar antes de consultar el servidor');
  await api.refresh();
  return {api,S,assigned};
 };
 const good=await make();
 assert.equal(good.api.staffNavVisible(),true);
 assert.equal(good.api.openStaffHorarios(),true);
 assert.deepEqual(good.assigned,['https://gestlok.com.ar/empleados/horarios/']);
 const denied=await make({permit:false});
 assert.equal(denied.api.staffNavVisible(),false);
 assert.equal(denied.api.openStaffHorarios(),false);
 assert.equal(denied.assigned.length,0);
 assert.equal((await make({local:'torcuato'})).api.staffNavVisible(),false);
 assert.equal((await make({company:'otra-empresa'})).api.staffNavVisible(),false);
 good.S.local='torcuato';
 assert.equal(good.api.staffNavVisible(),false,'El acceso desaparece al cambiar de local');
});
