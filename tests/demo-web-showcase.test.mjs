import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('public/stock/gestlok-demo-tour.js');
const css=read('public/stock/gestlok-demo-showcase.css');
const runtime=read('components/stock-runtime.tsx');
const sw=read('scripts/sw-template.js');
test('Tour en web real conserva scripts de negocio con backend ficticio y 9 etapas manuales',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));
 for(const title of ["Inicio","Empresa","Proveedores","Colaboradores","Precios","Stock","Pedidos","Vencimientos","Final"])
  assert.match(js,new RegExp("name:'"+title+"'"));
 assert.match(js,/document\.getElementById\('hub'\)/);
 assert.match(js,/document\.getElementById\('app'\)/);
 assert.match(js,/screen\.append\(hub,app,fake,end\)/);
 assert.match(js,/GestLokDemoHorarios\?\.open/);
 assert.match(js,/Math\.abs\(dx\)>70/);
 assert.doesNotMatch(js,/setInterval\(\s*\(\)\s*=>\s*move/);
});
test('Extensiones de precios, inventario, pedidos son ficticias, no tocan tablas reales',()=>{
 assert.match(js,/gestlok:guided:products:v2:/);
 assert.match(js,/sessionStorage\.setItem\(simulationKey/);
 assert.match(js,/data-practice-adjust/);
 assert.match(js,/gl-tour-price-form/);
 assert.match(js,/gl-tour-order-form/);
 assert.match(js,/status:'pendiente'/);
 assert.doesNotMatch(js,/(?:gestlok_pilot_products|gestlok_future_local_prices_stock|\.from\(['"]public\.)/);
 assert.match(js,/gestlok_demo_enviar_resena_cupon/);
 assert.match(js,/if\(!rating\)/);
 assert.match(js,/couponCode=code;sent=true;paint\(\)/);
});
test('Estilos aislados únicamente en demo; escritorio y móvil adaptables',()=>{
 assert.match(css,/gl-tour-layout-active/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,440px\)/);
 assert.match(css,/@media\(max-width:899px\)/);
 assert.match(css,/gl-tour-phone-screen/);
 assert.match(css,/gl-tour-sandbox/);
 assert.match(runtime,/gestlok-demo-tour\.js\?rev=carrusel-nueve-20261029/);
 assert.match(sw,/gestlok-demo-showcase\.css/);
});
