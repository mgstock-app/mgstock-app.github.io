import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/stock/mi-gusto-cierre-online.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/mi-gusto-pagos-online.css',import.meta.url),'utf8');
const instrumented=source.replace(/\}\)\(\);\s*$/, 'window.__test={cashMovementDetail,reportTurn,oldRows};\n})();');
assert.notEqual(instrumented,source,'Se esperaba el módulo de Pagos Online');
const window={};
runInNewContext(instrumented,{
 window,document:{addEventListener:()=>{}},navigator:{onLine:true},
 Intl,Date,Number,String,Array,Object,console,queueMicrotask:()=>{}
});

const cashMovement={id:'11111111-1111-4111-8111-111111111111',method:'efectivo',comanda:'12',created_at:'2026-11-04T20:00:00Z',gross_amount:1000,discount_amount:100,amount:900,ok:true,observacion:'Comanda anotada',app:false};
const transferMovement={...cashMovement,id:'22222222-2222-4222-8222-222222222222',method:'transferencia',comanda:'21',amount:500,ok:false};
const closed={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',day:'2026-11-04',turno:'manana',status:'cerrado',comandas:2,movements:[cashMovement,transferMovement],efectivo:900,total_ventas:1400,transferencia:500};

test('Al cerrar, el reporte histórico contiene el detalle de efectivo y OK original en solo lectura',()=>{
 const html=window.__test.reportTurn(closed,'manana');
 assert.match(html,/Detalle de efectivo del turno/);
 assert.match(html,/mg-on-cash-history/);
 assert.match(html,/Comanda anotada/);
 assert.match(html,/#12/);
 assert.match(html,/input type="checkbox" data-mgon-cash-ok="11111111-1111-4111-8111-111111111111" checked disabled/);
 assert.match(html,/1 movimientos · 1 OK/);
 assert.equal((html.match(/mg-on-cash-detail-section/g)||[]).length,1);
 assert.ok(html.indexOf('Movimientos individuales')<html.indexOf('Detalle de efectivo del turno'));
 assert.match(css,/\.mg-on-cash-history \.mg-on-ok-label input:disabled\{opacity:1/);
});

test('El detalle de efectivo archivado se conserva también en el visor por turno',()=>{
 const html=window.__test.oldRows(closed);
 assert.match(html,/Detalle de efectivo del turno/);
 assert.match(html,/1 movimientos · 1 OK/);
});

test('Los turnos cerrados sin efectivo no muestran un cuadro vacío, sin perder el historial general',()=>{
 const other={...closed,movements:[transferMovement],efectivo:0};
 const html=window.__test.reportTurn(other,'manana');
 assert.match(html,/Movimientos individuales/);
 assert.doesNotMatch(html,/Detalle de efectivo del turno/);
});

test('El cuadro del turno abierto sigue mostrándose para registrar movimientos',()=>{
 const current={...closed,status:'abierto'};
 const html=window.__test.cashMovementDetail(current);
 assert.match(html,/Detalle de efectivo del turno/);
 assert.doesNotMatch(html,/mg-on-cash-history/);
});

test('Total descuentos pendientes: suma solo efectivo sin OK, sin incluir transferencias',()=>{
 const segundo={...cashMovement,id:'33333333-3333-4333-8333-333333333333',comanda:'32',gross_amount:19600,discount_amount:1960,amount:17640,ok:false};
 const transferencia={...transferMovement,discount_amount:5000};
 const turno={...closed,status:'abierto',movements:[cashMovement,segundo,transferencia]};
 const html=window.__test.cashMovementDetail(turno);
 const m=html.match(/data-mgon-total-discounts>([^<]+)<\/strong>/);
 assert.ok(m,'El resumen Total descuentos debe mostrarse sobre la tabla');
 assert.equal(m[1].replace(/\s/g,''),'$1.960,00');
 assert.match(html,/Solo pagos en efectivo/);
 const archivado=window.__test.reportTurn({...turno,status:'cerrado'},'manana');
 const totalArchivado=archivado.match(/data-mgon-total-discounts>([^<]+)<\/strong>/);
 assert.ok(totalArchivado);
 assert.equal(totalArchivado[1].replace(/\s/g,''),'$1.960,00');
});

test('La fila de totales suma descuentos sin OK del turno de Munro solo en su columna',()=>{
 const descuentos=[6040,2080,1090,5290,1960];
 const cobrados=[54360,18720,9810,47610,17640];
 const movements=descuentos.map((discount_amount,i)=>({
  ...cashMovement,id:String(i+1),comanda:String(i+1),ok:false,discount_amount,amount:cobrados[i],gross_amount:cobrados[i]+discount_amount
 }));
 const turno={...closed,status:'abierto',movements};
 const html=window.__test.cashMovementDetail(turno);
 const footer=html.match(/<tfoot><tr>(.*?)<\/tr><\/tfoot>/);
 assert.ok(footer,'Se debe mostrar la fila de totales dentro de la tabla');
 assert.match(footer[1],/<td colspan="4">TOTAL EFECTIVO DEL TURNO<\/td>/);
 const discountCell=footer[1].match(/<td class="mg-on-cash-discount-footer">(.*?)<\/td>/);
 assert.ok(discountCell,'Total descuentos debe estar debajo de su propia columna');
 assert.match(discountCell[1],/Total descuentos/);
 assert.match(discountCell[1],/\$\s*16\.460,00/);
 assert.match(footer[1],/mg-on-cash-amount-footer[^>]*>\$\s*148\.140,00/);
 const archived=window.__test.cashMovementDetail({...turno,status:'cerrado'});
 assert.match(archived,/data-mgon-total-discounts-footer[^>]*>\$\s*16\.460,00/);
});


test('Mi Gusto: 5 comandas sin OK suman $16.460, cada tilde resta su descuento y al desmarcar vuelve a sumar',()=>{
 const descuentos=[3150,6040,2080,1090,5290,1960];
 const cobrados=[28350,54360,18720,9810,47610,17640];
 const movements=descuentos.map((discount_amount,i)=>({
  ...cashMovement,id:String(i+1),comanda:String(i+1),ok:i===0,
  discount_amount,amount:cobrados[i],gross_amount:cobrados[i]+discount_amount
 }));
 const turno={...closed,status:'abierto',movements};
 const amounts=(rows)=>{
  const html=window.__test.cashMovementDetail({...turno,movements:rows});
  const top=html.match(/data-mgon-total-discounts>([^<]+)<\/strong>/)?.[1];
  const bottom=html.match(/data-mgon-total-discounts-footer>([^<]+)<\/strong>/)?.[1];
  assert.equal(top,bottom,'Los totales superior e inferior deben coincidir');
  assert.match(html,/mg-on-cash-amount-footer[^>]*>\$\s*176\.490,00/,'El efectivo cobrado no cambia por los OK');
  return top.replace(/\s/g,'');
 };
 assert.equal(amounts(movements),'$16.460,00');
 const conOtroOk=movements.map(r=>r.id==='2'?{...r,ok:true}:r);
 assert.equal(amounts(conOtroOk),'$10.420,00');
 assert.equal(amounts(movements),'$16.460,00','Al desmarcar debe volver a sumar');
 assert.equal(amounts(movements.map(r=>({...r,ok:true}))),'$0,00');
});
