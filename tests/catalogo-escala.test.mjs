import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('public/stock/gestlok-tienda.js');
const sql=read('supabase/migrations/20261025_gestlok_catalogo_500k_base.sql');

test('Catálogo online sigue siendo 100% interno y no descarga el catálogo entero',()=>{
  assert.doesNotThrow(()=>new Script(js));
  assert.doesNotMatch(js,/for\s*\(let offset\s*=|offset\s*<\s*10000|products\.push\(\.\.\./);
  assert.doesNotMatch(js,/window\.open|wa\.me|data-gl-publish|Publicar mi tienda|carrito|checkout/i);
  for(const key of ['gestlok_catalogo_pagina','gestlok_catalogo_resumen',
    'gestlok_catalogo_categorias','data-gl-archive','data-gl-open-category',
    'data-gl-page','p_cursor_nombre','p_cursor_id','codigo_barras','subcategoria','marca','variante'])
    assert.ok(js.includes(key),'Falta '+key);
  assert.match(js,/const last=state\.items\[state\.items\.length-1\]/);
  assert.match(js,/p_limite:50/);
  assert.match(js,/archivado sin borrar datos/);
});

test('Migración contiene búsqueda indexada, SKU/barcode únicos y refuerzo multiempresa',()=>{
  assert.match(sql,/create extension if not exists pg_trgm/);
  assert.match(sql,/gin_trgm_ops/);
  assert.match(sql,/create unique index if not exists gl_tienda_sku_unico/);
  assert.match(sql,/create unique index if not exists gl_tienda_barras_unico/);
  assert.match(sql,/gestlok_tiendas t[\s\S]*t\.tenant_id=gestlok_productos_tienda\.tenant_id/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/p_nombre,id/);
  assert.match(sql,/p\.busqueda like/);
  assert.match(sql,/limit p_limite\+1/);
  assert.match(sql,/p\.tenant_id=v_tenant/);
  assert.doesNotMatch(sql,/\btruncate\b|\bdelete from public\.docs\b|\bdrop table\b/i);
});

test('Simulación con 500.000 productos: solo recupera 50 por página desde el servidor',async()=>{
  const events={};const calls=[],N=500000;
  const rows=Array.from({length:51},(_,i)=>({
    id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    nombre:'Producto '+String(i+1).padStart(6,'0'),
    categoria:'Indumentaria',proveedor:'Prueba',ubicacion:'A1',stock:10,minimo:3,
    sku:'SKU-'+(i+1),precio:100,activo:true
  }));
  const sb={
    from(name){
      assert.equal(name,'gestlok_tiendas');
      return {select(){return this;},eq(){return this;},async maybeSingle(){
        return {data:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nombre:'Depósito de prueba'},error:null};
      }};
    },
    async rpc(name,args){
      calls.push({name,args});
      if(name==='gestlok_catalogo_resumen')
        return {data:{total:N,activos:N,alertas:0,archivados:0,categorias:1},error:null};
      if(name==='gestlok_catalogo_categorias')
        return {data:[{categoria:'Indumentaria',productos:N,alertas:0}],error:null};
      assert.equal(name,'gestlok_catalogo_pagina');
      const count=args.p_limite||50;
      return {data:{items:rows.slice(0,count),hasMore:true},error:null};
    }
  };
  const w={GestLokSupabase:sb,GestLokCommerce:{online:()=>true}};
  const document={addEventListener:(event,handler)=>events[event]=handler};
  const ctx={window:w,document,Intl,Number,String,Array,Object,Date,
    Promise,setTimeout,clearTimeout,console};
  new Script(js).runInNewContext(ctx);
  let renders=0;
  w.GestLokTienda.attach({S:{me:{tenant_id:'tenant-1'},local:'munro',view:'tienda-online',offline:false},
    miRol:()=> 'dueno',canW:()=>true,localNombre:()=> 'Munro',render:()=>renders++,toast:()=>{}});
  w.GestLokTienda.view();
  for(let k=0;k<20;k++)await new Promise(resolve=>setImmediate(resolve));
  const page1=calls.find(x=>x.name==='gestlok_catalogo_pagina'&&x.args.p_estado==='activos');
  assert.ok(page1,'Se esperaba consulta remota de catálogo');
  assert.equal(page1.args.p_limite,50);
  assert.equal(page1.args.p_cursor_id,null);
  const html=w.GestLokTienda.view();
  assert.match(html,/500\.000/);
  assert.match(html,/Página 1/);
  assert.ok(html.includes('data-gl-page="1"'));
  const button={dataset:{glPage:'1'},hasAttribute:n=>n==='data-gl-page'};
  events.click({target:{closest:()=>button},preventDefault(){}});
  for(let k=0;k<20;k++)await new Promise(resolve=>setImmediate(resolve));
  const pages=calls.filter(x=>x.name==='gestlok_catalogo_pagina'&&x.args.p_estado==='activos');
  assert.equal(pages.length,2);
  assert.equal(pages[1].args.p_cursor_nombre,rows[49].nombre);
  assert.equal(pages[1].args.p_cursor_id,rows[49].id);
  assert.match(w.GestLokTienda.view(),/Página 2/);
});
