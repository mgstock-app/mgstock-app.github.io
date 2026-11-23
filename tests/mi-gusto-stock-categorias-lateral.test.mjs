import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const leer = ruta => readFileSync(new URL('../'+ruta,import.meta.url),'utf8');
const js=leer('public/stock/app.js');
const css=leer('app/globals.css');
const runtime=leer('components/stock-runtime.tsx');

test('Stock Local de Mi Gusto obtiene sus categorías del local, nunca de una lista fija',()=>{
 assert.doesNotThrow(()=>new Script(js));
 assert.match(js,/miGustoStockLateralActivo=\(\)=>S\.view==='stock'&&miGustoContext\(\)&&/);
 assert.match(js,/\['munro','torcuato'\]\.includes\(S\.local\)/);
 assert.match(js,/const categorias=cats\(\)/);
 assert.match(js,/S\.prods\.length/);
 assert.match(js,/data-act="cat"/);
 assert.match(js,/aria-pressed/);
 assert.match(js,/miGustoStockConCategorias\(tools\('q-stock', S\.q, 'Buscar producto', miGustoStockLateralActivo\(\)\)/g);
});
test('No cambia lógica de actualización, cantidades, guardado ni búsqueda',()=>{
 assert.match(js,/case 'cat': \{[\s\S]*?if\(lateral\)\{S\.q='';S\.filtro='todos';\}/);
 assert.match(js,/case 'filtro': S\.filtro = t\.dataset\.f; render\(\); break/);
 assert.match(js,/function rowStock\(p/);
 assert.match(js,/data-act="inc"/);
 assert.match(js,/data-act="dec"/);
 assert.match(js,/function renderSavebar\(\)/);
 assert.match(js,/function tools\(id, val, ph, ocultarChips=false\)/);
 assert.match(runtime,/stock\/app\.js\?rev=stock-local-cierre-0050-20261123/g);
});
test('Tablet ofrece lateral fijo y celular panel de categorías accesible sin aplastar la planilla',()=>{
 assert.match(css,/\.gl-mg-stock-layout\{display:grid;grid-template-columns:184px minmax\(0,1fr\)/);
 assert.match(css,/\.gl-mg-stock-nav\{position:sticky/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.gl-mg-stock-drawer\{display:block;position:relative/);
 assert.match(css,/\.gl-mg-stock-main\{min-width:0\}/);
 assert.match(js,/<details class="gl-mg-stock-drawer"><summary>Categorías/);
 assert.match(js,/<nav class="gl-mg-stock-nav"/);
});