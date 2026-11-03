/* Pure cash register calculations for Zayro POS.
 * Financial records must ultimately be persisted and verified server-side.
 */
(function(root){
'use strict';
function cents(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||Math.round(value*100)!==value*100)
  throw Error('Importe inválido');
 return Math.round(value*100);
}
function calculateClose({openingCash=0,sales=[],cashExpenses=0,countedCash}){
 const opening=cents(openingCash),expenses=cents(cashExpenses);
 if(!Array.isArray(sales))throw Error('Ventas inválidas');
 let cash=0,transfers=0;
 const ids=new Set();
 for(const sale of sales){
  if(!sale||typeof sale.id!=='string'||!sale.id||ids.has(sale.id))throw Error('Venta duplicada o inválida');
  ids.add(sale.id);
  const amount=cents(sale.total);
  if(sale.payment_method==='efectivo')cash+=amount;
  else if(sale.payment_method==='transferencia')transfers+=amount;
  else throw Error('Medio de pago inválido');
 }
 const expected=opening+cash-expenses;
 if(expected<0)throw Error('Efectivo esperado negativo: revisar gastos');
 const counted=countedCash===undefined||countedCash===null?null:cents(countedCash);
 return Object.freeze({
  cashSales:cash/100,transferSales:transfers/100,
  salesTotal:(cash+transfers)/100,expectedCash:expected/100,
  countedCash:counted===null?null:counted/100,
  difference:counted===null?null:(counted-expected)/100,
  saleCount:ids.size
 });
}
const api=Object.freeze({calculateClose});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosCash=api;
})(typeof window!=='undefined'?window:globalThis);
