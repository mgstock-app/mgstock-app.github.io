/* Plan Scanner · preferencias de lectores de teclado e impresoras del dispositivo.
 * Sin acceso a USB/Bluetooth: el sistema operativo conecta los periféricos.
 * Configuración aislada por empresa en ESTE navegador, nunca en Mi Gusto. */
(function(root){
'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(n)||0);
const defaults=()=>({readerEnabled:false,printerEnabled:false,paper:'58mm'});
function key(tenant){if(!UUID.test(String(tenant||'')))throw Error('Empresa Scanner inválida.');return 'gestlok:scanner:devices:v1:'+tenant;}
function load(tenant){
 const base=defaults();
 try{const raw=root.localStorage?.getItem(key(tenant));if(!raw)return base;const saved=JSON.parse(raw);return {
  readerEnabled:saved.readerEnabled===true,printerEnabled:saved.printerEnabled===true,
  paper:saved.paper==='80mm'?'80mm':'58mm'
 };}catch{return base;}
}
function save(tenant,values){
 const current=load(tenant);
 const next={readerEnabled:values.readerEnabled===undefined?current.readerEnabled:values.readerEnabled===true,
  printerEnabled:values.printerEnabled===undefined?current.printerEnabled:values.printerEnabled===true,
  paper:values.paper==='80mm'?'80mm':values.paper==='58mm'?'58mm':current.paper};
 root.localStorage?.setItem(key(tenant),JSON.stringify(next));
 return next;
}
const barcode=s=>/^[a-z0-9_-]{6,48}$/i.test(String(s||''));
function bindKeyboard(tenant,onCode,{doc=root.document,clock=()=>Date.now()}={}){
 if(!load(tenant).readerEnabled||!doc?.addEventListener)return ()=>{};
 let buffer='',start=0,prev=0;
 const reset=()=>{buffer='';start=0;prev=0;};
 const handle=e=>{
  if(e.ctrlKey||e.altKey||e.metaKey||e.isComposing||e.repeat)return reset();
  const target=e.target;
  if(target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/i.test(target?.tagName||'')||target?.closest?.('[contenteditable="true"]'))return reset();
  const stamp=clock();
  if(e.key==='Enter'){
   const quick=buffer.length>=6&&stamp-start<=Math.max(750,buffer.length*105)&&prev&&stamp-prev<=180;
   if(quick&&barcode(buffer)){e.preventDefault?.();onCode(buffer);}
   reset();return;
  }
  if(e.key.length!==1||!/^[a-z0-9_-]$/i.test(e.key))return reset();
  if(prev&&stamp-prev>105)reset();
  if(!buffer)start=stamp;
  buffer+=e.key;prev=stamp;
  if(buffer.length>48)reset();
 };
 doc.addEventListener('keydown',handle,true);
 return ()=>{doc.removeEventListener('keydown',handle,true);reset();};
}
function printTicket(receipt,paper='58mm',{open=root.open}={}){
 if(!receipt||!Array.isArray(receipt.lines)||!['58mm','80mm'].includes(paper))throw Error('Ticket inválido.');
 const w=typeof open==='function'?open('','_blank'):null;
 if(!w)throw Error('Permití las ventanas emergentes y elegí tu impresora térmica.');
 const width=paper==='80mm'?'76mm':'54mm';
 const rows=receipt.lines.map(x=>'<tr><td>'+esc(x.name)+' × '+Number(x.quantity)+'</td><td class="right">'+esc(money(Number(x.price)*Number(x.quantity)))+'</td></tr>').join('');
 const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket GESTLOK</title><style>@page{size:auto;margin:0}html,body{padding:0;margin:0}body{width:'+width+';max-width:'+width+';padding:2mm;box-sizing:border-box;font:12px/1.5 monospace;color:#000}h2{text-align:center;font-size:14px;margin:0 0 6mm}table{width:100%;border-collapse:collapse}td{padding:2mm 0;border-bottom:1px dashed #999;vertical-align:top}.right{text-align:right}strong{display:block;margin-top:4mm;text-align:right;font-size:14px}p{overflow-wrap:anywhere}@media print{body{width:'+width+';max-width:'+width+'}}</style></head><body><h2>GESTLOK · COMPROBANTE</h2><p>'+esc(receipt.date)+'<br>N.º '+esc(receipt.id)+'</p><table>'+rows+'</table><strong>Total: '+esc(money(receipt.total))+'</strong><p>Pago: '+esc(receipt.payment)+'</p><script>window.onload=function(){window.print()}<\/script></body></html>';
 w.document.open();w.document.write(html);w.document.close();
 return true;
}
function renderSettings(tenant){
 const state=load(tenant);
 return '<section class="gl-pos-devices" aria-label="Dispositivos del Plan Scanner"><header><h2>Dispositivos</h2><p>Configuración de este equipo para el local autorizado. No se comparte con otros celulares o computadoras.</p></header>'+
 '<div class="gl-pos-device-grid"><div class="gl-pos-device-card"><h3>Lector USB / Bluetooth</h3><p>Emparejalo desde el dispositivo como teclado. No necesita permisos especiales en GESTLOK.</p>'+
 '<label class="gl-pos-device-toggle"><input type="checkbox" data-scanner-reader '+(state.readerEnabled?'checked':'')+'> Activar lectura automática en Ventas</label>'+
 '<label>Probar lector o código<input type="text" maxlength="48" data-scanner-test autocomplete="off" placeholder="Escaneá y presioná Enter"></label>'+
 '<small>La prueba confirma que el código llega al navegador; no detecta el estado de conexión Bluetooth.</small><p role="status" data-scanner-test-result></p></div>'+
 '<div class="gl-pos-device-card"><h3>Impresora térmica</h3><p>Conectala por USB o Bluetooth y seleccionála desde el diálogo de impresión del navegador.</p>'+
 '<label class="gl-pos-device-toggle"><input type="checkbox" data-scanner-printer '+(state.printerEnabled?'checked':'')+'> Habilitar impresión de tickets</label>'+
 '<label>Ancho del rollo<select data-scanner-paper><option value="58mm" '+(state.paper==='58mm'?'selected':'')+'>58 mm</option><option value="80mm" '+(state.paper==='80mm'?'selected':'')+'>80 mm</option></select></label>'+
 '<button type="button" data-scanner-print-test>Imprimir ticket de prueba</button><p role="status" data-scanner-print-result></p></div></div>'+
 '<p class="gl-pos-device-help">Los tickets no son facturas fiscales. La impresión directa sin diálogo depende del navegador, controlador e impresora instalados.</p></section>';
}
function mountSettings(container,tenant){
 if(!container)return ()=>{};
 const toggleReader=container.querySelector('[data-scanner-reader]');
 const togglePrinter=container.querySelector('[data-scanner-printer]');
 const paper=container.querySelector('[data-scanner-paper]');
 const test=container.querySelector('[data-scanner-test]');
 const status=container.querySelector('[data-scanner-test-result]');
 const printStatus=container.querySelector('[data-scanner-print-result]');
 const printButton=container.querySelector('[data-scanner-print-test]');
 const onReader=()=>{save(tenant,{readerEnabled:toggleReader.checked});status.textContent=toggleReader.checked?'Lectura automática habilitada para este equipo.':'Lectura automática desactivada.';};
 const onPrinter=()=>{save(tenant,{printerEnabled:togglePrinter.checked});printStatus.textContent=togglePrinter.checked?'Impresión habilitada.':'Impresión desactivada.';};
 const onPaper=()=>{save(tenant,{paper:paper.value});printStatus.textContent='Ancho guardado: '+(paper.value==='80mm'?'80 mm':'58 mm')+'.';};
 const onTest=e=>{if(e.key!=='Enter')return;e.preventDefault();const code=test.value.trim();status.textContent=barcode(code)?'✓ Código recibido: '+code:'Código no válido. Escaneá un código de al menos 6 caracteres.';};
 const onPrint=()=>{
  if(!load(tenant).printerEnabled){printStatus.textContent='Activá la impresión de tickets primero.';return;}
  try{printTicket({id:'PRUEBA',date:new Date().toLocaleString('es-AR'),lines:[{name:'Prueba de impresión · sin venta',quantity:1,price:0}],total:0,payment:'Sin cobro'},load(tenant).paper);printStatus.textContent='Se abrió la impresión de prueba.';}
  catch(e){printStatus.textContent=e.message;}
 };
 toggleReader?.addEventListener('change',onReader);togglePrinter?.addEventListener('change',onPrinter);paper?.addEventListener('change',onPaper);test?.addEventListener('keydown',onTest);printButton?.addEventListener('click',onPrint);
 return ()=>{toggleReader?.removeEventListener('change',onReader);togglePrinter?.removeEventListener('change',onPrinter);paper?.removeEventListener('change',onPaper);test?.removeEventListener('keydown',onTest);printButton?.removeEventListener('click',onPrint);};
}
const api=Object.freeze({load,save,bindKeyboard,printTicket,renderSettings,mountSettings,barcode});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosDevices=api;
})(typeof window!=='undefined'?window:globalThis);
