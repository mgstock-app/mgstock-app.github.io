import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/stock/app.js','utf8');
test('El inicio de creadora muestra ambas tarjetas y el área empresa abre el panel operativo',()=>{
 const start=source.indexOf('V.inicio = () => {')+'V.inicio = () => {'.length;
 const code=source.slice(start,source.indexOf('  const ps = sorted()',start));
 const S={creatorBusiness:false};
 const ctx={S,miRol:()=> 'creadora',banners:()=>'',window:{GestLokOwnerAreas:{view:()=> 'TARJETA EMPRESA + TARJETA EMPLEADOS'}},localesMios:()=>[],lcard(){},inicioOperativo:()=> 'PANEL OPERATIVO'};
 vm.createContext(ctx);vm.runInContext('function inicio(){'+code+'}',ctx);
 assert.match(ctx.inicio(),/TARJETA EMPRESA \+ TARJETA EMPLEADOS/);
 S.creatorBusiness=true;assert.equal(ctx.inicio(),'PANEL OPERATIVO');
});
test('Entrar al local y volver a Inicio restauran las tarjetas',()=>{
 const open=source.slice(source.indexOf('function abrirLocal(id){'),source.indexOf('function mostrarHub(){'));
 assert.match(open,/S\.creatorBusiness=false;/);
 assert.doesNotMatch(open,/S\.creatorBusiness=isCreadora/);
 assert.match(source,/if\(v === 'inicio'\) S\.creatorBusiness=false;/);
 assert.match(open,/removeItem\('gestlok-preview-rol'\)/);
});
