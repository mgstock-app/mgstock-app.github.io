import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Mi Gusto: OK es la primera columna visible y persiste por movimiento',()=>{
 const js=read('public/stock/mi-gusto-cierre-online.js');
 const css=read('app/mi-gusto-pagos-online.css');
 const runtime=read('components/stock-runtime.tsx');
 const sql=read('supabase/migrations/20261105010500_mi_gusto_efectivo_ok.sql');
 new Script(js);
 const begin=js.indexOf('function cashMovementDetail()');
 const end=js.indexOf('function parseAmountInput(',begin);
 assert.ok(begin>0 && end>begin);
 const section=js.slice(begin,end);
 assert.ok(section.indexOf('<th scope="col">OK</th>') < section.indexOf('<th scope="col">Comanda</th>'));
 assert.match(section, /rows\.map\(r=>'<tr class=/);
 assert.match(section, /<td><label class="mg-on-ok-label"><input type="checkbox" data-mgon-cash-ok=/);
 assert.match(section, /<td colspan="5">TOTAL EFECTIVO DEL TURNO/);
 assert.match(js, /gestlok_mg_online_cash_ok/);
 assert.match(css, /\.mg-on-cash-scroll thead th:first-child\{position:sticky;left:0/);
 assert.match(css, /\.mg-on-cash-scroll tbody td:first-child\{position:sticky;left:0/);
 assert.match(runtime, /mi-gusto-cierre-online\.js\?rev=efectivo-ok-visible-20261105/);
 assert.match(sql, /cash_checked/);
});
