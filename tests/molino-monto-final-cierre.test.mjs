import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const js=readFileSync('public/stock/gestlok-molino.js','utf8');
const css=readFileSync('public/stock/gestlok-molino.css','utf8');
const archive=readFileSync('supabase/migrations/20261107203000_molino_precios_envios_devoluciones.sql','utf8');
const monthly=readFileSync('supabase/migrations/20261109001500_molino_return_valuation_monthly.sql','utf8');
const a=js.indexOf('function returnLedger(');
const b=js.indexOf('function monthView(',a);
assert.ok(a>=0&&b>a,'La función returnLedger debe existir');

function ledger(items){
 const script=js.slice(a,b)+'\nreturnLedger(items,"Cuadro diario de devoluciones");';
 const context={
  items,
  Math,Number,Intl,
  escapeHTML:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  fmtQty:n=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(Number(n||0)),
  money:n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format(Number(n||0))
 };
 return vm.runInNewContext(script,context);
}
const items=[
 {product:'Pan 9,500 kg',quantity:9.5,unit:'kg',unit_price:4000,price_basis:'kg',
  gross_total:38000,discount_amount:12540,net_total:25460,acknowledged_at:null},
 {product:'Pan 250 g',quantity:250,unit:'g',unit_price:4000,price_basis:'kg',
  gross_total:1000,discount_amount:330,net_total:670,acknowledged_at:'2026-11-09T02:00:00Z'}
];
test('El cuadro nombra Monto final en cada producto y la suma exacta, no reaplica 33%',()=>{
 const html=ledger(items);
 assert.match(html,/>Monto final<\/th>/);
 assert.match(html,/Total monto final del día/);
 assert.match(html,/data-mol-day-final-total/);
 assert.match(html,/data-mol-day-final-summary/);
 assert.match(html,/26\.130,00/); // 25.460 + 670
 assert.match(html,/12\.870,00/); // Descuento: 12.540 + 330
 assert.match(html,/39\.000,00/); // Venta total.
 assert.match(html,/Pan 9,500 kg/);
 assert.match(html,/Pan 250 g/);
 assert.doesNotMatch(html,/Importe resultante|>Resultante</);
});
test('Sin productos presenta total 0; partidas históricas sin precio no inventan importes',()=>{
 assert.match(ledger([]),/Total monto final del día/);
 assert.match(ledger([]),/0,00/);
 const html=ledger([...items,{product:'Antiguo',quantity:1,unit:'unidad',net_total:null,gross_total:null,discount_amount:null}]);
 assert.match(html,/registros antiguos sin precio consolidado/);
 assert.match(html,/26\.130,00/);
});
test('Historial muestra diariamente el cuadro de cierre y mes con totales por fecha',()=>{
 assert.match(js,/returnLedger\(d,'Cuadro diario del '/);
 assert.match(js,/returnLedger\(\(d\.details\|\|\[\]\)\.map/);
 assert.match(js,/data-mol-month-final-total/);
 assert.match(js,/Total monto final del mes/);
 assert.match(js,/cierre automático a las 23:59/i);
 assert.match(monthly,/where kind='devolucion' and day>=v_first and day<v_next group by day/);
 assert.match(monthly,/x\.net_total/);
});
test('Cierre de 23:59 Argentina es automático, idempotente y sin pérdida de detalles',()=>{
 assert.match(archive,/America\/Argentina\/Buenos_Aires/);
 assert.match(archive,/cron\.schedule\('molino-cierre-2359-ar','59 2 \* \* \*'/);
 assert.match(archive,/cron\.schedule\('molino-cierre-respaldo','\*\/15 \* \* \* \*'/);
 assert.match(archive,/on conflict\(day\) do nothing/);
 assert.match(archive,/'devoluciones',coalesce\(\(select jsonb_agg\(to_jsonb\(m\)-'tenant_id'/);
 assert.match(css,/\.gl-molino-final-summary/);
 assert.match(css,/\.gl-molino-ledger-sum/);
 new vm.Script(js);
});
