export const CARTA_MARCA = Object.freeze([
 {id:'empanadas-sabores',titulo:'Empanadas clásicas y premium'},
 {id:'empanadas-promos',titulo:'Promociones de empanadas'},
 {id:'almuerzos',titulo:'Promociones de almuerzo'},
 {id:'pizzas-family',titulo:'Pizzas Family'},
 {id:'pizzas-indi-promos',titulo:'Pizzas INDI y promociones'}
].map(c=>Object.freeze({...c,url:'/chat/carta-mi-gusto/'+c.id+'.webp'})));
export function cartaMarcaHabilitada(entorno, sucursal, slug, demo=false) {
 return !demo && entorno==='produccion' && sucursal?.carta_visual_marca === 'mi-gusto' && sucursal.slug===slug;
}
export function consultaCartaMarca(texto) {
 const t=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(!t || /\b(cancel|reclamo|pedido en curso|estado del pedido|pagar|quiero pedir|quiero comprar|agrega|agregame|pedir)\b/.test(t))return null;
 const consulta=/\b(carta|menu|promo(?:s|ciones|cion)?|ofertas?|combos?|gustos?|sabores?|precios?|cuanto|docena|almorzar|almuerzo|que (?:pizzas|empanadas))\b/.test(t);
 if(!consulta)return null;
 if(/\b(almuerzo|almorzar|mediodia)\b/.test(t))return 'almuerzos';
 if(/\b(indi|individual(?:es)?|4 porciones)\b/.test(t))return 'pizzas-indi-promos';
 if(/\b(family|grandes?|8 porciones)\b/.test(t)&&/pizza|family|porciones/.test(t))return 'pizzas-family';
 if(/\b(docena|pack(?:s)?)\b/.test(t)||(/empanadas?/.test(t)&&/promo|combo|oferta/.test(t)))return 'empanadas-promos';
 if(/empanadas?/.test(t))return 'empanadas-sabores';
 if(/pizzas?/.test(t))return 'pizzas';
 return /promo|combo|oferta/.test(t)?'promos':'todo';
}
export function hojasCartaMarca(tipo='todo') {
 return CARTA_MARCA.filter(c=>tipo==='todo'||c.id===tipo||
 (tipo==='promos'&&['empanadas-promos','almuerzos','pizzas-indi-promos'].includes(c.id))||
 (tipo==='pizzas'&&c.id.startsWith('pizzas-')));
}
