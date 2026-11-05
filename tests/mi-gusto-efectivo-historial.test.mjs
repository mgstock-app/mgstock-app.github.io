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

test('Total descuentos: suma solamente la columna Descuento de pagos en efectivo, sin incluir transferencias',()=>{
 const segundo={...cashMovement,id:'33333333-3333-4333-8333-333333333333',comanda:'32',gross_amount:19600,discount_amount:1960,amount:17640,ok:false};
 const transferencia={...transferMovement,discount_amount:5000};
 const turno={...closed,status:'abierto',movements:[cashMovement,segundo,transferencia]};
 const html=window.__test.cashMovementDetail(turno);
 const m=html.match(/data-mgon-total-discounts>([^<]+)<\/strong>/);
 assert.ok(m,'El resumen Total descuentos debe mostrarse sobre la tabla');
 assert.equal(m[1].replace(/\s/g,''),'$2.060,00');
 assert.match(html,/Solo pagos en efectivo/);
 const archivado=window.__test.reportTurn({...turno,status:'cerrado'},'manana');
 const totalArchivado=archivado.match(/data-mgon-total-discounts>([^<]+)<\/strong>/);
 assert.ok(totalArchivado);
 assert.equal(totalArchivado[1].replace(/\s/g,''),'$2.060,00');
});
