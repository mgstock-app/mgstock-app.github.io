/* Checkout API client: never modifies inventory directly.
 * Requires deployed gestlok_pos_checkout RPC and authenticated pilot owner.
 */
(function(root){
'use strict';
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
async function checkout({db,lines,payment,requestId}){
 if(!db||typeof db.rpc!=='function')throw Error('Conexión de ventas no disponible.');
 if(!root.GestLokPilot?.authorized?.())throw Error('Acceso no autorizado.');
 if(!Array.isArray(lines)||lines.length<1||lines.length>100)throw Error('Carrito inválido.');
 if(!['efectivo','transferencia'].includes(payment))throw Error('Medio de pago inválido.');
 if(!root.crypto?.randomUUID&&!requestId)throw Error('Identificador seguro no disponible.');
 const id=requestId||root.crypto.randomUUID();
 const clean=lines.map(line=>{
  if(!/^[0-9a-f-]{36}$/i.test(String(line.product_id||''))||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>999)
   throw Error('Producto o cantidad inválida.');
  return {product_id:line.product_id,quantity:line.quantity};
 });
 const {data,error}=await db.rpc('gestlok_pos_checkout',{p_request:id,p_payment:payment,p_lines:clean});
 if(error)throw Error(error.message||'No se pudo registrar la venta.');
 return {saleId:data,requestId:id,tenantId:TENANT};
}
const api=Object.freeze({checkout});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosCheckout=api;
})(typeof window!=='undefined'?window:globalThis);
