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
 assert.match(runtime,/cami-fotos-estudio-preview-20261111/);
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


test('Camila: cámara y edición con fondo blanco para todas las pestañas del cuaderno privado',()=>{
 const remover=readFileSync('public/stock/gestlok-product-white-bg.js','utf8');
 assert.match(script,/data-mp-photo-camera/);
 assert.match(script,/capture="environment"/);
 assert.match(script,/data-mp-photo-input/);
 assert.match(script,/gestlok-product-white-bg\.js/);
 assert.match(script,/reviewPhotoBeforeSaving\(item,original,edited\)/);
 assert.match(script,/Foto editada con fondo blanco/);
 assert.match(remover,/removeBackground/);
 assert.match(remover,/quality:'fast'/);
 assert.match(remover,/rgba|alpha|a\[\(y\*w\+x\)\*4\+3\]/);
 assert.match(remover,/c\.fillStyle='#fff'/);
 assert.match(remover,/canvas\.toBlob/);
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


test('Todas las fotos nuevas de Camila usan automáticamente fondo blanco y sombra lateral suave',()=>{
 const editor=readFileSync('public/stock/gestlok-product-white-bg.js','utf8');
 // Mismo motor para cámara y galería; no hay un bypass de sombra.
 assert.match(script,/data-mp-photo-camera-input/);
 assert.match(script,/data-mp-photo-input/);
 assert.match(script,/const edited=await whiteBackground\(original,/);
 assert.match(script,/reviewPhotoBeforeSaving\(item,original,edited\)/);
 assert.match(script,/Fondo blanco y sombra lateral|fondo blanco y sombra lateral/);
 assert.match(script,/Blanco \+ sombra lateral/);
 assert.match(editor,/const ratio=Math\.min\(980\/cw,860\/ch\)/);
 assert.match(editor,/const productX=\(1200-productW\)\/2,productY=1005-productH/);
 assert.match(editor,/function groundShadow\(x,y,rx,ry,strength\)/);
 assert.match(editor,/c\.createRadialGradient\(0,0,0,0,0,1\)/);
 assert.match(editor,/groundShadow\(productX\+productW\*\.55/);
 assert.match(editor,/groundShadow\(productX\+productW\*\.67/);
 assert.match(editor,/c\.drawImage\(img,productX-minX\*ratio,productY-minY\*ratio,w\*ratio,h\*ratio\)/);
 assert.doesNotMatch(editor,/c\.drawImage\(silhouette/,'No proyectar silueta desplazada');
 assert.doesNotMatch(editor,/c\.transform\(ratio/,'No crear sombra tipo producto flotante');
 assert.doesNotMatch(editor,/fetch\(source|FormData|apiKey/,'Sin subir foto a proveedor de IA externo');
});

test('Galería Android conserva la foto antes de redibujar, muestra progreso y permite reintento',()=>{
 assert.match(script,/new Blob\(\[await file\.arrayBuffer\(\)\],\{type:mime\}\)/);
 assert.match(script,/uploadPhoto\(photo\.dataset\.mpPhotoInput\|\|photo\.dataset\.mpPhotoCameraInput,file\)\.finally/);
 assert.match(script,/gestlok-product-white-bg\.js\?rev=20261111-estudio-v3/);
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
 assert.match(editor,/quality:'fast'/);
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
 assert.match(a.cards.innerHTML,/Mejorar foto guardada/);
 assert.match(a.cards.innerHTML,/Ver original/);
 const noPhoto=launch(email,'dueno',TENANT,true,[{id:'e2',tab_id:'t1',product:'Sin foto',position:0}]);
 await noPhoto.mod.refresh(noPhoto.ctx,noPhoto.host);await noPhoto.mod.open();
 assert.doesNotMatch(noPhoto.root.innerHTML,/data-mp-photo-open/);
 assert.doesNotMatch(noPhoto.root.innerHTML,/Mejorar foto guardada/);
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
