import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('WAI trial route never uses production config, links preserve trial, operator verifies role',()=>{
 const html=read('public/chat/wai/prueba/index.html'), cfg=read('public/chat/wai/prueba/config.js'),js=read('public/chat/wai/wai.js');
 assert.match(html,/\/chat\/wai\/prueba\/config\.js/);assert.doesNotMatch(html,/src="\/chat\/config\.js"/);
 assert.match(cfg,/irqeitzbfyerxcrogkyh\.supabase\.co/);assert.doesNotMatch(cfg,/vgsepaaewbctjsjcpeta/);
 assert.match(js,/trialPanel&&result\?\.administradora!==true/);
 assert.match(js,/const portalHref=s=>portalBase/);
 assert.match(js,/p_accion:'estado',p_id:r\.id,p_habilitada:!r\.habilitada/);
});
test('public WAI demo is illustrative and contains no network or production data',()=>{
 const h=read('public/wai/demo/index.html'),js=read('public/wai/demo/wai-demo.js');
 assert.match(h,/DATOS FICTICIOS/);assert.match(h,/Simular pedido/);assert.doesNotMatch(js,/fetch\(|supabase|localStorage|XMLHttpRequest/);
 assert.doesNotMatch(h,/\+549\d{10}/);
});
