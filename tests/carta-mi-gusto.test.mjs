import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cartaMiGustoHabilitada,consultaCartaMiGusto,hojasCartaMiGusto} from '../public/chat/carta-mi-gusto.mjs';
test('Carta visual real: solo Mi Gusto en producción, nunca demo ni otros entornos',()=>{
 for(const slug of ['mi-gusto-munro','mi-gusto-torcuato']){
  assert.equal(cartaMiGustoHabilitada('produccion',slug),true);
  for(const e of ['prueba','testing','otro'])assert.equal(cartaMiGustoHabilitada(e,slug),false);
  assert.equal(cartaMiGustoHabilitada('produccion',slug,true),false);
 }
 assert.equal(cartaMiGustoHabilitada('produccion','otro-local'),false);
});
test('Cinco imágenes aprobadas, categorías, consultas y exclusión de compras y reclamos',()=>{
 assert.equal(hojasCartaMiGusto().length,5);
 assert.equal(hojasCartaMiGusto('promos').length,3);
 assert.equal(hojasCartaMiGusto('pizzas').length,2);
 assert.equal(consultaCartaMiGusto('¿Me pasás la carta?'),'todo');
 assert.equal(consultaCartaMiGusto('¿Cuánto sale la docena?'),'empanadas-promos');
 assert.equal(consultaCartaMiGusto('Quiero pedir 2 empanadas'),null);
 assert.equal(consultaCartaMiGusto('reclamo por mi pedido'),null);
 for(const h of hojasCartaMiGusto()){
  const b=readFileSync(new URL('../public'+h.url,import.meta.url));
  assert.equal(b.toString('ascii',0,4),'RIFF');
  assert.equal(b.toString('ascii',8,12),'WEBP');
 }
});
test('Entradas visuales mantienen API y carrito existentes',()=>{
 const js=readFileSync(new URL('../public/chat/chat.js',import.meta.url),'utf8');
 assert.ok(js.includes("await api('mensaje', {entrada})"));
 assert.ok(js.includes("if(consultaVisual) mostrarCategoriasMiGusto(consultaVisual)"));
 assert.ok(js.includes("text:'Hacer un pedido',onclick:()=>abrirCarta()"));
 assert.ok(js.includes("S.sucursal.slug===SLUG"));
});
