import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('public/stock/app.js');
const commerce=read('public/stock/gestlok-commerce.js');
const css=read('app/globals.css');
const compact=app.slice(app.indexOf('function inicioOperativo()'),app.indexOf('\nV.inicio = () => {',app.indexOf('function inicioOperativo()')));
test('Dueño y Gerente reciben Inicio simplificado; creadora mantiene panel propio',()=>{
 assert.match(app,/if \(\['dueno','gerente'\]\.includes\(miRol\(\)\)\) return inicioOperativo\(\)/);
 assert.match(compact,/gl-home-essential/);
 assert.match(compact,/gl-home-essential-overview/);
 assert.match(compact,/gl-home-essential-actions/);
 assert.match(compact,/gl-home-essential-settings/);
 assert.match(css,/\.gl-home-essential-overview\{display:grid;grid-template-columns:repeat\(3/);
 assert.doesNotMatch(compact,/resumenHojasInicio\(\)|equipoRows\(|fabCard\(|lastCard|catRows\.map/);
 assert.doesNotThrow(()=>new Script(app));
});
test('Métricas y accesos sólo muestran información operativa del local',()=>{
 assert.match(compact,/const productos=sorted\(\)/);
 assert.match(compact,/estado\(p\)/);
 assert.match(compact,/S\.loaded\.p/);
 assert.match(compact,/pedidoItems\(\)\.length/);
 assert.match(compact,/GestLokCommerce\?\.pendingCount/);
 assert.match(compact,/GestLokUpdates\?\.homeDueItems/);
 assert.match(compact,/puedeVerDiarioMunro\(\)/);
 assert.match(compact,/ver\('historial'\)/);
 assert.match(compact,/\.slice\(0,4\)/);
});
test('La modalidad sólo la configura el Dueño, las otras opciones quedan plegadas',()=>{
 assert.match(compact,/miRol\(\)==='dueno'\?window\.GestLokCommerce\?\.card/);
 assert.match(compact,/<details class="gl-home-essential-settings">/);
 assert.match(compact,/data-act="share"/);
 assert.match(compact,/data-act="backup"/);
 assert.doesNotMatch(compact,/window\.GestLokCommerce\?\.summary\(\)/);
});
test('Los indicadores llevan a filtros de stock sin perder selección',()=>{
 assert.match(compact,/home-stock-filter/);
 assert.match(app,/case 'home-stock-filter': go\('stock'\); S\.filtro =/);
 assert.match(app,/render\(\); break/);
});
