import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync("public/stock/gestlok-updates.js","utf8");
const app=readFileSync("public/stock/app.js","utf8");
const css=readFileSync("app/globals.css","utf8");
const sw=readFileSync("scripts/sw-template.js","utf8");

function updateAPI(){
  const win={};
  const ctx=vm.createContext({window:win,document:{addEventListener(){}},navigator:{},Intl,Date,Number,Math,String,Array,RegExp,crypto:{randomUUID:()=>"test-id"}});
  vm.runInContext(source,ctx);
  return win.GestLokUpdates;
}
test("Vencimientos calcula fechas reales, incluidos meses bisiestos",()=>{
  const a=updateAPI();
  assert.equal(a.plusDays("2028-02-28",1),"2028-02-29");
  assert.equal(a.plusDays("2028-02-28",2),"2028-03-01");
  assert.equal(a.plusDays("2026-01-31",30),"2026-03-02");
  assert.equal(a.plusDays("2026-02-30",30),"");
  assert.equal(a.plusDays("2026-02-01",0),"");
  assert.equal(a.dateAR("2026-11-03"),"03/11/26");
});
test("Colores: >=6 verde, 1-5 naranja, 0 amarillo y negativos rojo",()=>{
  const api=updateAPI(), today=api.todayISO(), base=new Date(today+"T00:00:00Z");
  const at=n=>new Date(base.getTime()+n*86400000).toISOString().slice(0,10);
  assert.equal(api.stateOf(at(6)).cls,"valid");
  assert.equal(api.stateOf(at(5)).cls,"soon");
  assert.equal(api.stateOf(at(1)).cls,"soon");
  assert.equal(api.stateOf(at(0)).cls,"today");
  assert.equal(api.stateOf(at(-1)).cls,"expired");
});
test("Vencimientos, Avisos y CSS están integrados en el menú",()=>{
  assert.match(app,/data-go="vencimientos"/);
  assert.match(app,/data-go="avisos"/);
  assert.match(app,/LOCAL_COLS = \[[^\]]*'vencimientos'[^\]]*'avisos'/);
  assert.match(app,/C\('vencimientos'\)\.onSnapshot/);
  assert.match(app,/C\('avisos'\)\.orderBy/);
  for(const status of ["valid","soon","today","expired"]){
    assert.match(css,new RegExp("\\.gl-exp-state\\."+status));
  }
});
test("Las notificaciones push quedan deshabilitadas y solo hay avisos internos",()=>{
  assert.doesNotMatch(sw,/addEventListener\('push'/);
  assert.doesNotMatch(sw,/showNotification/);
  assert.doesNotMatch(app,/GestLokPush/);
  assert.doesNotMatch(source,/push-enable|push-disable/);
});
test("Nunca se precrean vencimientos ficticios en producción",()=>{
  assert.doesNotMatch(source,/C\('vencimientos'\)\.add\(\s*\{\s*nombre:\s*'Fumigación'/);
  assert.doesNotMatch(source,/localStorage\.setItem\('vencimientos'/);
});

test("Inicio: fechas vigentes (>=6 días) y archivados no producen alerta",()=>{
  const api=updateAPI(), today=api.todayISO(), epoch=Date.parse(today+"T00:00:00Z");
  const at=n=>new Date(epoch+n*86400000).toISOString().slice(0,10);
  const items=[
    {id:"renovado",nombre:"Fumigación",fechaVencimiento:at(30),activo:true},
    {id:"vigente",nombre:"Campana",fechaVencimiento:at(6),activo:true},
    {id:"archivado",nombre:"Servicio archivado",fechaVencimiento:at(-7),activo:false},
    {id:"incorrecto",nombre:"Fecha errónea",fechaVencimiento:"2026-13-99",activo:true}
  ];
  assert.equal(api.homeDueItems(items).length,0);
  assert.equal(api.homeDueItems([]).length,0);
});
test("Inicio: avisos de mañana, hoy, pronto y vencido ordenados",()=>{
  const api=updateAPI(), today=api.todayISO(), epoch=Date.parse(today+"T00:00:00Z");
  const at=n=>new Date(epoch+n*86400000).toISOString().slice(0,10);
  const items=[
    {id:"p5",nombre:"Limpieza",fechaVencimiento:at(5),activo:true},
    {id:"tm",nombre:"Fumigación",fechaVencimiento:at(1),activo:true},
    {id:"expired",nombre:"Análisis",fechaVencimiento:at(-2),activo:true},
    {id:"today",nombre:"Extintores",fechaVencimiento:at(0),activo:true},
    {id:"hidden",nombre:"Servicio vigente",fechaVencimiento:at(7),activo:true}
  ];
  const s=api.homeDueItems(items);
  assert.deepEqual(Array.from(s,x=>x.id),["expired","today","tm","p5"]);
  assert.deepEqual(Array.from(s,x=>x.vencimiento.cls),["expired","today","soon","soon"]);
  api.attach({S:{local:"munro",vencimientos:items},localNombre:()=>"Sucursal Centro"});
  const html=api.homeDue();
  assert.match(html,/Fumigación vence mañana/);
  assert.match(html,/Extintores vence hoy/);
  assert.match(html,/Limpieza vence en 5 días/);
  assert.match(html,/Análisis: plazo vencido/);
  assert.match(html,/Sucursal Centro/);
  assert.match(html,/data-go="vencimientos"/);
  assert.doesNotMatch(html,/Servicio vigente/);
});
test("Inicio: datos de la sucursal actual y textos peligrosos se escapan",()=>{
  const api=updateAPI(), today=api.todayISO(), epoch=Date.parse(today+"T00:00:00Z");
  const at=n=>new Date(epoch+n*86400000).toISOString().slice(0,10);
  api.attach({S:{local:"munro",vencimientos:[
    {id:"bad",nombre:'Fumigación <img src=x onerror=alert(1)>',fechaVencimiento:at(-1),activo:true}
  ]},localNombre:()=>'<Centro>'});
  const html=api.homeDue();
  assert.doesNotMatch(html,/<img/);
  assert.doesNotMatch(html,/<Centro>/);
  assert.match(html,/&lt;img/);
  assert.match(html,/&lt;Centro&gt;/);
  api.attach({S:{local:"torcuato",vencimientos:[]},localNombre:()=>"Torcuato"});
  assert.equal(api.homeDue(),"");
  api.attach({S:{local:"torcuato",vencimientos:[
    {nombre:"Limpieza",fechaVencimiento:at(12),activo:true}
  ]},localNombre:()=>"Torcuato"});
  assert.equal(api.homeDue(),"");
});
test("El Inicio actualiza las alertas al recibir cambios y al cruzar medianoche",()=>{
  assert.match(app,/S\.view === 'inicio' \|\| S\.view === 'vencimientos' \|\| S\.view === 'avisos'\) render\(\)/);
  assert.match(app,/\['creadora','dueno','gerente'\]\.includes\(miRol\(\)\)/);
  assert.match(app,/today !== alertDay/);
  assert.match(css,/\.gl-home-due-status\.soon/);
  assert.match(css,/\.gl-home-due-status\.expired/);
});
