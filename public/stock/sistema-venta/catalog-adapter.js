/* Pure adapter for Cami's existing gestlok_pilot_products catalog. */
(function(root){
'use strict';
function catalog(rows){
 if(!Array.isArray(rows))throw Error('Catálogo inválido');
 return rows.filter(p=>p&&p.active===true).map(p=>({
  id:String(p.id),name:String(p.name||''),barcode:String(p.sku||''),
  price:p.unit_price===null?null:Number(p.unit_price),
  stock:p.stock_quantity===null?null:Number(p.stock_quantity)
 }));
}
function lookup(rows,code){
 const needle=String(code||'').trim();
 if(!needle)return null;
 return catalog(rows).find(p=>p.barcode===needle)||null;
}
const api=Object.freeze({catalog,lookup});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosCatalog=api;
})(typeof window!=='undefined'?window:globalThis);
