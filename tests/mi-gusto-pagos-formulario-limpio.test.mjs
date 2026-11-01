import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Pagos Online: el formulario se vacía después de guardar, antes de redibujar',()=>{
 const s=read('public/stock/mi-gusto-cierre-online.js');
 new Script(s);
 // Regresión: el bloque de limpieza no puede quedar dentro de un comentario con «\n» literales.
 assert.doesNotMatch(s,/\/\/[^\n]*\\n/);
 assert.match(s,/function clearEntryForm\(\)\{/);
 for(const name of ['comanda','amount','observacion']) assert.match(s,new RegExp("'"+name+"'"));
 assert.match(s,/method\.value='transferencia'/);
 assert.match(s,/app\.checked=false/);
 // Solo después de que el servidor confirmó el guardado, y antes del render que preserva borradores.
 const action=s.slice(s.indexOf('async function action('),s.indexOf('async function rpcRefresh('));
 const saved=action.indexOf("const result=await rpc(name,args);if(name==='gestlok_mg_online_save_note')clearEntryForm();");
 assert.ok(saved>0,'se limpia justo después de confirmar el guardado');
 assert.ok(saved<action.indexOf('await rpcRefresh()'),'se limpia antes de volver a dibujar');
 assert.match(action,/catch\(e\)\{error=e\.message\|\|'No se pudo completar';api\.render\(\);\}/);
 assert.match(action,/if\(saveNotice&&tab==='movimientos'\)clearEntryForm\(\);/);
});

test('Pagos Online: sin sugerencias del navegador en comanda, monto ni observación',()=>{
 const s=read('public/stock/mi-gusto-cierre-online.js');
 assert.match(s,/<form id="mg-online-form" class="mg-on-entry" autocomplete="off">/);
 assert.match(s,/name="comanda" autocomplete="off"/);
 assert.match(s,/name="amount" autocomplete="off"/);
 assert.match(s,/<textarea name="observacion" maxlength="300" autocomplete="off"/);
});

test('Pagos Online: prueba Cypress en Munro y Torcuato con datos ficticios',()=>{
 const spec=read('qa/cypress/e2e/pagos-online-formulario.cy.js');
 assert.match(spec,/gerente\.munro@example\.com/);
 assert.match(spec,/gerente\.torcuato@example\.com/);
 assert.match(read('tests/mock_supabase.js'),/fn === 'gestlok_mg_online_save_note'/);
});
