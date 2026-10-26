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
  assert.match(app, /GestLokOwnerAreas\?\.attach\(\{S,role:miRol,render:\(\)=>S\.local\?render\(\):renderHub\(\),/);
});
test('El Inicio del gerente incluye avisos del local y la tarjeta de Empleados', () => {
  assert.match(app, /miRol\(\)==='gerente'\?\(window\.GestLokUpdates\?\.homeAlerts\?\.\(\)\|\|''\):''/);
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
  const u = load(ctxMk([{fecha: 1, titulo: 'Viejo'}, {fecha: 40, titulo: 'C', detalle: '<img src=x>'}, {fecha: 30, titulo: 'B'}, {fecha: 20, titulo: 'A'}]));
  const html = u.homeAlerts();
  assert.ok(html.includes('Avisos del local') && html.includes('data-go="avisos"'));
  assert.ok(html.includes('&lt;img src=x&gt;') && !html.includes('<img'));
  assert.ok(!html.includes('Viejo'));
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
