import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const creator=read('public/stock/gestlok-creator.js');
const migration=read('supabase/migrations/20261024_gestlok_creator_provisioning.sql');
const app=read('public/stock/app.js');
const commerce=read('public/stock/gestlok-commerce.js');
const catalog=read('public/stock/gestlok-tienda.js');

function loadCreator(isCreator=true){
  const handlers={};
  const win={};
  const doc={addEventListener:(type,fn)=>handlers[type]=fn};
  new Script(creator).runInNewContext({window:win,document:doc,Number,String,Array,Object,Intl,URL,Promise});
  let opened=0;
  win.GestLokCreator.attach({isCreadora:()=>isCreator,renderHub:()=>opened++,toast:()=>{},onClose:()=>opened++});
  return {creator:win.GestLokCreator,handlers,win,renderCount:()=>opened};
}
test('Creación de empresas requiere función de backoffice, no afecta Gisela',()=>{
  assert.doesNotThrow(()=>new Script(creator));
  assert.doesNotThrow(()=>new Script(commerce));
  assert.doesNotThrow(()=>new Script(catalog));
  assert.match(migration,/create schema if not exists gestlok_platform/);
  assert.match(migration,/auth\.uid\(\) is null or not exists/g);
  assert.match(migration,/join public\.docs d on d\.col='equipo'/);
  assert.match(migration,/d\.tenant_id=\(select t\.id from gestlok_tenancy\.tenants/);
  assert.match(migration,/insert into gestlok_tenancy\.tenants\(id,code\)/);
  assert.match(migration,/insert into public\.docs\(col,id,data,tenant_id,updated_by\)/);
  assert.match(migration,/rol','dueno'/);
  assert.match(migration,/crear|prepar/i);
  assert.doesNotMatch(migration,/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i);
  assert.doesNotMatch(migration,/\bupdate\s+public\.docs\b/i);
});
test('Dueño no puede administrar otras empresas, creadora sí ve el asistente',()=>{
  const a=loadCreator(false);
  assert.equal(a.creator.view(),'');
  assert.match(app,/isCreadora\(\) && !S\.local/);
  assert.match(app,/data-act="admin-preparar-empresa"/);
  assert.match(app,/window\.GestLokCreator\?\.open/);
  assert.match(read('components/stock-runtime.tsx'),/gestlok-creator\.js/);
});
test('CSV admite delimitador ; y comillas correctamente, conserva cientos de unidades',()=>{
  const {creator:c}=loadCreator();
  const rows=c.parseCSV('sku;nombre;categoria;stock;minimo;precio;costo;proveedor;unidad;ubicacion\nA-1;"Café, bolsa 500";Almacén;800;150;8500.50;3500;Mayorista;unidad;Estante A\nB_2;Agua 1.5L;Bebidas;1200;250;900;200;Proveedor;unidad;Depósito');
  assert.equal(rows.length,2);
  assert.equal(rows[0].nombre,'Café, bolsa 500');
  assert.equal(rows[1].stock,'1200');
  assert.equal(rows[0].minimo,'150');
});
test('CSV previene duplicados y corrupción de datos',()=>{
  const c=loadCreator().creator;
  assert.throws(()=>c.parseCSV('sku,nombre,stock,minimo,precio\nA,Producto uno,10,2,100\nA,Producto dos,20,3,200'),/duplicado/);
  assert.throws(()=>c.parseCSV('sku,nombre,stock,minimo,precio\nA,Producto uno,-2,2,100'),/inválidos/);
  assert.throws(()=>c.parseCSV('sku,nombre,stock,minimo,precio\nA,Producto uno,12,2,no-es-numero'),/inválidos/);
  assert.throws(()=>c.parseCSV('nombre,stock,minimo,precio\nProducto uno,12,2,5'),/Falta la columna sku/);
});
test('Importación escala a miles de registros, con límite y lotes de 150',()=>{
  const c=loadCreator().creator;
  const csv=['sku,nombre,stock,minimo,precio'];
  for(let i=0;i<1500;i++)csv.push('SKU_'+i+',Artículo '+i+',950,50,999.50');
  assert.equal(c.parseCSV(csv.join('\n')).length,1500);
  assert.match(creator,/i\+=150/);
  assert.match(migration,/jsonb_array_length\(p_rows\)>150/);
  assert.match(migration,/10000/);
  // La carga en el frontend fue reemplazada por páginas de 50 con cursor en Postgres.
  assert.match(catalog,/gestlok_catalogo_pagina/);
  assert.match(catalog,/p_limite:50/);
  assert.match(catalog,/p_cursor_nombre/);
  assert.doesNotMatch(catalog,/offset\s*<\s*10000/);
});
test('Sólo se preparan cuentas independientes, creadora no es integrante de cada empresa',()=>{
  assert.match(migration,/not in \('fisica','online','mixta'\)/);
  assert.match(migration,/El correo ya está asignado a otra empresa/);
  assert.match(migration,/v_local text:='loc-'/);
  assert.match(migration,/v_code text:='neg-'/);
  assert.match(migration,/gestlok_creator_import_products/);
  assert.match(migration,/where public\.docs\.tenant_id=excluded\.tenant_id/);
  assert.match(migration,/publicado,activo/);
  assert.doesNotMatch(migration,/jsonb_build_object\('email',v_owner,'rol','creadora'/);
});
test('Pedidos admiten varios artículos, entregas, estados y exportación local CSV',()=>{
  assert.match(commerce,/name="lineas"/);
  assert.match(commerce,/const items=\[\]/);
  assert.match(commerce,/total=items\.reduce/);
  assert.match(commerce,/fechaEntrega,transportista,tracking/);
  assert.match(commerce,/data-commerce-export/);
  assert.match(commerce,/data-commerce-page/);
  assert.match(commerce,/devuelto:'Devuelto'/);
});

test('Dueño puede administrar sólo gerentes de su propio tenant y no elevar roles',()=>{
  const rls=read('supabase/migrations/20261024_gestlok_owner_managers.sql');
  assert.match(rls,/public\.mi_rol\(\)='dueno'/);
  assert.match(rls,/tenant_id=\(select gestlok_tenancy\.current_tenant_id\(\)\)/);
  assert.match(rls,/data->>'rol' in \('gerente','lectura'\)/);
  assert.match(rls,/not public\.puede_ver_local\(x\.value\)/);
  assert.doesNotMatch(rls,/data->>'rol' in \('gerente','dueno'\)/);
  assert.match(app,/puedeAdministrarEquipo/);
  assert.match(app,/case 'eq-del-ok'/);
});
