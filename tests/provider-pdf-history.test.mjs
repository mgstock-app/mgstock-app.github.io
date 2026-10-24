import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pdf=read('public/stock/gestlok-provider-pdf.js');
const app=read('public/stock/app.js');
const runtime=read('components/stock-runtime.tsx');
test('Genera un PDF real multipágina de pedidos con unidades y fecha, sin PNG',async()=>{
  const win={};
  new Script(pdf).runInNewContext({window:win,Blob,File:undefined,Date,Uint8Array,Array,String,Number,Object});
  const rows=Array.from({length:56},(_,i)=>({nombre:'Café en grano '+(i+1),pedir:i+1,unidad:'cajas'}));
  const blob=win.GestLokProviderPDF.createBlob({proveedor:'Distribuidora Café',local:'Munro',fecha:'24/10/2026',rows});
  assert.equal(blob.type,'application/pdf');
  const binary=Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(binary,/^%PDF-1\.4/);
  assert.match(binary,/\/Type \/Pages \/Kids/);
  assert.equal((binary.match(/\/Type \/Page \/Parent/g)||[]).length,3);
  assert.match(binary,/PEDIDO A PROVEEDOR/);
  assert.match(binary,/Munro/);
  assert.match(binary,/Café en grano/);
  assert.match(binary,/trailer\n/);
  assert.match(binary,/startxref\n\d+\n%%EOF/);
  assert.doesNotMatch(binary,/image\/png|\/Subtype \/Image|base64/i);
});
test('El PDF de proveedor no incluye texto adicional en el Web Share',()=>{
  assert.match(app,/navigator\.share\(\{files:\[p\.archivo\]\}\)/);
  assert.doesNotMatch(app,/crearImagenPedido|copiarImagenProveedor|image\/png|Enviar imagen por WhatsApp/);
  assert.match(app,/application\/pdf|GestLokProviderPDF\.createFile/);
  assert.match(app,/prov-download-pdf/);
  assert.match(app,/https:\/\/wa\.me\/'\+telefono\+'/);
  assert.doesNotMatch(app,/wa='https:\/\/wa\.me\/'\+telefono\+'\?text=/);
  assert.match(runtime,/gestlok-provider-pdf\.js/);
});
test('Guardar proveedor confirma si finalizó y crea historial separado por local',()=>{
  assert.match(app,/function confirmarGuardarProveedor/);
  assert.match(app,/¿Terminaste el pedido\?/);
  assert.match(app,/prov-save-history/);
  assert.match(app,/prov-save-draft/);
  assert.match(app,/C\('proveedores_historial'\)\.add/);
  assert.match(app,/C\('proveedores_historial'\)\.orderBy\('fecha','desc'\)/);
  assert.match(app,/LOCAL_COLS = \[[^\]]*'proveedores_historial'/);
  assert.match(app,/ver!==d\.base/);
  assert.match(app,/No se pudo registrar el historial|falló el historial/);
});
test('Poner en 0 modifica solo Stock local y Pedir, nunca Sugerido',()=>{
  const section=app.slice(app.indexOf('function ponerEnCeroProveedorCategoria('),
    app.indexOf('function compartirPedidoProveedor('));
  assert.match(section,/it\.stockLocal=0;it\.pedir=0;it\.sugerido=row\.sugerido/);
  assert.match(section,/stockLocal:0,pedir:0,sugerido:row\.sugerido/);
  assert.match(section,/proveedorGuardarBorrador\(nombre\)/);
  assert.match(app,/data-act="prov-zero-cat"/);
  assert.match(app,/data-act="prov-save-plan"/);
  assert.match(app,/gl-prov-category-head/);
});
