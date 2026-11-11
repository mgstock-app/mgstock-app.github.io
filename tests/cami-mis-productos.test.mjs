import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync('public/stock/gestlok-mis-productos.js','utf8');
const sql=readFileSync('supabase/migrations/20261106052349_cami_mis_productos_privados.sql','utf8');
const photoSql=readFileSync('supabase/migrations/20261107133000_cami_mis_productos_fotos_privadas.sql','utf8');
const css=readFileSync('app/gestlok-mis-productos.css','utf8');
const runtime=readFileSync('components/stock-runtime.tsx','utf8');
const owner=readFileSync('public/stock/gestlok-owner-areas.js','utf8');
const layout=readFileSync('app/layout.tsx','utf8');
const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
const email='camilab.lopez99@gmail.com';

test('Mis Productos se carga por separado, solo para dueña de Perfumería, sin Plan Scanner',()=>{
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-mis-productos\.js/);
 assert.match(owner,/GestLokMisProductos\?\.refresh/);
 assert.match(owner,/GestLokMisProductos\?\.homeTile/);
 assert.match(layout,/gestlok-mis-productos\.css/);
 assert.doesNotMatch(script,/plan_code|gestlok_pilot_products|gestlok_scanner_pos|gestlok_pilot_records/);
 assert.match(script,/data-mp-open/);
 assert.match(script,/data-mp-new-tab/);
 assert.match(script,/data-mp-rename/);
 assert.match(script,/data-mp-remove-tab/);
 assert.match(script,/data-mp-delete/);
 assert.match(script,/data-mp-like/);
 assert.match(script,/Me gustó/);
 assert.match(script,/No me gustó/);
 assert.match(script,/data-mp-new/);
 assert.match(script,/data-mp-search/);
 assert.match(script,/data-mp-cards/);
 assert.match(script,/data-mp-photo-input/);
 assert.match(script,/data-mp-photo-remove/);
 assert.match(css,/gl-mp-card-top/);
 assert.doesNotMatch(script,/getPublicUrl\(/);
 assert.match(runtime,/cami-ia-sin-pedir-v2-20261111/);
});

test('RLS excluye otras cuentas y no depende de habilitación Scanner',()=>{
 assert.match(sql,/gestlok_cami_product_tabs/);
 assert.match(sql,/gestlok_cami_product_items/);
 assert.equal((sql.match(/enable row level security/g)||[]).length,2);
 assert.equal((sql.match(/create policy gestlok_cami_/g)||[]).length,8);
 assert.match(sql,/owner_uid=\(select auth\.uid\(\)\)/);
 assert.match(sql,/foreign key\(tab_id,owner_uid,tenant_id\)/);
 assert.match(sql,/revoke all on public\.gestlok_cami_product_tabs from public,anon,authenticated/);
 assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/gestlok_pilot_access\.enabled|plan_code|\bdrop table\b|\bdelete from public\.docs\b|\bto anon\b/i);
 assert.match(sql,/Perfume Fem/);
 assert.match(sql,/Perfume Masc/);
 assert.match(sql,/Body Splash/);
});

test('Las fotos se guardan en un bucket privado con políticas restringidas al UID de la perfumería',()=>{
 assert.match(photoSql,/add column if not exists photo_path text/);
 assert.match(photoSql,/gestlok_cami_items_photo_path_check/);
 assert.match(photoSql,/storage\.buckets/);
 assert.match(photoSql,/false,3145728/);
 assert.equal((photoSql.match(/create policy gl_cami_product_photos_/g)||[]).length,3);
 assert.match(photoSql,/auth\.uid\(\)/);
 assert.match(photoSql,/storage\.foldername\(name\)/);
 assert.doesNotMatch(photoSql,/drop table|delete from public\.docs|\bto anon\b/i);
});

