import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import {Script} from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const pdfCode=read('public/stock/gestlok-proveedor-pdf.js');
const app=read('public/stock/app.js');
const sql=read('supabase/migrations/20261024_gestlok_proveedores_historial.sql');
const window={};
new Script(pdfCode).runInNewContext({window,File,Blob,Date,Number,String,Array,Uint8Array,Intl});
const create=window.GestLokProveedorPDF.crear;

test('Pedido produce un PDF real, no un PNG ni texto de WhatsApp',async()=>{
 const file=create({proveedor:'Distribuidora Norte',local:'Munro',
  fecha:'24/10/2026',productos:[{nombre:'Café molido (500g)',pedir:8,unidad:'caja'}]});
 assert.equal(file.type,'application/pdf');
 assert.match(file.name,/\.pdf$/);
 const latin1=Buffer.from(await file.arrayBuffer()).toString('latin1');
 assert.ok(latin1.startsWith('%PDF-1.4\n'));
 assert.match(latin1,/\/Type \/Page /);
 assert.match(latin1,/\/Count 1 /);
 assert.match(latin1,/xref\n0 /);
 assert.match(latin1,/%%EOF/);
 assert.match(latin1,/Cafe|Café/);
 assert.doesNotMatch(latin1,/PNG|image\/png/);
});

test('Pedido de más de 100 productos produce UN solo archivo PDF multipágina',async()=>{
 const products=Array.from({length:125},(_,i)=>({nombre:'Producto largo en el catálogo '+i+' para administración',pedir:i+1,unidad:'unidad'}));
 const file=create({proveedor:'Mayorista Ñandú',local:'Munro',productos:products});
 const latin1=Buffer.from(await file.arrayBuffer()).toString('latin1');
 assert.equal(file.type,'application/pdf');
 const parts=(latin1.match(/\/Type \/Page /g)||[]).length;
 assert.ok(parts>=3,'se requieren varias páginas');
 assert.match(latin1,new RegExp('/Count '+parts+' '));
 assert.ok(file.size>3500);
 assert.ok(latin1.includes('Mayorista'));
});

test('No se permite generar un pedido PDF vacío',()=>{
 assert.throws(()=>create({proveedor:'X',local:'Munro',productos:[]}),/no tiene cantidades/);
 assert.throws(()=>create({proveedor:'X',local:'Munro',productos:[{nombre:'Café',pedir:0}]}),/no tiene cantidades/);
});

test('Poner en 0 solo afecta Stock local y Pedir; Sugerido conserva el valor',()=>{
 assert.match(app,/function ponerEnCeroCategoriaProveedor/);
 assert.match(app,/stockLocal:0,pedir:0,sugerido:p\.sugerido/);
 assert.match(app,/m\.stockLocal=0;m\.pedir=0/);
 assert.match(app,/La columna Sugerido NO se modifica/);
 assert.match(app,/data-act="prov-zero-cat"/);
 assert.match(app,/proveedorGuardarBorrador\(nombre\)/);
});

test('Guardar exige confirmación y persiste el pedido en un historial separado',()=>{
 assert.match(app,/¿Ya terminaste tu pedido y querés guardarlo en el historial\?/);
 assert.match(app,/data-act="prov-confirm-save"/);
 assert.match(app,/gestlok_proveedor_guardar_historial/);
 assert.match(app,/proveedores_historial/);
 assert.match(app,/function historialProveedorHTML/);
 assert.match(app,/data-act="prov-history-pdf"/);
 assert.match(sql,/for update/);
 assert.match(sql,/gestlok_tenancy\.current_tenant_id/);
 assert.match(sql,/public\.puede_editar_local\(p_local\)/);
 assert.match(sql,/insert into public\.docs\(col,id,data,tenant_id,updated_by\)/);
 assert.doesNotMatch(sql,/delete from|truncate|drop table/i);
});

test('WhatsApp recibe un solo PDF como archivo, sin mensaje ni imagen',()=>{
 assert.match(app,/navigator\.share\(\{files:\[p\.archivo\]\}\)/);
 assert.doesNotMatch(app,/crearImagenPedido|copiarImagenProveedor|image\/png/);
 assert.doesNotMatch(app,/navigator\.share\(\{[^}]*text:/);
 assert.match(app,/Descargar PDF/);
 assert.match(app,/p\.archivo\?\.type!=='application\/pdf'/);
 assert.match(app,/https:\/\/wa\.me\/'\+p\.telefono/);
 assert.doesNotMatch(app,/wa\.me\/'\+p\.telefono\+'\?text=/);
});

test('Proveedor asignado por catálogo se crea junto con historial, sin ficha duplicada',()=>{
 const auto=read('supabase/migrations/20261024_gestlok_proveedores_catalogo_auto.sql');
 const mock=read('tests/mock_supabase.js');
 assert.match(auto,/p_productos->0->>'proveedor'/);
 assert.match(auto,/insert into public\.docs\(col,id,data,tenant_id,updated_by\)/);
 assert.match(auto,/on conflict \(col,id\) do nothing/);
 assert.match(auto,/for update/);
 assert.match(auto,/p_version/);
 assert.match(app,/proveedor:nombre/);
 assert.match(mock,/gestlok_proveedor_guardar_historial/);
});
