import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('El sitio público muestra Plan Scanner en video y no ofrece la demo interactiva',()=>{
 const home=read('app/page.tsx');
 const conocer=read('app/conocer/page.tsx');
 const auth=read('public/stock/auth.js');
 assert.ok(home.includes('href="/conocer/#video"'));
 assert.ok(conocer.includes('id="video"'));
 assert.ok(conocer.includes('gestlok-plan-scanner-sobrio-32s.mp4'));
 assert.ok(conocer.includes('controls')&&conocer.includes('playsInline'));
 assert.ok(!conocer.includes('href="/?demo=1"'));
 assert.ok(auth.includes('Mirá Plan Scanner en video'));
 assert.ok(auth.includes("link.href='/conocer/#video'"));
 assert.ok(!home.includes('Probar GESTLOK · Demo'));
});
test('Los recursos del video son archivos reales y ligeros',()=>{
 const v=new URL('../public/videos/gestlok-plan-scanner-sobrio-32s.mp4',import.meta.url);
 const image=new URL('../public/videos/gestlok-plan-scanner-sobrio-cover.jpg',import.meta.url);
 assert.ok(statSync(v).size>750000&&statSync(v).size<5000000);
 assert.equal(readFileSync(v).subarray(4,8).toString(),'ftyp');
 assert.ok(statSync(image).size>1000);
});