function launch(userEmail=email,role='dueno',tenant=TENANT,dbHasAccess=true,seedEntries){
 const listeners={};
 const root={id:'gl-mp-panel',innerHTML:''};
 const cards={innerHTML:''},count={textContent:''};
 let rendered=false,fromCalls=[];
 const d={
  querySelector:s=>!rendered?null:s==='#gl-mp-panel'?root:s==='#gl-mp-panel [data-mp-cards]'?cards:s==='#gl-mp-panel [data-mp-count]'?count:null,
  createElement:()=>root,
  body:{append:()=>{rendered=true;},classList:{add(){},remove(){}}},
  addEventListener:(name,fn)=>{listeners[name]=fn;}
 };
 const t=[{id:'t1',name:'Perfume Fem',position:0}];
 const entries=seedEntries||[{id:'e1',tab_id:'t1',product:'Tester 60ml',liked:true,note:'Buen aroma',position:0}];
 const from=(name)=>{
  fromCalls.push(name);
  const q={select(){return q;},eq(){return q;},order(){return q;},
   limit:async()=>({data:dbHasAccess?t.slice(0,1):[],error:null}),
   range:async()=>({data:dbHasAccess?(name.endsWith('tabs')?t:entries):[],error:null})
  };
  return q;
 };
 const host={S:{me:{email:userEmail,tenant_id:tenant}},role:()=>role,isCreadora:()=>role==='creadora',render(){},closePanel(){}};
 const ctx={role:role==='creadora'?'dueno':role,tenant_id:tenant};
 const window={GestLokSupabase:{auth:{getUser:async()=>({data:{user:{id:'owner',email:userEmail}},error:null})},from,
  storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'https://signed.example/'+encodeURIComponent(path)})),error:null})})}},
  history:{state:{},pushState(){},replaceState(){},back(){}},
  addEventListener(){},confirm:()=>true};
 runInNewContext(script,{window,document:d,Date,FormData,console});
 return {mod:window.GestLokMisProductos,ctx,host,root,cards,count,fromCalls,listeners};
}
test('La vista privada presenta hoja y preferencias sin editar stock',async()=>{
 const a=launch();
 await a.mod.refresh(a.ctx,a.host);
 assert.equal(a.mod.authorized(),true);
 assert.match(a.mod.homeTile(),/Mis Productos/);
 await a.mod.open();
 assert.match(a.root.innerHTML,/Perfume Fem/);
 assert.match(a.root.innerHTML,/Tester 60ml/);
 assert.match(a.root.innerHTML,/Buen aroma/);
 assert.match(a.root.innerHTML,/Me gustó/);
 assert.match(a.root.innerHTML,/No me gustó/);
 assert.match(a.root.innerHTML,/gl-mp-card/);
 assert.match(a.root.innerHTML,/Agregar foto/);
 assert.match(a.root.innerHTML,/Imprimir nombre/);
 assert.deepEqual(a.fromCalls,[
  'gestlok_cami_product_tabs','gestlok_cami_product_tabs','gestlok_cami_product_items'
 ]);
});
test('Busca al escribir sin perder el foco y ordena por fecha de ALTA descendente',async()=>{
 const entries=[
  {id:'old',tab_id:'t1',product:'Hawás Ice',note:'',position:0,created_at:'2026-11-01T09:00:00Z',updated_at:'2026-11-09T09:00:00Z'},
  {id:'new',tab_id:'t1',product:'Marshmallow Blush',note:'',position:1,created_at:'2026-11-07T09:00:00Z'},
  {id:'newer',tab_id:'t1',product:'Arabia Tonka',note:'',position:2,created_at:'2026-11-07T12:00:00Z'}
 ];
 const a=launch(email,'dueno',TENANT,true,entries);
 await a.mod.refresh(a.ctx,a.host);
 await a.mod.open();
 assert.match(a.root.innerHTML,/Buscar por nombre/);
 assert.ok(a.root.innerHTML.indexOf('Arabia Tonka')<a.root.innerHTML.indexOf('Marshmallow Blush'));
 assert.ok(a.root.innerHTML.indexOf('Marshmallow Blush')<a.root.innerHTML.indexOf('Hawás Ice'));
 const sendSearch=value=>a.listeners.input({target:{closest:selector=>selector==='[data-mp-search]'?{value}:null}});
 sendSearch('hawas');
 assert.match(a.cards.innerHTML,/Hawás Ice/,'La búsqueda ignora acentos');
 assert.doesNotMatch(a.cards.innerHTML,/Marshmallow Blush|Arabia Tonka/);
 assert.equal(a.count.textContent,'1 de 3 productos');
 sendSearch('nada');
 assert.match(a.cards.innerHTML,/No encontramos productos con ese nombre/);
 sendSearch('');
 assert.ok(a.cards.innerHTML.indexOf('Arabia Tonka')<a.cards.innerHTML.indexOf('Hawás Ice'));
 assert.equal(a.count.textContent,'Más recientes primero');
});
test('Las imágenes de las tarjetas usan URLs firmadas del almacenamiento privado',async()=>{
 const entries=[{id:'e1',tab_id:'t1',product:'Perfume con foto',liked:true,note:'',position:0,
  created_at:'2026-11-07T12:00:00Z',photo_path:'owner/e1/1234-foto.jpg'}];
 const a=launch(email,'dueno',TENANT,true,entries);
 await a.mod.refresh(a.ctx,a.host);
 await a.mod.open();
 assert.match(a.cards.innerHTML,/img src="https:\/\/signed\.example\//);
 assert.match(a.cards.innerHTML,/Cambiar foto/);
 assert.match(a.cards.innerHTML,/Quitar foto/);
 assert.doesNotMatch(a.cards.innerHTML,/storage\/v1\/object\/public/);
});
test('Ni otra cuenta ni Mi Gusto pueden ver ni abrir el cuaderno',async()=>{
 for(const [mail,role,tenant] of [
  ['otra@example.com','dueno',TENANT],
  [email,'gerente',TENANT],
  [email,'dueno','cb0dc04a-9a13-434f-a3d0-47f1d8f39670']
 ]){
  const a=launch(mail,role,tenant);
  await a.mod.refresh(a.ctx,a.host);
  assert.equal(a.mod.homeTile(),'');
  assert.equal(a.mod.authorized(),false);
  assert.equal(a.fromCalls.length,0);
 }
 const denied=launch(email,'dueno',TENANT,false);
 await denied.mod.refresh(denied.ctx,denied.host);
 assert.equal(denied.mod.authorized(),false,'La RLS es el último control de acceso');
});

test('Creadora verificada ve y abre Mis Productos en la empresa de Camila',async()=>{
 const creator=launch('kmu15lopez@gmail.com','creadora',TENANT,true);
 await creator.mod.refresh(creator.ctx,creator.host);
 assert.equal(creator.mod.authorized(),true);
 assert.match(creator.mod.homeTile(),/Mis Productos/);
 await creator.mod.open();
 assert.match(creator.root.innerHTML,/Tester 60ml/);
 const outsider=launch('otra@example.com','creadora',TENANT,true);
 await outsider.mod.refresh(outsider.ctx,outsider.host);
 assert.equal(outsider.mod.authorized(),false);
 assert.equal(outsider.fromCalls.length,0);
});
test('Migración limita permiso de creadora al cuaderno y carpeta de fotos de Camila',()=>{
 const migration=readFileSync('supabase/migrations/20261110011500_zayro_cami_product_creator_access.sql','utf8');
 assert.match(migration,/gestlok_platform\.admins/);
 assert.match(migration,/email_confirmed_at is not null/);
 assert.match(migration,/gestlok_cami_product_tabs/);
 assert.match(migration,/gestlok_cami_product_items/);
 assert.match(migration,/storage\.objects/);
 assert.match(migration,/gestlok-cami-product-photos/);
 assert.doesNotMatch(migration,/disable row level security|\bdrop table\b|delete from public\.docs/i);
});


test('Camila: cámara y edición con IA para todas las pestañas del cuaderno privado',()=>{
 const remover=readFileSync('public/stock/gestlok-product-white-bg.js','utf8');
 assert.match(script,/data-mp-photo-camera/);
 assert.match(script,/capture="environment"/);
 assert.match(script,/data-mp-photo-input/);
 assert.match(script,/gestlok-product-white-bg\.js\?rev=20261111-ia-real-v1/);
 assert.match(script,/gestlok-cami-foto-ia\.js\?rev=20261111-ia-real-v1/);
 assert.match(script,/reviewPhotoBeforeSaving\(item,original,edited,info\)/);
 assert.match(script,/Foto editada con fondo blanco/);
 assert.match(remover,/export async function recortarProducto/);
 assert.match(remover,/removeBackground/);
 assert.match(remover,/quality:'quality'/);
 assert.match(remover,/getImageData\(0,0,w,h\)/);
});

test('Camila: la foto editada y la original se guardan solo en el ID y pestaña seleccionados',()=>{
 const migration=readFileSync('supabase/migrations/20261110224500_cami_product_original_photo_private.sql','utf8');
 assert.match(script,/const targetTab=item\.tab_id, targetId=item\.id/);
 assert.match(script,/const prefix=OWNER_UID\+'\/'\+targetId\+'\/'/);
 assert.match(script,/\.eq\('id',targetId\)\.eq\('tab_id',targetTab\)\.eq\('tenant_id',TENANT\)/);
 assert.match(script,/\.eq\('owner_uid',OWNER_UID\)\.select\('id'\)\.single\(\)/);
 assert.match(script,/photo_path:editedPath,original_photo_path:originalPath/);
 assert.match(script,/saved\.data\?\.id!==targetId/);
 assert.match(script,/storage\.remove\(uploaded\)/);
 assert.match(script,/if\(!committed&&uploaded\.length\)/);
 assert.match(script,/data-mp-photo-original/);
 assert.match(migration,/split_part\(original_photo_path,'\/',2\)=id::text/);
 assert.match(migration,/original_photo_path/);
 assert.doesNotMatch(migration,/update\s+.*(?:stock|cash|caja|ventas)/i);
});

test('La publicación de fondos blancos se limita al tenant ZAYRO',async()=>{
 const {fileAudience,TENANTS}=await import('../scripts/pwa-release-scope.mjs');
 assert.deepEqual(fileAudience('public/stock/gestlok-product-white-bg.js'),[TENANTS.zayro]);
 assert.deepEqual(fileAudience('public/stock/gestlok-mis-productos.js'),[TENANTS.zayro]);
});


test('Fotos nuevas: IA generativa si está activa; si no, versión básica rotulada y sin preguntar nada',()=>{
 // Cámara y galería usan el mismo flujo; también se puede volver a editar el original guardado.
 assert.match(script,/data-mp-photo-camera-input/);
 assert.match(script,/data-mp-photo-input/);
 assert.match(script,/motor\.editarConIA\(original,\{recortar:recortarProducto,pedirIA,onProgress\}\)/);
 assert.match(script,/IA_FN='gestlok-cami-foto-ia'/);
 assert.match(script,/action:'edit',image:await blobToBase64\(blob\)/);
 // Nunca se hace pasar un recorte por edición con IA: la comparación lo rotula «sin IA».
 assert.match(script,/motor\.editarSinIA\(original/);
 assert.match(script,/info=\{modo:'basica',report:r\.report,motivo\}/);
 assert.match(script,/La IA no estuvo disponible: /);
 // La app no pide cuentas, tokens ni elecciones: la IA se activa del lado del servidor.
 assert.doesNotMatch(script,/Account ID|API Token|data-mp-ia-config|data-mp-ia-form|elegirAlternativa|Conectar IA gratuita/);
 assert.doesNotMatch(script,/action:'connect'/);
 assert.match(script,/Versión básica · sin IA/);
 assert.match(script,/Editada con IA · FLUX\.2/);
 assert.match(script,/los textos, etiquetas y formas salen de tu foto real/);
 assert.match(script,/Foto editada con IA guardada en/);
 assert.match(script,/Math\.min\(1,1800\/Math\.max\(image\.naturalWidth,image\.naturalHeight\)\)/);
 assert.match(script,/encode\(\.93\)/);
 assert.doesNotMatch(script,/Estudio automático · fondo blanco/);
 assert.doesNotMatch(script,/sombra lateral/);
 assert.doesNotMatch(script,/api\.cloudflare\.com|CF_API_TOKEN|Bearer /,'El navegador nunca habla con Cloudflare ni ve el token');
});

test('Galería Android conserva la foto antes de redibujar, muestra progreso y permite reintento',()=>{
 assert.match(script,/new Blob\(\[await file\.arrayBuffer\(\)\],\{type:mime\}\)/);
 assert.match(script,/uploadPhoto\(photo\.dataset\.mpPhotoInput\|\|photo\.dataset\.mpPhotoCameraInput,file\)\.finally/);
 assert.match(script,/gestlok-product-white-bg\.js\?rev=20261111-ia-real-v1/);
 assert.match(script,/photoProgress=\{id:targetId/);
 assert.match(script,/data-mp-photo-meter/);
 assert.match(script,/data-mp-photo-retry/);
 assert.match(script,/retryPhoto=\{id:targetId,tabId:targetTab,file:source\}/);
 assert.match(script,/photoErrors\.set\(targetId,mensajeErrorFoto/);
 assert.match(script,/photo_path:editedPath,original_photo_path:originalPath/);
 assert.match(script,/const targetTab=item\.tab_id, targetId=item\.id/);
 assert.match(script,/\.eq\('id',targetId\)\.eq\('tab_id',targetTab\)\.eq\('tenant_id',TENANT\)/);
 assert.match(css,/gl-mp-photo-progress/);
 assert.match(css,/gl-mp-photo-error/);
});
test('Editor usa dos CDN del motor de fondo blanco fijado a versión 0.1.1',()=>{
 const editor=readFileSync('public/stock/gestlok-product-white-bg.js','utf8');
 assert.match(editor,/https:\/\/cdn\.jsdelivr\.net\/npm\/@bg0\/browser@0\.1\.1\/\+esm/);
 assert.match(editor,/https:\/\/esm\.sh\/@bg0\/browser@0\.1\.1/);
 assert.match(editor,/export async function whiteBackground/);
 assert.match(editor,/quality:'quality'/);
 assert.doesNotMatch(editor,/upload\(|storage\.from/);
});

test('Una foto guardada muestra vista previa y descarga únicamente en su producto',async()=>{
 const entries=[{id:'e1',tab_id:'t1',product:'OUL FOR GLORY',liked:null,note:'',
  position:0,photo_path:'owner/e1/edited.jpg',original_photo_path:'owner/e1/original.jpg',
  created_at:'2026-11-11T02:00:00Z'}];
 const a=launch(email,'dueno',TENANT,true,entries);
 await a.mod.refresh(a.ctx,a.host);await a.mod.open();
 assert.match(a.cards.innerHTML,/data-mp-photo-open="e1"/);
 assert.match(a.cards.innerHTML,/Vista previa \/ Descargar/);
 assert.match(a.cards.innerHTML,/Volver a editar foto/);
 assert.doesNotMatch(a.root.innerHTML,/Conectar IA|Account ID|Cloudflare/,'sin pedidos de conexión en pantalla');
 assert.match(a.cards.innerHTML,/Ver original/);
 assert.match(a.cards.innerHTML,/data-mp-chatgpt="e1"/);
 assert.match(a.cards.innerHTML,/data-mp-ai-import="e1"/);
 const noPhoto=launch(email,'dueno',TENANT,true,[{id:'e2',tab_id:'t1',product:'Sin foto',position:0}]);
 await noPhoto.mod.refresh(noPhoto.ctx,noPhoto.host);await noPhoto.mod.open();
 assert.doesNotMatch(noPhoto.root.innerHTML,/data-mp-photo-open/);
 assert.doesNotMatch(noPhoto.root.innerHTML,/data-mp-chatgpt/);
 assert.doesNotMatch(noPhoto.root.innerHTML,/data-mp-ai-import/);
});
test('Exportación de catálogo privada y formatos reales para Instagram/tienda',()=>{
 assert.match(script,/from\(PHOTO_BUCKET\)\.download\(expectedPath\)/);
 assert.match(script,/await assertAccess\(\)/);
 assert.match(script,/expectedTab!==tabId/);
 assert.match(script,/EXPORT_FORMATS=\{/);
 assert.match(script,/cuadrado:\{width:1200,height:1200/);
 assert.match(script,/instagram:\{width:1080,height:1350/);
 assert.match(script,/historia:\{width:1080,height:1920/);
 assert.match(script,/ctx\.drawImage\(image,\(dims\.width-w\)\/2,\(dims\.height-h\)\/2,w,h\)/);
 assert.match(script,/canvas\.toBlob\(blob/);
 assert.match(script,/link\.download='gestlok-'\+name\+'-'\+current\.format\+'\.jpg'/);
 assert.match(script,/data-mp-export-clean/);
 assert.match(script,/gl-mp-export-clean/);
 assert.match(script,/if\(exportPreview\)\{removeExportModal\(\);return;\}/);
 assert.match(script,/async function enhanceExistingPhoto\(id\)/);
 assert.match(script,/await uploadPhoto\(id,photo\.data,true\)/);
 assert.match(css,/gl-mp-export-stage/);
 assert.match(css,/gl-mp-export-clean/);
 assert.doesNotMatch(script,/getPublicUrl\(/);
});

test('ChatGPT Plus: el envío es manual y no se emplea una API paga',()=>{
 assert.match(script,/function promptChatGPT\(item\)/);
 assert.match(script,/https:\/\/chatgpt\.com\//);
 assert.match(script,/navigator\.share\(\{files:\[flow\.file\],text:flow\.prompt\}\)/);
 assert.match(script,/navigator\.clipboard\?\.writeText/);
 assert.match(script,/data-mp-chat-download/);
 assert.match(script,/data-mp-chat-import/);
 assert.match(script,/data-mp-ai-import-input/);
 assert.match(script,/async function importAIPhoto\(id,file\)/);
 assert.match(script,/const original=await storage\.download\(originalPath\)/);
 assert.match(script,/const edited=await compressPhoto\(source\)/);
 assert.match(script,/reviewPhotoBeforeSaving\(item,original\.data,edited,\{modo:'importada'\}\)/);
 assert.match(script,/\.eq\('id',targetId\)\.eq\('tab_id',targetTab\)\.eq\('tenant_id',TENANT\)\.eq\('owner_uid',OWNER_UID\)/);
 assert.match(script,/\.eq\('original_photo_path',originalPath\)\.eq\('photo_path',oldEdited\)/);
 assert.match(script,/photo_path:path,updated_at/);
 assert.match(script,/if\(!committed&&uploaded\).*storage\.remove/);
 assert.doesNotMatch(script,/OPENAI_API_KEY|ANTHROPIC_API_KEY|api\.openai\.com|api\.anthropic\.com/);
 assert.doesNotMatch(script,/getPublicUrl\(/);
 assert.match(css,/\[data-mp-chatgpt-modal\]/);
 assert.match(css,/gl-mp-chat-buttons/);
});
test('Edición con IA gratuita queda aislada de stock y Mi Gusto',()=>{
 assert.match(script,/data-mp-photo-enhance/);
 assert.match(script,/Editar con IA · Gratis/);
 assert.match(script,/await uploadPhoto\(id,photo\.data,true\)/);
 assert.match(script,/gestlok-product-white-bg\.js\?rev=20261111-ia-real-v1/);
 assert.match(script,/validContext\(ctx,host\)/);
 assert.doesNotMatch(script,/gestlok_pilot_products|gestlok_pilot_pos_sales|mi_gusto_whatsapp/);
 assert.match(runtime,/gestlok-mis-productos\.js\?rev=cami-ia-sin-pedir-v2-20261111/);
});

test('Estudio automático: sombras neutras se aclaran, tapones negros se conservan y el vidrio mantiene color',async()=>{
 const editor=readFileSync('public/stock/gestlok-product-white-bg.js','utf8');
 const {balanceStudioLighting}=await import('data:text/javascript;base64,'+Buffer.from(editor,'utf8').toString('base64'));
 // Caja blanca a la sombra, tapón negro, perfume ámbar y borde translúcido.
 const pixels=new Uint8ClampedArray([
  110,110,110,255,
  27,27,28,255,
  180,143,68,255,
  120,120,120,100
 ]);
 const edited=balanceStudioLighting(pixels);
 assert.ok(edited[0]>=176&&edited[0]<=205,'levantar de verdad la sombra gris de caja blanca');
 assert.deepEqual(Array.from(edited.slice(4,8)),[27,27,28,255],'el tapón negro conserva su tono');
 assert.ok(edited[8]>edited[9]&&edited[9]>edited[10],'vidrio ámbar mantiene jerarquía de color');
 assert.deepEqual(Array.from(edited.slice(12,16)),[120,120,120,100],'no crear halo en el contorno semitransparente');
 assert.match(editor,/quality:'quality'/);
 assert.doesNotMatch(editor,/groundShadow|createRadialGradient|api\.openai\.com/);
});
