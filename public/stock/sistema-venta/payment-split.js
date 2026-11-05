/* Plan Scanner: validación de pagos individuales y combinados, sin modificar caja. */
(function(root){
'use strict';
const ID=/^[a-z][a-z0-9_-]{1,39}$/;
const cents=value=>{
 if(typeof value!=='number'&&typeof value!=='string')throw Error('Importe inválido.');
 const text=String(value).trim();
 if(!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(text))throw Error('Importe inválido.');
 const [whole,fraction='']=text.split('.');
 const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(n))throw Error('Importe fuera de rango.');
 return n;
};
function normalizeMethods(methods){
 if(!Array.isArray(methods)||!methods.length)throw Error('El local no tiene medios de pago habilitados.');
 const ids=new Set();
 return methods.map(method=>{
  const id=String(method?.id||'').trim().toLowerCase();
  if(!ID.test(id)||ids.has(id)||method?.enabled===false)throw Error('Configuración de medios de pago inválida.');
  ids.add(id);
  return {id,label:String(method.label||id).trim().slice(0,60)};
 });
}
function validateSplit({total,parts,methods}){
 const allowed=new Set(normalizeMethods(methods).map(x=>x.id));
 const target=cents(total);
 if(!target)throw Error('La venta debe tener un total mayor que cero.');
 if(!Array.isArray(parts)||!parts.length||parts.length>20)throw Error('Distribución de pago inválida.');
 const combined=new Map();
 for(const part of parts){
  const method=String(part?.method||'').trim().toLowerCase();
  if(!allowed.has(method))throw Error('Medio de pago no habilitado para este local.');
  const amount=cents(part?.amount);
  if(amount<=0)throw Error('Cada importe debe ser mayor que cero.');
  combined.set(method,(combined.get(method)||0)+amount);
 }
 const sum=[...combined.values()].reduce((a,b)=>a+b,0);
 if(sum!==target)throw Error('Los pagos deben sumar exactamente el total de la venta.');
 return [...combined].map(([method,amountCents])=>({method,amount:amountCents/100}));
}
const api=Object.freeze({normalizeMethods,validateSplit});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosPayments=api;
})(typeof window!=='undefined'?window:globalThis);
