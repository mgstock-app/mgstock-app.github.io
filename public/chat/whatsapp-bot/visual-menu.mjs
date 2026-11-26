// Existing Mi Gusto menu sheets, converted to WhatsApp-compatible JPEG.
// Trusted server configuration only: no client-supplied URLs, no media for
// other brands. The order engine remains the source of current prices.
const sheets=Object.freeze([
 {id:'empanadas-sabores',label:'Empanadas',title:'Empanadas clásicas y premium',groups:['all']},
 {id:'empanadas-promos',label:'Promos de empanadas',title:'Promociones de empanadas',groups:['all','promos']},
 {id:'almuerzos',label:'Promos de almuerzo',title:'Promociones de almuerzo',groups:['all','promos']},
 {id:'pizzas-family',label:'Pizzas Family',title:'Pizzas Family',groups:['all']},
 {id:'pizzas-indi-promos',label:'Pizzas INDI y promos',title:'Pizzas INDI y promociones',groups:['all','promos']}
].map(Object.freeze));
const origins=new Set(['https://gestlok-prueba.vercel.app','https://gestlok-testing.vercel.app']);
export function visualMenuFor({identity,sucursal,origin,demonstration=false}){
 if(!origins.has(origin))return null; // Until production media is verified and enabled.
 const demo=demonstration===true&&identity?.empresa==='empresa-demo'&&
  ['munro-demo','torcuato-demo'].includes(identity.sucursal)&&sucursal?.slug===identity.sucursal;
 const brand=sucursal?.carta_visual_marca==='mi-gusto'&&['mi-gusto-munro','mi-gusto-torcuato'].includes(sucursal.slug);
 if(!demo&&!brand)return null;
 return {brand:'mi-gusto',origin,demo,sheets:sheets.map(s=>({...s,link:origin+'/chat/whatsapp-bot/cartas/'+s.id+'.jpg'}))};
}
const normalize=t=>String(t??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function visualIntent(text){
 const t=normalize(text);
 // Never interrupt the order engine for amounts, payment, status, complaints,
 // explicit product orders or commands that happen to mention a promo.
 if(!t||/\b(?:reclamo|cancelar|demora|faltante|estado|pagar|pago|comprar|pedir|agregar|agregame|confirmar)\b/.test(t)||/\b\d+\b/.test(t)&&/\b(?:quiero|dame|mandame|agrega)\b/.test(t))return null;
 if(/\b(?:promos?|promociones|promocion|ofertas?)\b/.test(t))return 'promos';
 if(/\b(?:carta|menu)\b/.test(t))return 'all';
 return null;
}
export function visualCategories(menu,group='all'){
 return menu.sheets.filter(s=>s.groups.includes(group)).map(s=>({id:'visual:sheet:'+s.id,label:s.label,value:''}));
}
export function visualSheet(menu,id){return menu.sheets.find(s=>s.id===id);}
