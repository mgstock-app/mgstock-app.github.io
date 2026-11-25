// Piloto local: sugerencias de texto, sin lectura ni envío en WhatsApp.
export const scenarios=Object.freeze([
 {label:'Carta y precios',message:'Hola, ¿me pasás la carta?',intent:'carta'},
 {label:'Hacer pedido',message:'Quiero pedir una docena de empanadas',intent:'pedido'},
 {label:'Entrega',message:'¿Hacen delivery?',intent:'entrega'},
 {label:'Reclamo',message:'Mi pedido llegó frío',intent:'humano'}
]);
export function draft(message){
 const t=String(message??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(!t||t.length>1000)return {kind:'invalid',text:''};
 if(/reclamo|frio|faltan|equivoc|devolucion|demora|no lleg|cobrar|cobraron/.test(t))return {kind:'humano',text:'Lamentamos el inconveniente. ¿Nos indicás el número de pedido? Un integrante del local va a revisar tu caso.'};
 if(/pedido|pedir|docena|quiero|comprar/.test(t))return {kind:'pedido',text:'¡Hola! Con gusto te tomamos el pedido por acá. ¿Qué productos y cantidades querés? ¿Es para retirar o para envío a domicilio?'};
 if(/carta|menu|precio|promo|sabor/.test(t))return {kind:'carta',text:'¡Hola! Te compartimos la carta y las promociones vigentes por acá. ¿Preferís ver empanadas o pizzas?'};
 if(/delivery|envio|domicilio|entrega/.test(t))return {kind:'entrega',text:'¿Nos indicás tu dirección y localidad? Verificamos la zona de entrega y el costo antes de confirmar.'};
 if(/horario|abierto|cerrado/.test(t))return {kind:'humano',text:'¡Hola! Consultamos el horario de atención del local y te confirmamos por acá.'};
 return {kind:'humano',text:'¡Hola! Gracias por comunicarte. ¿En qué podemos ayudarte? Un integrante del local revisará tu consulta.'};
}
