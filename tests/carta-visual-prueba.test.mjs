import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Carta visual: solo Prueba gastronómica, jamás producción ni Testing', async () => {
 const {cartaVisualHabilitada,productosVisuales,pasoVisual}=await import('../public/chat/carta-visual.mjs');
 assert.equal(cartaVisualHabilitada('prueba',true,'demo'),true);
 for(const slug of ['mi-gusto-munro','mi-gusto-torcuato'])assert.equal(cartaVisualHabilitada('prueba',false,slug),true);
 for(const env of ['testing','main',undefined])assert.equal(cartaVisualHabilitada(env,true,'mi-gusto-munro'),false);
 assert.equal(cartaVisualHabilitada('prueba',false,'perfumeria'),false);
 const catalogo={categorias:[{id:'a'},{id:'b'}],productos:[
  {id:'1',categoria_id:'a',nombre:'Jamón y queso',activo:true},
  {id:'2',categoria_id:'a',nombre:'Carne',activo:true,disponible:false},
  {id:'3',categoria_id:'a',nombre:'Oculto',activo:false},
  {id:'4',categoria_id:'b',nombre:'Pizza',descripcion:'Muzzarella'}
 ]};
 assert.deepEqual(productosVisuales(catalogo,'a').map(p=>p.id),['2','1']);
 assert.deepEqual(productosVisuales(catalogo,'','jamon').map(p=>p.id),['1']);
 assert.deepEqual(productosVisuales(catalogo,'','muzzarella').map(p=>p.id),['4']);
 assert.equal(productosVisuales(catalogo,'b','carne').length,0);
 assert.equal(pasoVisual(0,-1,3),2);assert.equal(pasoVisual(2,1,3),0);assert.equal(pasoVisual(0,1,0),0);
 const cliente=readFileSync('public/chat/chat.js','utf8');
 assert.match(cliente,/abrirProducto\(p,\{\}, \{slot:detalle,onAdd:cerrarDetalle,onCancel:cerrarDetalle\}\)/);
 assert.match(cliente,/S\.borrador\.length\?abrirSeleccion\(\):abrirCarrito\(\)/);
 assert.match(cliente,/m\.categoria \|\| !pilotoCartaVisual\(\) \? abrirCarta\(\) : abrirOpcionesCarta\(\)/);
});

test('Carta Mi Gusto: cinco imágenes, consulta y aislamiento exclusivo de Prueba', async()=>{
 const {cartaMiGustoHabilitada,consultaCartaMiGusto,hojasCartaMiGusto}=await import('../public/chat/carta-visual.mjs');
 for(const slug of ['mi-gusto-munro','mi-gusto-torcuato'])assert.equal(cartaMiGustoHabilitada('prueba',slug),true);
 for(const env of ['testing','main',undefined])assert.equal(cartaMiGustoHabilitada(env,'mi-gusto-munro'),false);
 assert.equal(cartaMiGustoHabilitada('prueba','perfumeria'),false);
 assert.equal(cartaMiGustoHabilitada('prueba','demo'),false);
 assert.equal(hojasCartaMiGusto().length,5);
 assert.equal(hojasCartaMiGusto('promos').length,3);
 assert.equal(hojasCartaMiGusto('pizzas').length,2);
 assert.equal(consultaCartaMiGusto('¿Qué promos tienen?'),'promos');
 assert.equal(consultaCartaMiGusto('¿Cuánto sale la docena?'),'empanadas-promos');
 assert.equal(consultaCartaMiGusto('¿Qué gustos de empanadas tienen?'),'empanadas-sabores');
 assert.equal(consultaCartaMiGusto('¿Qué pizzas grandes tienen?'),'pizzas-family');
 assert.equal(consultaCartaMiGusto('Quiero pedir 2 pizzas'),null);
 for(const c of hojasCartaMiGusto()){
  const bytes=readFileSync('public'+c.url);
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');
  assert.equal(bytes.subarray(8,12).toString(),'WEBP');
 }
});
