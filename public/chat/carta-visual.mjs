// Piloto exclusivo de Prueba: comercio gastronómico conocido o demo de comida.
export function cartaVisualHabilitada(entorno, demo, slug) {
  return entorno === 'prueba' && (demo === true || ['mi-gusto-munro','mi-gusto-torcuato'].includes(slug));
}
export function productosVisuales(catalogo, categoria='', filtro='') {
  const normal = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const cats = new Map((catalogo.categorias || []).map((c,i)=>[c.id,i]));
  const buscar = normal(filtro);
  return (catalogo.productos || []).filter(p=>p.activo!==false && (!categoria || p.categoria_id===categoria) &&
    (!buscar || normal(p.nombre+' '+(p.descripcion||'')).includes(buscar)))
    .sort((a,b)=>(cats.get(a.categoria_id)??999)-(cats.get(b.categoria_id)??999) || (Number(a.orden)||0)-(Number(b.orden)||0) || String(a.nombre).localeCompare(String(b.nombre),'es',{numeric:true}));
}
export const pasoVisual = (i, delta, n) => n>0 ? ((i+delta)%n+n)%n : 0;

 // Carta estática de referencia de Mi Gusto, exclusivamente en Prueba.
export const CARTA_MI_GUSTO = Object.freeze([
 {id:'empanadas-sabores',titulo:'Empanadas clásicas y premium'},
 {id:'empanadas-promos',titulo:'Promociones de empanadas'},
 {id:'almuerzos',titulo:'Promociones de almuerzo'},
 {id:'pizzas-family',titulo:'Pizzas Family'},
 {id:'pizzas-indi-promos',titulo:'Pizzas INDI y promociones'}
].map(c=>Object.freeze({...c,url:'/chat/carta-mi-gusto/'+c.id+'.webp'})));
export function cartaMiGustoHabilitada(entorno, slug) {
 return entorno==='prueba' && ['mi-gusto-munro','mi-gusto-torcuato'].includes(slug);
}
export function consultaCartaMiGusto(texto) {
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
export function hojasCartaMiGusto(tipo='todo') {
 return CARTA_MI_GUSTO.filter(c=>tipo==='todo'||c.id===tipo||
 (tipo==='promos'&&['empanadas-promos','almuerzos','pizzas-indi-promos'].includes(c.id))||
 (tipo==='pizzas'&&c.id.startsWith('pizzas-')));
}
