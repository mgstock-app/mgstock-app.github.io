/* GESTLOK POS: pure validation only; no database writes. */
(function(root){
'use strict';
function prepareSale(items,stock){
 if(!Array.isArray(items)||!items.length) throw Error('Venta vacía');
 const qtyById={};let totalCents=0;
 const lines=items.map(item=>{
  const id=String(item.id||'').trim(),qty=Number(item.quantity),price=Number(item.price);
  if(!id||!Number.isSafeInteger(qty)||qty<=0||!Number.isFinite(price)||price<0) throw Error('Producto o cantidad inválida');
  const cents=Math.round(price*100);
  if(!Number.isSafeInteger(cents)) throw Error('Precio inválido');
  qtyById[id]=(qtyById[id]||0)+qty;totalCents+=qty*cents;
  return {id,quantity:qty,unitCents:cents};
 });
 if(!Number.isSafeInteger(totalCents)) throw Error('Total inválido');
 for(const [id,qty] of Object.entries(qtyById)){
  if(!Number.isSafeInteger(stock[id])||stock[id]<qty) throw Error('Stock insuficiente: '+id);
 }
 return {lines,totalCents,remaining:Object.fromEntries(Object.entries(qtyById).map(([id,qty])=>[id,stock[id]-qty]))};
}
const api=Object.freeze({prepareSale});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosCore=api;
})(typeof window!=='undefined'?window:globalThis);
