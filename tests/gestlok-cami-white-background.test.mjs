import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ui=read('public/stock/gestlok-mis-productos.js');
const bg=read('public/stock/gestlok-cami-white-background.mjs');
const sql=read('supabase/migrations/20261110225000_cami_original_photo_per_product.sql');
const runtime=read('components/stock-runtime.tsx');

test('Mis Productos compila, editor de foto con fondo blanco es opt-in por producto',()=>{
 new vm.Script(ui);
 new vm.Script(bg.replace(/^export /gm,''));
 assert.match(ui,/data-mp-camera-btn/);
 assert.match(ui,/capture="environment"/);
 assert.match(ui,/data-mp-photo-save-edited/);
 assert.match(ui,/data-mp-photo-save-original/);
 assert.match(ui,/data-mp-photo-retry/);
 assert.match(ui,/gestlok-cami-white-background\.mjs/);
 assert.match(runtime,/gestlok-mis-productos\.js\?rev=cami-fondo-blanco-20261110/);
});

test('Un guardado de foto solo modifica ficha exacta de Camila, no otra empresa ni pestaña',()=>{
 assert.match(ui,/const TENANT='2a97bf8d-7d08-4aa7-b051-5d1a4dc80103'/);
 assert.match(ui,/const EMAIL='camilab\.lopez99@gmail\.com'/);
 assert.match(ui,/const PHOTO_BUCKET='gestlok-cami-product-photos'/);
 assert.match(ui,/session\.epoch!==epoch\|\|session\.tabId!==tabId/);
 assert.match(ui,/x\.id===session\.id/); // ID captured at selection and never resolved from displayed product name
 assert.match(ui,/\.eq\('id',session\.id\)\.eq\('tab_id',session\.tabId\)\.eq\('tenant_id',TENANT\)/);
 assert.match(ui,/\.eq\('owner_uid',OWNER_UID\)/);
 assert.match(ui,/target\.is\('photo_path',null\)/);
 assert.match(ui,/\.select\('id'\)\.single\(\)/);
 assert.match(ui,/photo_path:editedPath,original_photo_path:originalPath/);
 assert.match(ui,/storage\.remove\(uploaded\)/);
 assert.match(ui,/data-mp-photo-original/);
 assert.match(sql,/original_photo_path IS NULL/);
 assert.match(sql,/split_part\(original_photo_path,'\/',2\)=id::text/);
 assert.doesNotMatch(sql,/gestlok_pilot_|gestlok_mg_|stock_local|caja/i);
});

test('El recorte usa inferencia local con IS-Net Apache, no sustituye envases ni sube fotos externas',()=>{
 assert.match(bg,/onnxruntime-web@1\.23\.2/);
 assert.match(bg,/Ko033\/isnet-general-use-onnx/);
 assert.match(bg,/executionProviders:\['wasm'\]/);
 assert.match(bg,/\.drawImage\(base,minX,minY,productW,productH,dx,dy,dw,dh\)/);
 assert.doesNotMatch(bg,/fetch\(file|FormData|remove\.bg|apiKey|generateImage/);
 assert.match(ui,/No se pudo quitar el fondo automáticamente/);
 assert.match(ui,/La foto original sigue disponible/);
});
