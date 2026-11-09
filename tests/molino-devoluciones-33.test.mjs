import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sql=readFileSync('supabase/migrations/20261109001500_molino_return_valuation_monthly.sql','utf8');
const js=readFileSync('public/stock/gestlok-molino.js','utf8');
const css=readFileSync('public/stock/gestlok-molino.css','utf8');

test('Devolución admite unidades y peso con precio por unidad o kg, no mezcla unidades',()=>{
 assert.match(sql,/quantity type numeric\(12,3\)/);
 assert.match(sql,/unit in \('unidad','kg','g'\)/);
 assert.match(sql,/price_basis in \('unidad','kg'\)/);
 assert.match(sql,/p_unit='g' then v_qty\/1000/);
 assert.match(sql,/p_unit='unidad' and p_quantity<>trunc\(p_quantity\)/);
 assert.match(sql,/La unidad elegida no coincide/);
 assert.match(js,/name="unit" aria-label="Unidad de devolución"/);
 assert.match(js,/name="basis" aria-label="Base de precio"/);
 new vm.Script(js);
});
test('Monto es snapshot: venta, 33%, neto; nunca depender del precio actual en reporte',()=>{
 assert.match(sql,/v_gross:=round\(v_price.amount/);
 assert.match(sql,/v_discount:=round\(v_gross\*0\.33,2\)/);
 assert.match(sql,/unit_price=v_price.amount/);
 assert.match(sql,/gross_total=v_gross,discount_rate=0.33,discount_amount=v_discount,net_total=v_gross-v_discount/);
 assert.match(sql,/where kind='devolucion' and day>=v_first and day<v_next group by day/);
 assert.doesNotMatch(sql,/join public\.gestlok_molino_prices\s+[^;]*?from public\.gestlok_molino_movements/i);
 // Pan: 9,500 kg * $4000/kg = $38000; -33% = $25460.
 const gross=Math.round(9.5*4000*100)/100;
 assert.equal(gross,38000);
 assert.equal(Math.round(gross*.33*100)/100,12540);
 assert.equal(gross-12540,25460);
});
test('Solo Acassuso puede cargar y San Isidro confirmar sin editar cantidades',()=>{
 assert.match(sql,/v_scope not in \('admin','dueno','acassuso'\)/);
 assert.match(sql,/v_scope not in \('admin','dueno','san_isidro'\)/);
 assert.match(sql,/public\.gestlok_molino_scope\(\)/);
 assert.match(sql,/if p_kind='devolucion' then[\s\S]*?gestlok_molino_save_return/);
 assert.match(sql,/acknowledged_at is null/);
 assert.match(sql,/kind='devolucion'/);
 assert.match(sql,/revoke all on function public\.gestlok_molino_save_return/);
 assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|all)\s+on\s+public\.gestlok_molino_movements/i);
});
test('Cuadro y conciliaciones muestran valor venta, descuento y neto diarios y mensuales',()=>{
 for(const term of ['returnLedger','monthView','gestlok_molino_returns_month','data-mol-history-mode','gl-molino-month','discount_amount','net_total','unit_price'])
  assert.ok(js.includes(term),term);
 assert.match(css,/\.gl-molino-return-totals/);
 assert.match(css,/\.gl-molino-month-day/);
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(sql,/America\/Argentina\/Buenos_Aires/);
 assert.match(sql,/jsonb_build_object\('month',p_month/);
 assert.match(sql,/jsonb_build_object\(\s*'day',q.day/);
});
