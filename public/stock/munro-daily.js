/* GestLok · Conteo diario exclusivo de Munro.
   Los valores iniciales provienen únicamente de los tres ítems visibles
   en la captura de referencia. No importa ni inventa historiales de Claude. */
(() => {
  'use strict';

  const FIELDS = [
    ['inicio', 'Stock inicial'], ['remitos', '+ Remitos'],
    ['faltante', '− Faltante fábrica'], ['cancelados', '− Cancelados'],
    ['consumoManana', '− Consumo mañana'], ['ventasManana', '− Ventas mañana'],
    ['ventasNoche', '− Ventas noche'], ['consumoNoche', '− Consumo noche'],
    ['contado', 'Contado'], ['decomiso', 'Decomiso']
  ];
  const DEMO_DAY = '2026-10-24';
  const SEED = [
    {id:'empanadas',nombre:'Empanadas',categoria:'Empanadas',inicio:1339,remitos:810},
    {id:'pizza-indi',nombre:'Pizza Indi',categoria:'Pizzas',inicio:35,remitos:0},
    {id:'pizza-grande',nombre:'Pizza grande',categoria:'Pizzas',inicio:5,remitos:30}
  ];
  let api = null, registros = [], borrador = null, filtro = 'Todas';
  let edicion = false, comparar = false, ajustes = false, guardando = false, ultimaFecha = '';
  const $ = sel => document.querySelector(sel);
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const vnum = value => value === '' || value == null ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const n = value => Number(value) || 0;
  const f = value => Number.isFinite(value) ? value.toLocaleString('es-AR',{maximumFractionDigits:2}) : '—';
  const fecha = () => api?.S.diarioDia || api?.hoyISO() || new Date().toISOString().slice(0,10);
  const permitido = () => !!api && api.S.local === 'munro' &&
    (api.miRol() === 'creadora' ||
     (api.miRol() === 'gerente' && api.misLocales().includes('munro')));
  const editable = () => permitido() && api.canW() && !api.S.offline;
  const ordenados = arr => [...arr].sort((a,b) => (b.creado || 0) - (a.creado || 0));
  const catActiva = () => ordenados(registros.filter(r=>r.tipo === 'config'))[0]?.productos || SEED;
  const ultDia = () => ordenados(registros.filter(r=>r.tipo === 'cierre' && r.dia === fecha()))[0] || null;
  const registrosDia = () => ordenados(registros.filter(r=>r.tipo === 'cierre'));
  const baseDatos = () => {
    const previo = ultDia();
    const plantilla = catActiva();
    const base = Array.isArray(previo?.filas) ? previo.filas : plantilla.map(p => ({
      id:p.id, nombre:p.nombre, categoria:p.categoria,
      ...Object.fromEntries(FIELDS.map(([key])=>[key,null])),
      ...(fecha() === DEMO_DAY ? {inicio:p.inicio??null,remitos:p.remitos??null} : {})
    }));
    // La configuración incorpora productos nuevos sin borrar registros históricos.
    const ids = new Set(base.map(p=>p.id));
    for(const p of plantilla) if(!ids.has(p.id)) base.push({
      id:p.id,nombre:p.nombre,categoria:p.categoria,
      ...Object.fromEntries(FIELDS.map(([key])=>[key,null]))
    });
    return base.map(p => ({...p}));
  };
  const filas = () => borrador || baseDatos();
  const esperado = p => n(p.inicio)+n(p.remitos)-n(p.faltante)-n(p.cancelados)-
    n(p.consumoManana)-n(p.ventasManana)-n(p.ventasNoche)-n(p.consumoNoche)-n(p.decomiso);
  const diferencia = p => p.contado == null ? null : Number((n(p.contado)-esperado(p)).toFixed(2));
  const kpis = rows => ({
    sin: rows.filter(p=>p.contado == null).length,
    dif: rows.filter(p=>p.contado != null && Math.abs(diferencia(p)) > 0.001).length,
    dec: rows.reduce((a,p)=>a+n(p.decomiso),0),
    ventas:rows.reduce((a,p)=>a+n(p.ventasManana)+n(p.ventasNoche),0)
  });
  const badge = p => p.contado == null ? '<span class="md-badge pending">Falta contar</span>' :
    Math.abs(diferencia(p)) > 0.001 ? '<span class="md-badge diff">' + f(diferencia(p)) + '</span>' :
    '<span class="md-badge fine">✓ Coincide</span>';
  const campo = (p,k) => {
    if(!edicion || !editable()) return '<span class="md-read">' + (p[k] == null?'—':f(n(p[k]))) + '</span>';
    return '<input class="md-num" type="number" min="0" step="any" inputmode="decimal" data-md-id="' + E(p.id) +
      '" data-md-field="' + E(k) + '" value="' + (p[k] == null?'':E(String(p[k]))) + '" aria-label="' + E(k + ' de ' + p.nombre) + '">';
  };
  const encabezados = FIELDS.map(([,label])=>'<th scope="col">' + E(label) + '</th>').join('');
  const secciones = rows => {
    const grupos = [...new Set(rows.map(p=>p.categoria))].filter(c=>filtro==='Todas'||c===filtro);
    return grupos.map(categoria => {
      const grupo = rows.filter(p=>p.categoria===categoria);
      return '<section class="md-grupo"><div class="md-grupo-title"><h3>'+E(categoria)+'</h3><small>'+
        grupo.length + (grupo.length===1?' producto':' productos') + '</small></div>' +
        '<div class="md-scroll"><table class="md-tabla"><thead><tr><th>Producto</th>'+encabezados+
        '<th>Debería haber</th><th>Diferencia</th></tr></thead><tbody>' +
        grupo.map(p=>'<tr><th scope="row">'+E(p.nombre)+'</th>'+
          FIELDS.map(([key])=>'<td>'+campo(p,key)+'</td>').join('')+
          '<td class="md-expected" data-md-expected="'+E(p.id)+'">'+f(esperado(p))+'</td>'+
          '<td data-md-diff="'+E(p.id)+'">'+badge(p)+'</td></tr>').join('')+
        '</tbody></table></div></section>';
    }).join('');
  };
  const historial = () => {
    const entradas = registrosDia().slice(0,15);
    return '<details class="md-hist"><summary>Historial de guardados ('+registrosDia().length+')</summary>'+
      (entradas.length ? '<div class="md-scroll"><table><thead><tr><th>Fecha</th><th>Guardado</th><th>Productos</th><th>Cuenta</th></tr></thead><tbody>'+
      entradas.map(r=>'<tr><td>'+E(r.dia)+'</td><td>'+new Date(r.creado).toLocaleString('es-AR')+
        '</td><td>'+r.filas.length+'</td><td>'+E(r.autor||'Equipo')+'</td></tr>').join('')+
      '</tbody></table></div>' : '<p>Sin registros guardados todavía. Los próximos conteos conservarán su historial.</p>')+
      '</details>';
  };
  const compararHTML = rows => comparar ? '<section class="md-compare"><h3>Comparación de turnos</h3>'+
    '<div class="md-scroll"><table><thead><tr><th>Producto</th><th>Ventas mañana</th><th>Ventas noche</th><th>Consumo mañana</th><th>Consumo noche</th></tr></thead><tbody>'+
    rows.map(p=>'<tr><td>'+E(p.nombre)+'</td><td>'+f(n(p.ventasManana))+'</td><td>'+f(n(p.ventasNoche))+
      '</td><td>'+f(n(p.consumoManana))+'</td><td>'+f(n(p.consumoNoche))+'</td></tr>').join('')+
    '</tbody></table></div></section>' : '';
  const configHTML = () => ajustes ? '<section class="md-settings"><h3>Categorías y productos</h3>'+
    '<p>Estos ítems pertenecen solo a Munro. Agregar uno nuevo no elimina los historiales previos.</p>'+
    '<p>'+catActiva().map(p=>E(p.categoria+' · '+p.nombre)).join(' · ')+'</p>'+
    (editable()?'<form id="md-config-form" class="md-add">'+
      '<label>Categoría<input name="categoria" maxlength="70" required placeholder="Ej.: Bebidas"></label>'+
      '<label>Producto<input name="producto" maxlength="90" required placeholder="Ej.: Agua"></label>'+
      '<button class="btn primary" type="submit">Agregar producto</button></form>':'<small>Solo lectura o sin conexión.</small>')+
    '</section>' : '';
  function view(){
    if(!permitido()) return '<section class="sheet"><p>No tenés acceso a este módulo.</p></section>';
    if (ultimaFecha !== fecha()) { borrador=null; edicion=false; ultimaFecha=fecha(); }
    const rows = filas(), k = kpis(rows);
    const cats = [...new Set(rows.map(p=>p.categoria))];
    const categorias = ['Todas',...cats].map(c=>
      '<button class="md-chip'+(filtro===c?' active':'')+'" data-md-act="filter" data-md-cat="'+E(c)+'">'+
        E(c==='Todas'?'Todas '+rows.length:c+' '+rows.filter(p=>p.categoria===c).length)+'</button>').join('');
    const v = ultDia();
    const controls = editable()?'<button class="btn" data-md-act="edit">'+(edicion?'Cancelar edición':'Modificar')+'</button>'+
      (edicion?'<button class="btn primary" data-md-act="save"'+(guardando?' disabled':'')+'>Guardar</button>':'') : '';
    return '<section class="sheet md-page"><div class="md-top"><div><p class="eyebrow">Munro · Exclusivo</p>'+
      '<h1>Conteo diario</h1><small>'+ (v?'Último guardado: '+new Date(v.creado).toLocaleString('es-AR') : 'Plantilla inicial · no guardada')+
      '</small></div><div class="md-actions"><input id="diario-fecha" type="date" max="'+api.hoyISO()+'" value="'+E(fecha())+'">'+
      '<button class="btn" data-md-act="compare">Comparar turnos</button><button class="btn" data-md-act="export">Exportar CSV</button>'+
      '<button class="btn" data-md-act="print">Imprimir / PDF</button><button class="btn" data-md-act="settings">Ajustes</button></div></div>'+
      '<div class="md-stats"><article><small>Falta contar</small><b id="md-kpi-sin">'+k.sin+'</b><span>de '+rows.length+' productos</span></article>'+
      '<article><small>Con diferencia</small><b id="md-kpi-dif">'+k.dif+'</b><span>productos</span></article>'+
      '<article><small>Decomiso hoy</small><b id="md-kpi-dec">'+f(k.dec)+'</b><span>unidades</span></article></div>'+
      '<section class="md-ventas"><small>VENTAS HOY · TOTAL</small><strong id="md-kpi-ventas">'+f(k.ventas)+'</strong>'+
      '<div>'+cats.map(c=>'<span>'+E(c)+': '+f(rows.filter(p=>p.categoria===c).reduce((a,p)=>a+n(p.ventasManana)+n(p.ventasNoche),0))+'</span>').join('')+'</div></section>'+
      '<div class="md-filter">'+categorias+'</div>'+compararHTML(rows)+configHTML()+secciones(rows)+historial()+
      '<footer class="md-bottom"><small>'+ (api.S.offline?'Sin conexión · guardado bloqueado':'Nube · Los guardados conservan versiones')+
      '</small>'+controls+'</footer></section>';
  }
  function refreshNumbers(){
    const rows=filas(),k=kpis(rows);
    for(const [id,value] of [['md-kpi-sin',k.sin],['md-kpi-dif',k.dif],['md-kpi-dec',f(k.dec)],['md-kpi-ventas',f(k.ventas)]]){
      const target=$('#'+id);if(target)target.textContent=value;
    }
    for(const p of rows){
      const expected=document.querySelector('[data-md-expected="'+CSS.escape(p.id)+'"]');
      const diff=document.querySelector('[data-md-diff="'+CSS.escape(p.id)+'"]');
      if(expected) expected.textContent=f(esperado(p));
      if(diff) diff.innerHTML=badge(p);
    }
  }
  async function save(){
    if(!editable() || !edicion || guardando) return;
    const rows=filas();
    for(const row of rows)for(const [key] of FIELDS){
      const val=row[key];if(val!=null && (!Number.isFinite(val)||val<0||val>100000000)){
        api.toast('Revisá los valores antes de guardar.',true);return;
      }
    }
    guardando=true; api.render();
    try {
      await api.w(()=>api.C('munro_control').add({
        tipo:'cierre',dia:fecha(),filas:rows.map(p=>({...p})),autor:api.S.uid,creado:Date.now()
      }));
      borrador=null;edicion=false;
      api.toast('Conteo de Munro guardado; el historial anterior se conserva.');
    }catch(error){api.fail(error);}
    finally{guardando=false;api.render();}
  }
  async function addItem(form){
    if(!editable())return;
    const cat=form.elements.namedItem('categoria').value.trim();
    const name=form.elements.namedItem('producto').value.trim();
    if(!cat||!name)return;
    const current=catActiva();
    if(current.some(p=>p.nombre.toLowerCase()===name.toLowerCase())){
      api.toast('El producto ya existe.',true);return;
    }
    const id='md-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
    try{
      await api.w(()=>api.C('munro_control').add({tipo:'config',productos:[...current,{id,nombre:name,categoria:cat}],creado:Date.now(),autor:api.S.uid}));
      api.toast('Producto incorporado al catálogo exclusivo de Munro.');
    }catch(e){api.fail(e);}
  }
  function exportCSV(){
    const rows=filas();
    const keys=['Categoria','Producto',...FIELDS.map(([k,label])=>label),'Debería haber','Diferencia'];
    const data=[keys,...rows.map(p=>[p.categoria,p.nombre,...FIELDS.map(([key])=>p[key]??''),esperado(p),diferencia(p)??''])];
    const csv='\ufeff'+data.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='conteo-diario-munro-'+fecha()+'.csv';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function reset(){
    registros=[];borrador=null;filtro='Todas';edicion=false;comparar=false;ajustes=false;guardando=false;ultimaFecha='';
  }
  function subscribe(loc,push){
    if(loc!=='munro'||!permitido())return;
    push(api.C('munro_control').onSnapshot(snap=>{
      if(api.S.local!==loc)return;
      registros=snap.docs.map(d=>({id:d.id,...d.data()}));
      if(api.S.view==='diario'&&!edicion)api.render();
    },api.fail));
  }
  function attach(h){
    api=h;
    document.addEventListener('click',event=>{
      const btn=event.target.closest('[data-md-act]');if(!btn)return;
      if(!permitido())return;
      const act=btn.dataset.mdAct;
      if(act==='edit'){edicion=!edicion;borrador=edicion?filas().map(p=>({...p})):null;api.render();}
      if(act==='save')save();
      if(act==='filter'){filtro=btn.dataset.mdCat;api.render();}
      if(act==='compare'){comparar=!comparar;api.render();}
      if(act==='settings'){ajustes=!ajustes;api.render();}
      if(act==='export')exportCSV();
      if(act==='print')window.print();
    });
    document.addEventListener('input',event=>{
      const el=event.target;
      if(!el.matches('[data-md-field]')||!edicion||!editable())return;
      if(!borrador)borrador=baseDatos();
      const row=borrador.find(p=>p.id===el.dataset.mdId);if(!row)return;
      const x=el.value===''?null:Number(el.value);
      row[el.dataset.mdField]=Number.isFinite(x)?x:null;
      refreshNumbers();
    });
    document.addEventListener('submit',event=>{
      if(event.target.id!=='md-config-form')return;
      event.preventDefault();addItem(event.target);
    });
  }
  window.GestLokMunroDaily={attach,view,reset,subscribe,permitido};
})();
