/* GestLok · recorrido administrativo ficticio exclusivo de la creadora.
   Todos los cambios viven solo en memoria de esta pestaña: NO consulta ni escribe en Supabase. */
(() => {
  'use strict';
  const sample = () => ({
    productos: [
      {id:'p1',sku:'CAF-500',nombre:'Café en grano 500 g',cat:'Almacén',stock:18,min:8,precio:8500,proveedor:'Distribuidora Norte'},
      {id:'p2',sku:'CHOC-100',nombre:'Chocolate con leche 100 g',cat:'Almacén',stock:4,min:10,precio:1200,proveedor:'Mayorista Central'},
      {id:'p3',sku:'AGUA-15',nombre:'Agua mineral 1,5 L',cat:'Bebidas',stock:35,min:12,precio:900,proveedor:'Bebidas del Sur'},
      {id:'p4',sku:'PAPA-150',nombre:'Papas clásicas 150 g',cat:'Snacks',stock:2,min:10,precio:1300,proveedor:'Distribuidora Norte'},
      {id:'p5',sku:'GASE-225',nombre:'Gaseosa cola 2,25 L',cat:'Bebidas',stock:20,min:10,precio:2400,proveedor:'Bebidas del Sur'},
      {id:'p6',sku:'GAL-250',nombre:'Galletitas de vainilla',cat:'Almacén',stock:16,min:6,precio:1500,proveedor:'Mayorista Central'},
      {id:'p7',sku:'TE-20',nombre:'Té en saquitos x 20',cat:'Almacén',stock:0,min:5,precio:1750,proveedor:'Mayorista Central'},
      {id:'p8',sku:'JUGO-1',nombre:'Jugo de naranja 1 L',cat:'Bebidas',stock:14,min:7,precio:1950,proveedor:'Bebidas del Sur'}
    ],
    pedidos:[
      {id:'DEM-104',cliente:'Cliente de ejemplo A',canal:'Instagram',producto:'Café en grano',total:17000,estado:'Nuevo'},
      {id:'DEM-103',cliente:'Cliente de ejemplo B',canal:'WhatsApp',producto:'Chocolate y papas',total:3700,estado:'Preparando'},
      {id:'DEM-102',cliente:'Cliente de ejemplo C',canal:'Marketplace',producto:'Gaseosa cola',total:4800,estado:'Listo'},
      {id:'DEM-101',cliente:'Cliente de ejemplo D',canal:'Sitio externo',producto:'Galletitas',total:3000,estado:'Entregado'}
    ],
    proveedores:[
      {nombre:'Distribuidora Norte',rubro:'Snacks y café',contacto:'Contacto de ejemplo',pedido:'2 productos para reponer'},
      {nombre:'Mayorista Central',rubro:'Almacén',contacto:'Contacto de ejemplo',pedido:'2 productos para reponer'},
      {nombre:'Bebidas del Sur',rubro:'Bebidas',contacto:'Contacto de ejemplo',pedido:'Sin faltantes'}
    ]
  });
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n)||0);
  const estados = ['Nuevo','Preparando','Listo','Entregado','Cancelado'];
  let api = null, data=sample(), tab='resumen', query='', filter='todos', seq=100;
  const ok = () => !!api?.isCreadora?.();
  const alertas = p => Number(p.stock) <= Number(p.min);
  const falta = p => Math.max(0,Number(p.min)-Number(p.stock));
  const render = () => api?.render?.();
  const label = str => '<span class="gl-demo-chip">'+str+'</span>';
  function reset(){ data=sample(); tab='resumen'; query='';filter='todos';seq=100; }
  function summary(){
    const stockBajo=data.productos.filter(alertas);
    const pend=data.pedidos.filter(p=>!['Entregado','Cancelado'].includes(p.estado));
    return `<section class="gl-demo-metrics">
      <article><small>Productos organizados</small><strong>${data.productos.length}</strong><span>Catálogo interno</span></article>
      <article><small>Alertas de stock</small><strong>${stockBajo.length}</strong><span>Necesitan reposición</span></article>
      <article><small>Pedidos pendientes</small><strong>${pend.length}</strong><span>Por preparar o entregar</span></article>
      <article><small>Proveedores</small><strong>${data.proveedores.length}</strong><span>Contactos de ejemplo</span></article>
    </section>
    <div class="gl-demo-two">
      <section class="card pad"><div class="gl-demo-section-title"><h3>Prioridades del día</h3><button class="btn sm" data-demo-tab="productos">Ver inventario</button></div>
      ${stockBajo.map(p=>`<article class="gl-demo-line"><div><b>${esc(p.nombre)}</b><small>${esc(p.sku)} · Mínimo ${p.min}</small></div><span class="gl-demo-critical">Faltan ${falta(p)}</span></article>`).join('') || '<p class="lead">Sin faltantes.</p>'}
      </section>
      <section class="card pad"><div class="gl-demo-section-title"><h3>Pedidos a organizar</h3><button class="btn sm" data-demo-tab="pedidos">Gestionar pedidos</button></div>
      ${pend.slice(0,4).map(p=>`<article class="gl-demo-line"><div><b>${esc(p.id)} · ${esc(p.cliente)}</b><small>${esc(p.producto)} · ${esc(p.canal)}</small></div>${label(esc(p.estado))}</article>`).join('')}
      </section>
    </div>
    <section class="card pad"><h3>Organización de una tienda online</h3><p class="lead">El negocio registra sus ventas recibidas en WhatsApp, redes o plataformas externas, controla productos y organiza pedidos y proveedores desde GestLok. No vende directamente a compradores desde esta aplicación.</p></section>`;
  }
  function products() {
    const rows=data.productos.filter(p=>
      (filter==='todos'||(filter==='faltantes'&&alertas(p))||(filter==='disponibles'&&!alertas(p))) &&
      (!query||[p.nombre,p.sku,p.cat,p.proveedor].join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))));
    return `<section class="card pad"><div class="gl-demo-section-title"><div><h3>Productos y stock</h3><p class="lead">SKU, categoría, proveedor, stock mínimo y precio de referencia.</p></div></div>
      <div class="gl-demo-tools">
        <label>Buscar producto<input id="gl-demo-search" type="search" value="${esc(query)}" placeholder="Buscar por nombre, SKU o proveedor"></label>
        <label>Estado<select id="gl-demo-filter"><option value="todos" ${filter==='todos'?'selected':''}>Todos</option><option value="faltantes" ${filter==='faltantes'?'selected':''}>Con alerta</option><option value="disponibles" ${filter==='disponibles'?'selected':''}>Sobre el mínimo</option></select></label>
      </div>
      <div class="gl-demo-table-scroll"><table class="gl-demo-table"><thead><tr><th>Producto / SKU</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Precio ref.</th><th>Proveedor</th></tr></thead><tbody id="gl-demo-table">${rowsHTML(rows)}</tbody></table></div>
      <p class="note">Modificar stock acá es solo una simulación; no se guarda en ningún local real.</p>
    </section>
    <form class="card pad gl-demo-add" id="gl-demo-add"><h3>Simular alta de producto</h3>
      <div class="gl-demo-fields">
        <label>Producto<input name="nombre" maxlength="100" required placeholder="Nombre ficticio"></label>
        <label>SKU<input name="sku" maxlength="35" required placeholder="COD-001"></label>
        <label>Categoría<input name="cat" maxlength="60" required placeholder="Almacén"></label>
        <label>Unidades<input name="stock" type="number" min="0" max="100000" value="10" required></label>
        <label>Mínimo<input name="min" type="number" min="0" max="100000" value="5" required></label>
        <label>Precio de referencia<input name="precio" type="number" min="0" max="99999999" step="0.01" value="1000" required></label>
      </div><button type="submit" class="btn primary">Agregar producto ficticio</button></form>`;
  }
  function rowsHTML(rows){
    return rows.length ? rows.map(p=>`<tr>
      <td><strong>${esc(p.nombre)}</strong><small>${esc(p.sku)}</small></td><td>${esc(p.cat)}</td>
      <td><input aria-label="Stock ${esc(p.nombre)}" data-demo-stock="${esc(p.id)}" type="number" min="0" max="100000" value="${p.stock}"></td>
      <td>${p.min}</td><td>${money(p.precio)}</td><td>${esc(p.proveedor)}</td>
      </tr>`).join('') : '<tr><td colspan="6">No hay productos que coincidan.</td></tr>';
  }
  function orders(){
    return `<section class="card pad"><h3>Seguimiento de pedidos</h3><p class="lead">Ingresados manualmente desde redes, WhatsApp o una plataforma externa. Gestioná el estado sin enviar mensajes reales.</p>
     <div class="gl-demo-order-list">${data.pedidos.map(p=>`<article class="gl-demo-order"><div><b>${esc(p.id)} · ${esc(p.cliente)}</b><small>${esc(p.canal)} · ${esc(p.producto)}</small><strong>${money(p.total)}</strong></div>
      <label>Estado<select data-demo-order="${esc(p.id)}">${estados.map(e=>`<option ${e===p.estado?'selected':''}>${esc(e)}</option>`).join('')}</select></label></article>`).join('')}</div></section>`;
  }
  function suppliers(){
    return `<section class="card pad"><h3>Organización de proveedores</h3><p class="lead">Cada empresa administra sus propios contactos y puede planificar reposiciones desde el stock mínimo.</p>
      <div class="gl-demo-suppliers">${data.proveedores.map(p=>`<article><div><b>${esc(p.nombre)}</b><small>${esc(p.rubro)} · ${esc(p.contacto)}</small></div><span>${esc(p.pedido)}</span></article>`).join('')}</div>
      <p class="note">Contactos ficticios: no se envían pedidos ni WhatsApp desde la demo.</p></section>`;
  }
  function reports(){
    const cats=[...new Set(data.productos.map(p=>p.cat))];
    return `<section class="card pad"><h3>Reportes de gestión</h3><p class="lead">Resumen administrativo simulado por categoría, alertas de reposición y estados de pedidos.</p>
      <div class="gl-demo-two">
        <div><h4>Stock por categoría</h4>${cats.map(c=>{const ps=data.productos.filter(p=>p.cat===c);return `<article class="gl-demo-line"><b>${esc(c)}</b><span>${ps.reduce((n,p)=>n+p.stock,0)} unidades</span></article>`}).join('')}</div>
        <div><h4>Pedidos por estado</h4>${estados.map(e=>`<article class="gl-demo-line"><b>${e}</b><span>${data.pedidos.filter(p=>p.estado===e).length}</span></article>`).join('')}</div>
      </div><p class="note">Son indicadores ficticios; no representan ventas reales ni calculan facturación.</p>
    </section>`;
  }
  function view(){
    if(!ok())return '';
    const titles={resumen:'Panel operativo',productos:'Productos y stock',pedidos:'Pedidos',proveedores:'Proveedores',reportes:'Reportes'};
    const tabs=Object.keys(titles);
    return `<main class="gl-demo" id="gl-admin-demo" aria-label="Demo administrativa de tienda online">
      <header class="gl-demo-head"><div><p class="eyebrow">GESTLOK / VISTA DE PRUEBA</p><h1>Gestión de tienda online</h1><p>Una empresa ficticia, con productos y pedidos de ejemplo.</p></div><button class="btn" data-act="admin-demo-close" type="button">← Volver a administración</button></header>
      <div class="gl-demo-banner" role="status"><span>DEMO FICTICIA · SIN GUARDADO</span><p>Probá las secciones y cambiá cantidades o estados. Nada se envía, publica o registra en la empresa de Gisela ni en otras empresas.</p><button class="btn sm" type="button" data-demo-reset>Reiniciar demo</button></div>
      <nav class="gl-demo-nav" aria-label="Secciones de la demo">${tabs.map(id=>`<button type="button" data-demo-tab="${id}" aria-current="${tab===id?'page':'false'}">${titles[id]}</button>`).join('')}</nav>
      ${tab==='resumen'?summary():tab==='productos'?products():tab==='pedidos'?orders():tab==='proveedores'?suppliers():reports()}
      <footer class="gl-demo-foot">Vista de prueba para la creadora de GestLok · Datos inventados · No es una tienda para compradores</footer>
    </main>`;
  }
  document.addEventListener('click',e=>{
    const target=e.target.closest('[data-demo-tab],[data-demo-reset]');
    if(!target || !ok())return;
    e.preventDefault();
    if(target.hasAttribute('data-demo-reset'))reset();
    else if(['resumen','productos','pedidos','proveedores','reportes'].includes(target.dataset.demoTab)){
      tab=target.dataset.demoTab;query='';filter='todos';
    }
    render();
  });
  document.addEventListener('change',e=>{
    if(!ok())return;
    const target=e.target;
    if(target.matches('[data-demo-stock]')){
      const item=data.productos.find(p=>p.id===target.dataset.demoStock);
      const n=Number(target.value);
      if(item&&Number.isInteger(n)&&n>=0&&n<=100000){item.stock=n;render();}
      else {target.value=item?.stock??0;}
    }else if(target.matches('[data-demo-order]')){
      const item=data.pedidos.find(p=>p.id===target.dataset.demoOrder);
      if(item&&estados.includes(target.value)){item.estado=target.value;render();}
    }else if(target.id==='gl-demo-filter'){filter=target.value;render();}
  });
  document.addEventListener('input',e=>{
    if(!ok() || e.target.id!=='gl-demo-search')return;
    query=e.target.value;
    const filtered=data.productos.filter(p=>
      (filter==='todos'||(filter==='faltantes'&&alertas(p))||(filter==='disponibles'&&!alertas(p))) &&
      [p.nombre,p.sku,p.cat,p.proveedor].join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
    const body=document.getElementById('gl-demo-table');
    if(body)body.innerHTML=rowsHTML(filtered);
  });
  document.addEventListener('submit',e=>{
    if(e.target.id!=='gl-demo-add'||!ok())return;
    e.preventDefault();
    const d=new FormData(e.target), get=n=>String(d.get(n)||'').trim();
    const stock=Number(get('stock')),min=Number(get('min')),precio=Number(get('precio'));
    if(!get('nombre')||!get('sku')||!get('cat')|| !Number.isInteger(stock)||stock<0||!Number.isInteger(min)||min<0||!Number.isFinite(precio)||precio<0)return;
    data.productos.push({id:'temp-'+(++seq),nombre:get('nombre').slice(0,100),sku:get('sku').slice(0,35),cat:get('cat').slice(0,60),stock,min,precio,proveedor:'Sin asignar'});
    render();
  });
  window.GestLokDemo=Object.freeze({attach(ctx){api=ctx;},reset,view});
})();
