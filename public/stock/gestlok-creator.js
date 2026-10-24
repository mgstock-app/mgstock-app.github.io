/* GestLok · alta y preparación por la creadora; datos aislados por tenant.
 * CSV se procesa localmente; los lotes se guardan mediante funciones SQL autenticadas.
 * No se crean cuentas ni contraseñas: el dueño se registra con el correo asignado. */
(() => {
  'use strict';
  let api;
  const empty=()=>({shown:false,busy:false,companies:[],loaded:false,error:'',rows:[],file:'',selected:'',progress:0,created:null,importError:''});
  let s=empty();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ready=()=>!!api?.isCreadora?.()&&!!window.GestLokSupabase;
  const sb=()=>window.GestLokSupabase;
  const notify=(message,fail=false)=>api?.toast?.(message,fail);
  const show=()=>api?.renderHub?.();
  const modeName={fisica:'Tienda física',online:'Tienda online',mixta:'Tienda mixta'};
  const columns=['sku','nombre','categoria','stock','minimo','precio','costo','proveedor','unidad','ubicacion'];
  const help='Columnas: '+columns.join(', ')+'. Una fila por producto. Guardá el archivo de Excel como CSV UTF-8.';
  const example='sku,nombre,categoria,stock,minimo,precio,costo,proveedor,unidad,ubicacion\nCAF-500,Café en grano 500g,Almacén,150,20,8500,5600,Distribuidora Central,unidad,Estante A\nAGUA-15,Agua 1.5L,Bebidas,350,50,900,580,Bebidas Norte,unidad,Depósito';
  function validNumber(n,integer=false,optional=false){
    const t=String(n??'').trim().replace(',','.');
    if(optional&&!t)return '';
    if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(t)||Number(t)>9999999999)return null;
    if(integer&&(!/^\d{1,9}$/.test(t)||Number(t)>100000000))return null;
    return t;
  }
  function splitCSV(text,sep){
    const data=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){
        if(quoted&&text[i+1]==='"'){field+='"';i++;}
        else quoted=!quoted;
      }else if(!quoted&&ch===sep){row.push(field);field='';}
      else if(!quoted&&(ch==='\n'||ch==='\r')){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        row.push(field);if(row.some(v=>v.trim()))data.push(row);
        field='';row=[];
        if(data.length>10001)throw Error('Máximo 10.000 artículos por archivo.');
      }else field+=ch;
    }
    if(quoted)throw Error('CSV con comillas sin cerrar.');
    row.push(field);if(row.some(v=>v.trim()))data.push(row);
    return data;
  }
  function parseCSV(raw){
    const text=raw.replace(/^\uFEFF/,'');
    const first=text.split(/\r?\n/,1)[0]||'';
    const delim=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
    const table=splitCSV(text,delim);
    if(table.length<2)throw Error('El archivo no contiene artículos.');
    const aliases={codigo:'sku',codigo_producto:'sku',producto:'nombre',nombre_producto:'nombre',
      cat:'categoria',cantidad:'stock',cantidad_inicial:'stock',stock_inicial:'stock',
      minimo_stock:'minimo',stock_minimo:'minimo',precio_venta:'precio',
      precio_unitario:'precio',precio_compra:'costo',ubicacion_stock:'ubicacion'};
    const headers=table[0].map(h=>{
      const key=h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
      return aliases[key]||key;
    });
    for(const col of ['sku','nombre','stock','minimo','precio'])
      if(!headers.includes(col))throw Error('Falta la columna '+col+'. '+help);
    const seen=new Set(),res=[];
    for(let i=1;i<table.length;i++){
      const line=Object.fromEntries(headers.map((k,n)=>[k,(table[i][n]??'').trim()]));
      const sku=(line.sku||'').toUpperCase(),name=line.nombre||'';
      if(!/^[A-Z0-9_-]{1,80}$/.test(sku))throw Error('SKU inválido en fila '+(i+1)+'. Solo letras, números, guion y guion bajo.');
      if(seen.has(sku))throw Error('SKU duplicado: '+sku+' (fila '+(i+1)+')');
      seen.add(sku);
      if(name.length<2||name.length>140)throw Error('Nombre inválido en fila '+(i+1));
      const stock=validNumber(line.stock,true), minimo=validNumber(line.minimo,true),
        precio=validNumber(line.precio),costo=validNumber(line.costo,false,true);
      if(stock===null||minimo===null||precio===null||costo===null)
        throw Error('Cantidades o precios inválidos en fila '+(i+1));
      const row={sku,nombre:name,categoria:line.categoria||'General',
        stock,minimo,precio,costo,proveedor:line.proveedor||'',
        unidad:line.unidad||'unidad',ubicacion:line.ubicacion||''};
      if(row.categoria.length>80||row.proveedor.length>120||row.unidad.length>30||row.ubicacion.length>120)
        throw Error('Categoría, proveedor, unidad o ubicación excede el largo en fila '+(i+1));
      res.push(row);
    }
    if(res.length>10000)throw Error('Máximo 10.000 productos por archivo.');
    return res;
  }
  async function refresh(){
    if(!ready()||s.busy)return;
    try{
      const {data,error}=await sb().rpc('gestlok_creator_list_companies');
      if(error)throw error;
      s.companies=Array.isArray(data)?data:[];s.loaded=true;s.error='';
    }catch(e){s.error=e.message||'No se pudieron cargar los negocios preparados.';s.loaded=true;}
    show();
  }
  function open(){
    if(!ready())return;
    s.shown=true;
    s.loaded=false;
    show();
    refresh();
  }
  function close(){s.shown=false;api?.onClose?.();}
  function download(){
    const url=URL.createObjectURL(new Blob(['\uFEFF'+example],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;a.download='gestlok-plantilla-productos.csv';document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
  }
  async function parseFile(file){
    if(!file)return;
    if(file.size>2*1024*1024){s.rows=[];s.error='El CSV supera 2 MB. Dividilo en archivos más pequeños.';show();return;}
    try{
      const rows=parseCSV(await file.text());
      s.file=file.name;s.rows=rows;s.error='';s.progress=0;s.importError='';
    }catch(e){s.rows=[];s.file='';s.error=e.message||'CSV inválido.';}
    show();
  }
  function creation(){
    return '<section class="card pad"><h3>1. Preparar un negocio nuevo</h3>'+
      '<p class="lead">Se crean su empresa privada, la primera sucursal, el usuario Dueño y las carpetas de GestLok. El cliente se registra después con el correo autorizado.</p>'+
      '<form id="gl-create-company" class="gl-demo-fields">'+
      '<label>Nombre de la empresa<input name="empresa" maxlength="100" minlength="2" required placeholder="Ej. Librería Central"></label>'+
      '<label>Nombre del Dueño<input name="dueno" maxlength="100" minlength="2" required placeholder="Ej. Gisela"></label><label>Email del Dueño<input name="email" type="email" autocomplete="off" maxlength="254" required placeholder="dueno@empresa.com"></label>'+
      '<label>Nombre del primer local<input name="local" maxlength="100" minlength="2" required placeholder="Ej. Depósito principal"></label>'+
      '<label>Modalidad<select name="modo"><option value="fisica">Tienda física</option><option value="online">Tienda online</option><option value="mixta">Tienda mixta</option></select></label>'+
      '<div class="gl-commerce-wide"><button type="submit" class="btn primary" '+(s.busy?'disabled':'')+'>Crear empresa y carpetas privadas</button></div>'+
      '</form><p class="note">No uses un correo que ya pertenezca a otra empresa GestLok: cada cuenta opera en una sola empresa. La creadora puede preparar todas sin convertirse en integrante.</p></section>';
  }
  function upload(){
    return '<section class="card pad"><h3>2. Dejar cargados los productos</h3>'+
    '<p class="lead">Cargá cientos o miles de artículos desde Excel (exportado a CSV). Cada lote se valida y se guarda en el negocio elegido; las carpetas Stock, Conteo, Pedido, Historial y Proveedores estarán disponibles al entrar.</p>'+
    '<button type="button" class="btn" data-creator-template>Descargar plantilla CSV</button>'+
    '<p class="note">'+esc(help)+'</p>'+
    '<div class="gl-demo-fields"><label>Empresa de destino<select id="gl-creator-company"><option value="">Seleccioná una empresa preparada</option>'+
       s.companies.map(c=>'<option value="'+esc(c.tenant_id)+'" '+(s.selected===c.tenant_id?'selected':'')+'>'+esc(c.nombre)+' · '+esc(c.local)+' ('+esc(c.modalidad)+')</option>').join('')+
      '</select></label>'+
    '<label>Archivo CSV<input id="gl-creator-file" type="file" accept=".csv,.txt,text/csv,text/plain" '+(s.busy?'disabled':'')+'></label></div>'+
    (s.file?'<p class="lead"><b>'+esc(s.rows.length)+' productos listos:</b> '+esc(s.file)+'</p>'+
      '<div class="gl-demo-table-scroll"><table class="gl-demo-table"><thead><tr><th>SKU</th><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Precio</th></tr></thead><tbody>'+
        s.rows.slice(0,8).map(p=>'<tr><td>'+esc(p.sku)+'</td><td>'+esc(p.nombre)+'</td><td>'+esc(p.stock)+'</td><td>'+esc(p.minimo)+'</td><td>'+esc(p.precio)+'</td></tr>').join('')+
        '</tbody></table></div><p class="note">Se muestran solo los primeros 8 productos. Ninguno se importa hasta confirmar.</p>':'')+
    (s.progress?'<p role="status">Productos procesados en esta sesión: <b>'+s.progress+'</b> de '+s.rows.length+'</p>':'')+
    (s.importError?'<p role="alert" class="note warn">'+esc(s.importError)+'</p>':'')+
    '<button class="btn primary" type="button" data-creator-import '+(!s.rows.length||!s.selected||s.busy?'disabled':'')+'>Importar productos a esta empresa</button>'+
    '<p class="note">La importación es reintentable por SKU. No descuenta inventario ni copia información de Gisela. En tiendas mixtas se prepara un stock inicial separado para la organización online.</p></section>';
  }
  function list(){
    return '<section class="card pad"><div class="gl-demo-section-title"><h3>Empresas que preparaste</h3><button class="btn sm" data-creator-refresh>Actualizar lista</button></div>'+
    (s.companies.length?s.companies.map(c=>'<article class="gl-demo-line"><div><b>'+esc(c.nombre)+'</b><small>'+esc(c.local)+' · '+esc(modeName[c.modalidad]||c.modalidad)+
      ' · '+esc(c.correo_dueno)+'</small></div><span class="gl-demo-chip">'+esc(c.productos)+' productos</span></article>').join(''):'<p class="lead">Todavía no hay empresas nuevas preparadas.</p>')+
    '</section>';
  }
  function view(){
    if(!s.shown||!ready())return '';
    return '<main class="gl-demo gl-creator" id="gl-creator-preparacion">'+
      '<header class="gl-demo-head"><div><p class="eyebrow">GESTLOK / CREADORA</p><h1>Preparar una empresa para un cliente</h1><p>Modalidad física, online o mixta · Datos independientes.</p></div>'+
      '<button class="btn" data-creator-close>← Volver a administración</button></header>'+
      '<div class="gl-demo-banner"><span>ADMINISTRACIÓN DE CLIENTES</span><p>Solo vos podés preparar nuevas empresas. Cada dueño recibe su propio espacio y sus gerentes trabajan únicamente en los locales asignados.</p></div>'+
      (s.error?'<p role="alert" class="note warn">'+esc(s.error)+'</p>':'')+
      (s.created?'<section class="card pad"><b>Empresa preparada: '+esc(s.created.empresa)+'</b><p>Local: '+esc(s.created.local)+' · Código: '+esc(s.created.code)+
      ' · Dueño: '+esc(s.created.propietario)+'. El dueño debe registrarse en GestLok con ese correo. Ahora podés cargar sus productos.</p></section>':'')+
      creation()+upload()+list()+
      '<footer class="gl-demo-foot">El alta no modifica empresas ya existentes. GestLok no crea contraseñas ni envía invitaciones automáticamente.</footer></main>';
  }
  async function create(form){
    if(!ready()||s.busy)return;
    const d=new FormData(form),get=n=>String(d.get(n)||'').trim();
    if(!['fisica','online','mixta'].includes(get('modo'))){notify('Modalidad inválida.',true);return;}
    if(!window.confirm('¿Crear una NUEVA empresa independiente para '+get('email')+'? No podrá reasignarse ese correo desde este formulario.'))return;
    s.busy=true;s.error='';show();
    try{
      const {data,error}=await sb().rpc('gestlok_creator_prepare_company_named',
        {p_name:get('empresa'),p_owner_email:get('email'),p_mode:get('modo'),p_local_name:get('local'),p_owner_name:get('dueno')});
      if(error)throw error;
      s.created=data;s.selected=data.tenant_id;notify('Empresa preparada. Cargá ahora sus productos.');
      form.reset();
      s.busy=false;await refresh();
    }catch(e){s.error=e.message||'No se pudo preparar la empresa.';s.busy=false;show();}
  }
  async function importRows(){
    if(!ready()||s.busy||!s.selected||!s.rows.length)return;
    const company=s.companies.find(c=>c.tenant_id===s.selected);
    if(!company){notify('Elegí la empresa de destino.',true);return;}
    if(!window.confirm('¿Importar '+s.rows.length+' productos en '+company.nombre+'? Se actualizarán los SKU ya existentes de ESA empresa.'))return;
    s.busy=true;s.importError='';
    try{
      for(let i=0;i<s.rows.length;i+=150){
        const {error}=await sb().rpc('gestlok_creator_import_products',
          {p_tenant:company.tenant_id,p_local:company.local_id,p_rows:s.rows.slice(i,i+150)});
        if(error)throw new Error('Lote '+(Math.floor(i/150)+1)+': '+error.message);
        s.progress=Math.min(i+150,s.rows.length);
        const count=document.querySelector('#gl-creator-preparacion [role="status"]');
        if(count)count.textContent='Productos procesados: '+s.progress+' de '+s.rows.length;
      }
      notify('Importación completada: '+s.rows.length+' productos.');s.importError='';
    }catch(e){s.importError='No se completó la importación. '+(e.message||'Error desconocido')+'. Podés reintentar: los SKU son estables.';}
    finally{s.busy=false;await refresh();}
  }
  document.addEventListener('click',e=>{
    if(!s.shown||!ready())return;
    const btn=e.target.closest('[data-creator-close],[data-creator-template],[data-creator-import],[data-creator-refresh]');
    if(!btn)return;
    e.preventDefault();
    if(btn.hasAttribute('data-creator-close'))close();
    else if(btn.hasAttribute('data-creator-template'))download();
    else if(btn.hasAttribute('data-creator-import'))importRows();
    else if(btn.hasAttribute('data-creator-refresh'))refresh();
  });
  document.addEventListener('change',e=>{
    if(!s.shown||!ready())return;
    if(e.target.id==='gl-creator-company'){s.selected=e.target.value; s.progress=0;show();}
    if(e.target.id==='gl-creator-file')parseFile(e.target.files?.[0]);
  });
  document.addEventListener('submit',e=>{
    if(e.target.id==='gl-create-company'&&s.shown&&ready()){
      e.preventDefault();create(e.target);
    }
  });
  window.GestLokCreator=Object.freeze({attach(ctx){api=ctx;},open,close,view,
    parseCSV,reset(){s=empty();}});
})();
