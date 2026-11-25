import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cartaMarcaHabilitada,consultaCartaMarca,hojasCartaMarca} from '../public/chat/carta-marca.mjs';
test('Carta visual real: marca autorizada por servidor, cualquier sucursal, nunca demo ni otras empresas',()=>{
 for(const slug of ['mi-gusto-munro','mi-gusto-torcuato','mi-gusto-nuevo','nombre-distinto']){
  const sucursal={slug,carta_visual_marca:'mi-gusto'};
  assert.equal(cartaMarcaHabilitada('produccion',sucursal,slug),true);
  for(const e of ['prueba','testing','otro'])assert.equal(cartaMarcaHabilitada(e,sucursal,slug),false);
  assert.equal(cartaMarcaHabilitada('produccion',sucursal,slug,true),false);
  assert.equal(cartaMarcaHabilitada('produccion',{slug,empresa:'Mi Gusto'},slug),false);
  assert.equal(cartaMarcaHabilitada('produccion',sucursal,'otro-local'),false);
 }
 assert.equal(cartaMarcaHabilitada('produccion',null,'mi-gusto-munro'),false);
});
test('Cinco imágenes aprobadas, categorías, consultas y exclusión de compras y reclamos',()=>{
 assert.equal(hojasCartaMarca().length,5);
 assert.equal(hojasCartaMarca('promos').length,3);
 assert.equal(hojasCartaMarca('pizzas').length,2);
 assert.equal(consultaCartaMarca('¿Me pasás la carta?'),'todo');
 assert.equal(consultaCartaMarca('¿Cuánto sale la docena?'),'empanadas-promos');
 assert.equal(consultaCartaMarca('Quiero pedir 2 empanadas'),null);
 assert.equal(consultaCartaMarca('reclamo por mi pedido'),null);
 for(const h of hojasCartaMarca()){
  const b=readFileSync(new URL('../public'+h.url,import.meta.url));
  assert.equal(b.toString('ascii',0,4),'RIFF');
  assert.equal(b.toString('ascii',8,12),'WEBP');
 }
});
test('Entradas visuales mantienen API y carrito existentes',()=>{
 const js=readFileSync(new URL('../public/chat/chat.js',import.meta.url),'utf8');
 assert.ok(js.includes("await api('mensaje', {entrada})"));
 assert.ok(js.includes("if(consultaVisual) mostrarCategoriasMarca(consultaVisual)"));
 assert.ok(js.includes("text:'Hacer un pedido',onclick:()=>abrirCarta()"));
 assert.ok(js.includes("S.sucursal, SLUG, DEMO"));
});
