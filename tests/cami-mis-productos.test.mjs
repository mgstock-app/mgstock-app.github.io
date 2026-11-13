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
 assert.match(runtime,/cami-belisa-descarga-v2-20261113/);
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


test('Camila: agregar foto desde la galería o con la cámara en todas las pestañas',()=>{
 assert.match(script,/data-mp-photo-btn/);
 assert.match(script,/\+ Agregar foto/);
 assert.match(script,/data-mp-photo-camera/);
 assert.match(script,/📷 Sacar foto/);
 assert.match(script,/capture="environment"/);
 assert.match(script,/data-mp-photo-input/);
 assert.match(script,/accept="image\/jpeg,image\/png,image\/webp"/);
 assert.match(script,/uploadPhoto\(photo\.dataset\.mpPhotoInput\|\|photo\.dataset\.mpPhotoCameraInput,file\)\.finally/);
});

test('Camila: la foto conserva fondo y textura originales al mejorar la luz y antes de guardar',()=>{
 // No segmentación, fondo blanco ni servicios de IA: la foto conserva todo su escenario real.
 assert.doesNotMatch(script,/editarConIA|gestlok-cami-foto-ia|gestlok-product-white-bg|ChatGPT|chatgpt|data-mp-ai-import|Cloudflare|Account ID/);
 assert.match(script,/FOTO_REAL_URL='\/stock\/gestlok-cami-foto-real\.js\?rev=20261113-belisa-fondo-real-v1'/);
 assert.match(script,/editarFotoReal\(original,\{onProgress:stage/);
 assert.doesNotMatch(script,/editarFotoCartulina\(original|recortarProducto\(original|import\(RECORTE_URL\)/);
 assert.match(script,/Conserva el fondo negro, su textura y los colores reales/);
 assert.match(script,/Editada · fondo real/);
 assert.match(script,/elegida=await elegirFoto\(item,original,edited,motivo\)/);
 assert.match(script,/Guardar editada/);
 assert.match(script,/Guardar original/);
 assert.match(script,/data-mp-photo-choice="cancelar"/);
 assert.match(script,/No se pudo editar esta foto/);
 assert.match(script,/const photo=elegida==='editada'&&edited\?edited:original/);
 assert.match(script,/Math\.min\(1,1800\/Math\.max\(image\.naturalWidth,image\.naturalHeight\)\)/);
 assert.match(script,/const targetTab=item\.tab_id, targetId=item\.id/);
 assert.match(script,/photo_path:path,original_photo_path:originalPath/);
 assert.match(script,/\.eq\('id',targetId\)\.eq\('tab_id',targetTab\)\.eq\('tenant_id',TENANT\)/);
 assert.match(script,/\.eq\('owner_uid',OWNER_UID\)\.select\('id'\)\.single\(\)/);
 assert.match(script,/saved\.data\?\.id!==targetId/);
 assert.match(script,/if\(!committed&&uploaded\.length\)try\{await storage\.remove\(uploaded\)/);
 assert.doesNotMatch(script,/getPublicUrl\(/);
 assert.match(css,/\[data-mp-photo-preview\]/);
 assert.match(css,/gl-mp-photo-pair/);
 assert.doesNotMatch(css,/gl-mp-chat|data-mp-chatgpt-modal|gl-mp-free-ai|gl-mp-ia-/);
});

test('La publicación de Mis Productos se limita al tenant ZAYRO',async()=>{
 const {fileAudience,TENANTS}=await import('../scripts/pwa-release-scope.mjs');
 assert.deepEqual(fileAudience('public/stock/gestlok-cami-foto-estudio.js'),[TENANTS.zayro]);
 assert.deepEqual(fileAudience('public/stock/gestlok-cami-foto-real.js'),[TENANTS.zayro]);
 assert.deepEqual(fileAudience('public/stock/gestlok-cami-recorte.js'),[TENANTS.zayro]);
 assert.deepEqual(fileAudience('public/stock/gestlok-mis-productos.js'),[TENANTS.zayro]);
 assert.deepEqual(fileAudience('app/gestlok-mis-productos.css'),[TENANTS.zayro]);
});

test('Galería Android conserva la foto antes de redibujar, muestra progreso y permite reintento',()=>{
 assert.match(script,/new Blob\(\[await file\.arrayBuffer\(\)\],\{type:mime\}\)/);
 assert.match(script,/photoProgress=\{id:targetId/);
 assert.match(script,/data-mp-photo-meter/);
 assert.match(script,/data-mp-photo-retry/);
 assert.match(script,/>Reintentar<\/button>/);
 assert.match(script,/retryPhoto=\{id:targetId,tabId:targetTab,file:source\}/);
 assert.match(script,/photoErrors\.set\(targetId,mensajeErrorFoto/);
 assert.match(css,/gl-mp-photo-progress/);
 assert.match(css,/gl-mp-photo-error/);
});

test('Una foto guardada se ve en la vista previa y se descarga únicamente en su producto',async()=>{
 const entries=[{id:'e1',tab_id:'t1',product:'OUD FOR GLORY',liked:null,note:'',
  position:0,photo_path:'owner/e1/foto.jpg',original_photo_path:null,created_at:'2026-11-11T02:00:00Z'}];
 const a=launch(email,'dueno',TENANT,true,entries);
 await a.mod.refresh(a.ctx,a.host);await a.mod.open();
 assert.match(a.cards.innerHTML,/data-mp-photo-open="e1"/);
 assert.match(a.cards.innerHTML,/Vista previa \/ Descargar/);
 assert.match(a.cards.innerHTML,/Cambiar foto/);
 assert.match(a.cards.innerHTML,/Quitar foto/);
 assert.doesNotMatch(a.cards.innerHTML,/Editar con IA|ChatGPT|Ver original|Importar edición|Volver a editar/);
 const noPhoto=launch(email,'dueno',TENANT,true,[{id:'e2',tab_id:'t1',product:'Sin foto',position:0}]);
 await noPhoto.mod.refresh(noPhoto.ctx,noPhoto.host);await noPhoto.mod.open();
 assert.doesNotMatch(noPhoto.root.innerHTML,/data-mp-photo-open/);
 assert.match(noPhoto.root.innerHTML,/Agregar foto/);
});

test('Vista previa privada: ver en grande, descargar y cerrar, sin formatos ni edición',()=>{
 assert.match(script,/from\(PHOTO_BUCKET\)\.download\(expectedPath\)/);
 assert.match(script,/await assertAccess\(\)/);
 assert.match(script,/expectedTab!==tabId/);
 assert.match(script,/VISTA PREVIA · FOTO GUARDADA/);
 assert.match(script,/data-mp-export-download>Descargar imagen/);
 assert.match(script,/data-mp-photo-download href=/);
 assert.match(script,/Descargar imagen editada/);
 assert.match(script,/Descargar imagen original/);
 assert.match(script,/nombreArchivoFoto\\(item,edited/);
 assert.match(script,/link\.download=nombreArchivoFoto\(current\.item\)/);
 assert.match(script,/data-mp-export-clean>Ver en grande/);

 assert.match(script,/if\(exportPreview\)\{removeExportModal\(\);return;\}/);
 assert.doesNotMatch(script,/EXPORT_FORMATS|data-mp-export-format|composeExport/);
 assert.match(css,/gl-mp-export-stage/);
 assert.match(css,/gl-mp-export-clean/);
 assert.match(runtime,/gestlok-mis-productos\.js\?rev=cami-belisa-descarga-v2-20261113/);
 assert.doesNotMatch(script,/gestlok_pilot_products|gestlok_pilot_pos_sales|mi_gusto_whatsapp/);
});
