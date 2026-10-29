import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const stock=read('app/responsive-global.css');
const employees=read('modules/empleados/styles/responsive-global.css');
const layout=read('app/layout.tsx');
const employeesLayout=read('modules/empleados/app/layout.tsx');
test('capas responsive importadas al final de los estilos existentes',()=>{
  assert.match(layout,/import "\.\/gestlok-orders\.css";\s*import "\.\/responsive-global\.css";/);
  assert.match(employeesLayout,/import "@\/styles\/desktop-gestlok\.css";\s*import "@\/styles\/responsive-global\.css";/);
});
test('breakpoints y anchos útiles en móvil, tablet y PC',()=>{
  for(const css of [stock,employees]){
    assert.match(css,/@media screen and \(max-width:767px\)/);
    assert.match(css,/@media screen and \(min-width:768px\) and \(max-width:1023px\)/);
    assert.match(css,/@media screen and \(min-width:1024px\)/);
    assert.match(css,/min-width:0/);
  }
  assert.match(stock,/\.auth:has\(\[data-mode="in"\]:not\(\[hidden\]\)\) \.au-card/);
  assert.match(stock,/grid-template-columns:minmax\(0,1fr\)/);
  assert.match(stock,/\.gl-owner-landing \.gl-owner-areas/);
  assert.match(stock,/\.gl-ch-main/);
  assert.match(employees,/\.gi-admin-content/);
  assert.match(employees,/\.gl-employee-main/);
  assert.match(employees,/\.schedule-table/);
  assert.match(employees,/\.jsi-card/);
});
test('no se alteran autenticación, roles, usuarios, datos, ni logos',()=>{
  for(const css of [stock,employees]){
    assert.doesNotMatch(css,/data:(?:image|font)\/|@import\s+url|filter:\s*invert/i);
    assert.doesNotMatch(css,/display\s*:\s*none\s*!important/i);
  }
});
