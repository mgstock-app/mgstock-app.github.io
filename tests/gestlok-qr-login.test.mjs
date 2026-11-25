import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('QR login is isolated from normal login and demo; JS parses',()=>{
 const js=read('public/stock/gestlok-qr-login.js');
 new vm.Script(js);
 const rt=read('components/stock-runtime.tsx');
 assert.match(rt,/if \(!visitor\) await load\("\/stock\/gestlok-qr-login.js/);
 assert.match(js,/auth\.setSession/);assert.match(js,/history\.replaceState/);
 assert.match(js,/r\.state==='ready'/);
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
});
test('only desktop proof claims, QR expires, replay consumed and MFA not bypassed',()=>{
 const sql=read('supabase/migrations/20261125220000_gestlok_qr_login.sql');
 assert.match(sql,/interval '2 minutes'/);assert.match(sql,/for update/);
 assert.match(sql,/state='consumed'/);assert.match(sql,/scan_hash else desktop_hash/);
 assert.match(sql,/auth\.sessions/);assert.match(sql,/auth\.mfa_factors/);
 assert.match(sql,/grant execute.*to service_role/);assert.match(sql,/enable row level security/);
 const edge=read('supabase/functions/gestlok-qr-login/index.ts');
 assert.match(edge,/auth\.getUser\(token\)/);
 assert.match(edge,/phone\.rpc\("mi_acceso"\)/);
 assert.match(edge,/b\.confirm!==true/);assert.match(edge,/mfa\.listFactors/);
 assert.match(edge,/generateLink/);assert.match(edge,/verifyOtp/);
 assert.match(edge,/s\.user\.id!==u\.id/);
 assert.match(edge,/Cache-Control":"no-store/);
});
