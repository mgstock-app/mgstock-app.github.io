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
