/* Plan Scanner: registrar pago recibido y descontar stock exclusivamente en la RPC.
 * El tenant real proviene de la sesion y el servidor vuelve a validar la autorizacion.
 */
(function(root){
'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function checkout({db,lines,payment,payments,methods,total,requestId,tenantId}){
 if(!db||typeof db.rpc!=='function')throw Error('Conexion de ventas no disponible.');
 if(!root.GestLokPilot?.authorized?.())throw Error('Acceso no autorizado.');
 const tenant=root.GestLokPilot?.tenantId?.();
 if(!tenant||!UUID.test(tenant)||tenantId&&tenantId!==tenant)throw Error('Sucursal no autorizada.');
 if(!Array.isArray(lines)||lines.length<1||lines.length>100)throw Error('Carrito invalido.');
 if(!payments&&!['efectivo','transferencia'].includes(payment))throw Error('Medio de pago invalido.');
 if(payments&&!root.GestLokPosPayments?.validateSplit)throw Error('Validación de pagos combinados no disponible.');
 const cleanPayments=payments?root.GestLokPosPayments.validateSplit({total,parts:payments,methods}):null;
 if(!requestId&&!root.crypto?.randomUUID)throw Error('Identificador seguro no disponible.');
 const id=requestId||root.crypto.randomUUID();
 if(!UUID.test(id))throw Error('Identificador de venta invalido.');
 const clean=lines.map(line=>{
  if(!UUID.test(String(line.product_id||''))||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>999)
   throw Error('Producto o cantidad invalida.');
  return {product_id:line.product_id,quantity:line.quantity};
 });
 const {data,error}=cleanPayments?await db.rpc('gestlok_pos_checkout_split',{
  p_tenant:tenant,p_request:id,p_payments:cleanPayments,p_lines:clean
 }):await db.rpc('gestlok_pos_checkout',{
  p_tenant:tenant,p_request:id,p_payment:payment,p_lines:clean
 });
 if(error){
  const err=new Error(error.message||'No se pudo registrar la venta.');
  err.code=error.code;
  throw err;
 }
 if(!UUID.test(String(data||'')))throw Error('El servidor no confirmo el identificador de la venta. Reintenta sin modificar el carrito.');
 return {saleId:data,requestId:id,tenantId:tenant};
}
const api=Object.freeze({checkout});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosCheckout=api;
})(typeof window!=='undefined'?window:globalThis);
