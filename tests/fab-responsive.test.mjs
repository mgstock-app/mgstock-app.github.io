import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('public/stock/app.js');
const css=read('app/globals.css');
test('Stock Local conserva la planilla de escritorio y adapta tablet/móvil',()=>{
  assert.match(css, /@media screen and \(min-width:700px\) and \(max-width:1150px\)/);
  assert.match(css, /grid-template-areas:"product total local factory"/);
  assert.match(css, /@media screen and \(max-width:699px\)/);
  assert.match(css, /grid-template-areas:"product product" "local factory"/);
  assert.match(css, /@media screen and \(max-width:365px\)/);
  assert.match(css, /\.xl-r\.gl-folded-row\{display:none!important\}/);
  assert.match(css, /@media print/);
  assert.doesNotThrow(()=>new vm.Script(app));
});
test('Cada categoría mantiene todos sus productos y se puede plegar sin modificar cantidades',()=>{
  assert.match(app, /const porBloque=new Map\(\)/);
  assert.match(app, /class="gl-bq-count"/);
  assert.match(app, /data-act="fab-toggle-block"/);
  assert.match(app, /aria-expanded="/);
  assert.match(app, /case 'fab-toggle-block': toggleFabBloque\(t\.dataset\.b\)/);
  assert.match(app, /S\.fabFolded\[fabFoldKey\(n\)\]=!fabIsFolded\(n\)/);
  assert.match(app, /fabIsFolded\(bloqueOf\(it\)\) \? 'gl-folded-row' : ''/);
  assert.match(app, /data-act="fstep"/);
  assert.match(app, /data-act="ffrac"/);
});
