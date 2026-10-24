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
test("El service worker solo muestra push y no pide permiso sin un clic",()=>{
  assert.match(sw,/addEventListener\('push'/);
  assert.match(sw,/registration\.showNotification/);
  assert.doesNotMatch(sw,/Notification\.requestPermission/);
});
test("Nunca se precrean vencimientos ficticios en producción",()=>{
  assert.doesNotMatch(source,/C\('vencimientos'\)\.add\(\s*\{\s*nombre:\s*'Fumigación'/);
  assert.doesNotMatch(source,/localStorage\.setItem\('vencimientos'/);
});
