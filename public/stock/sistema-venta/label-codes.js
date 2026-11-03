/* POS internal identifiers. A database UNIQUE(tenant_id,sku) constraint is required
 * before enabling multi-user product creation; never rely on browser-only uniqueness.
 */
(function(root){
'use strict';
function createInternalCode(prefix='GL'){
 const clean=String(prefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
 if(!clean)throw Error('Prefijo inválido');
 if(!root.crypto?.randomUUID)throw Error('Se requiere un navegador seguro para generar códigos.');
 return clean+'-'+root.crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();
}
function validCode(code){
 return typeof code==='string'&&/^[A-Z0-9][A-Z0-9-]{2,79}$/.test(code);
}
function labelModel(product){
 if(!product||!validCode(product.sku)||!String(product.name||'').trim())
  throw Error('Producto sin nombre o código válido.');
 const price=product.unit_price==null?null:Number(product.unit_price);
 if(price!==null&&(!Number.isFinite(price)||price<0))throw Error('Precio inválido.');
 return {name:String(product.name).trim().slice(0,140),code:product.sku,price};
}
const api=Object.freeze({createInternalCode,validCode,labelModel});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosLabels=api;
})(typeof window!=='undefined'?window:globalThis);
