import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const auth = read("public/stock/auth.js");

test("múltiples vistas comparten la descarga de una colección, con páginas de 1000 ordenadas", async () => {
  const begin = auth.indexOf("  const pendingCollections = new Map();");
  const end = auth.indexOf("  const db = Object.freeze({",begin);
  assert.ok(begin > 0 && end > begin, "Tramo de lectura de GESTLOK detectado");
  const section = auth.slice(begin,end);
  const all = Array.from({length:10050},(_,n)=>({id:String(n).padStart(5,"0"),data:{stock:n}}));
  let calls = 0;
  const sb = {from(name){
    assert.equal(name,"docs");
    return {select(columns){
      assert.equal(columns,"id,data");
      return {eq(field,collection){
        assert.equal(field,"col");
        assert.equal(collection,"munro/productos");
        return {order(column,{ascending}){
          assert.equal(column,"id");assert.equal(ascending,true);
          return {async range(start,end){
            calls++;
            await Promise.resolve();
            return {data:all.slice(start,end+1),error:null};
          }};
        }};
      }};
    }};
  }};
  const sandbox = {sb,toErr:e=>e,Map,Promise};
  vm.runInNewContext(section + "\nthis.api = {fetchCol,collectionRevisions};",sandbox);
  const [first,second]=await Promise.all([
    sandbox.api.fetchCol("munro/productos"),
    sandbox.api.fetchCol("munro/productos")
  ]);
  assert.equal(calls,11,"Una consulta por página, no una por cada componente");
  assert.equal(first.length,10050);
  assert.equal(second.length,10050);
  assert.equal(first[0].id,"00000");
  assert.equal(first.at(-1).id,"10049");
  sandbox.api.collectionRevisions.set("munro/productos",1);
  await sandbox.api.fetchCol("munro/productos");
  assert.equal(calls,22,"Un cambio solicita una nueva lectura; no queda cacheado");
});

test("el respaldo no consulta planillas completas con pestaña oculta",()=>{
  assert.match(auth,/document\.visibilityState === 'visible' && navigator\.onLine !== false/);
  assert.match(auth,/90000/);
  assert.match(auth,/collectionRevisions\.set\(col/);
});

test("la migración se limita a índices multiempresa, sin alterar políticas ni contenido",()=>{
  const sql=read("supabase/migrations/20261029045000_escalabilidad_multitenant_indices.sql");
  assert.match(sql,/CREATE INDEX IF NOT EXISTS gl_scale_locals_org_id_idx/);
  assert.match(sql,/CREATE INDEX IF NOT EXISTS gl_scale_profiles_local_id_idx/);
  assert.match(sql,/CREATE INDEX IF NOT EXISTS gl_scale_push_events_tenant_local_created_idx/);
  assert.doesNotMatch(sql,/\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER POLICY|DISABLE ROW LEVEL SECURITY)\b/i);
});
