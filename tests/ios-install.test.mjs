import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('public/stock/gestlok-ios-install.js');
function fixture({ua='Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',platform='iPhone',touch=5,standalone=false}={}){
 const children=[],callbacks={};
 const card={appendChild(node){children.push(node);}};
 const document={
   readyState:'complete',
   querySelector(sel){return sel==='#auth .au-card'?card:null;},
   getElementById(id){return children.find(c=>c.id===id)||null;},
   createElement(tag){return {tag,innerHTML:'',id:'',className:''};},
   addEventListener(name,fn){callbacks[name]=fn;}
 };
 const navigator={userAgent:ua,platform,maxTouchPoints:touch,standalone};
 const window={matchMedia:()=>({matches:standalone})};
 vm.runInNewContext(source,{document,navigator,window});
 return {children,document,window};
}
test('iPhone/iPad abre instrucciones visibles sin permisos ni descargas',()=>{
 for(const [ua,platform] of [
   ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1','iPhone'],
   ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1','iPad'],
   ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1','MacIntel']
 ]){
   const f=fixture({ua,platform});
   assert.equal(f.children.length,1);
   const html=f.children[0].innerHTML;
   for(const phrase of ['Compartir','Agregar a pantalla de inicio','Abrir como app','Safari','gestlok.com.ar']) assert.ok(html.includes(phrase),phrase);
   assert.doesNotMatch(html,/automáticamente instalada|App Store para descargar/i);
   f.window.GestLokIOSInstall.mount();
   assert.equal(f.children.length,1,'la guía no se duplica');
 }
});
test('Ni Android ni la PWA de iOS ya instalada reciben indicaciones repetidas',()=>{
 assert.equal(fixture({ua:'Mozilla/5.0 (Linux; Android 15; Pixel) Chrome/137',platform:'Linux armv8l'}).children.length,0);
 assert.equal(fixture({standalone:true}).children.length,0);
});
test('El manifiesto Apple y el diseño mobile siguen integrados',()=>{
 const manifest=JSON.parse(read('public/manifest.webmanifest'));
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.id,'./');
 assert.equal(manifest.start_url,'./');
 const layout=read('app/layout.tsx'),runtime=read('components/stock-runtime.tsx');
 assert.match(layout,/apple:\s*`\$\{basePath\}\/icons\/gestlok-apple-v2-180\.png/);
 assert.match(layout,/appleWebApp:\s*\{ capable: true/);
 assert.match(layout,/viewportFit:\s*'cover'|viewportFit:\s*"cover"/);
 assert.match(layout,/gestlok-ios-install\.css/);
 assert.match(runtime,/if \(!visitor\) await load\("\/stock\/gestlok-ios-install\.js/);
 assert.match(read('scripts/sw-template.js'),/'\/stock\/gestlok-ios-install\.js'/);
 assert.match(read('app/gestlok-ios-install.css'),/font-size:16px/);
 assert.match(read('app/mobile-navigation.css'),/safe-area-inset-bottom/);
});
