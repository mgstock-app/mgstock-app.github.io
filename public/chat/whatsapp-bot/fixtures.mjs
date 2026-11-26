// Fictitious catalog ONLY. No customer information, backend or credentials.
const products=[
 {id:'carne',nombre:'Empanada de carne',precio:1900,categoria_id:'emp'},
 {id:'jyq',nombre:'Jamón y queso',precio:1900,categoria_id:'emp'},
 {id:'pollo',nombre:'Empanada de pollo',precio:1900,categoria_id:'emp'},
 {id:'queso',nombre:'Cuatro quesos',precio:2100,categoria_id:'emp'},
 {id:'veg',nombre:'Verdura',precio:1900,categoria_id:'emp'},
 {id:'agotada',nombre:'Caprese',precio:1900,categoria_id:'emp',disponible:false},
 {id:'pack',nombre:'Promo 6 empanadas + 2 salsas',precio:9900,categoria_id:'promo',es_promocion:true,opciones:[
  {id:'emp',nombre:'Variedades de empanadas',tipo:'cantidad',total:6,valores:[{id:'carne',nombre:'Carne',producto_id:'carne'},{id:'jyq',nombre:'Jamón y queso',producto_id:'jyq'},{id:'pollo',nombre:'Pollo',producto_id:'pollo'},{id:'queso',nombre:'Cuatro quesos',producto_id:'queso'},{id:'veg',nombre:'Verdura',producto_id:'veg'},{id:'agotada',nombre:'Caprese',producto_id:'agotada'}]},
  {id:'salsa',nombre:'Salsas',tipo:'cantidad',total:2,valores:[{id:'ajo',nombre:'Ajo'},{id:'criolla',nombre:'Criolla'}]}
 ]},
 {id:'agua',nombre:'Agua mineral',precio:1500,categoria_id:'beb'},
 {id:'gaseosa',nombre:'Gaseosa',precio:2500,categoria_id:'beb'}
].map(p=>({activo:true,disponible:true,opciones:[],...p}));
export function fixture(local='munro'){
 if(!['munro','torcuato'].includes(local))throw Error('Local de prueba inválido');
 const tor=local==='torcuato';
 return {identity:{empresa:'empresa-demo',sucursal:local+'-demo',phone:'+5491100000000'},
  sucursal:{nombre:(tor?'Don Torcuato':'Munro')+' · ficticio',empresa:'Mi Gusto · ensayo',slug:local+'-demo',acepta_retiro:true,acepta_envio:true,envio_costo:tor?1800:1500,medios_pago:['efectivo','debito','transferencia'],medios_pago_envio:['efectivo','transferencia'],medios_pago_retiro:['debito','efectivo'],demora_envio:'30 a 40 minutos',menu_interactivo:true},
  catalogo:{categorias:[{id:'promo',nombre:'Promociones'},{id:'emp',nombre:'Empanadas'},{id:'beb',nombre:'Bebidas'}],productos:structuredClone(products).map(p=>({...p,precio:p.precio+(tor?100:0)}))}};
}
