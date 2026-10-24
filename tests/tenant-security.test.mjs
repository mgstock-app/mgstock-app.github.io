import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = file => readFileSync(file, "utf8");
const fence = read("supabase/migrations/20261024_gestlok_tenant_fence.sql");
const helpers = read("supabase/migrations/20261024_gestlok_tenant_safe_lookups.sql");
const rpc = read("supabase/migrations/20261024_gestlok_tenant_safe_rpc.sql");
const controller = read("public/stock/app.js");

test("every existing doc gets a company and none can be reassigned", () => {
  assert.match(fence, /add column if not exists tenant_id uuid/i);
  assert.match(fence, /update public\.docs set tenant_id=/i);
  assert.match(fence, /alter column tenant_id set not null/i);
  assert.match(fence, /foreign key \(tenant_id\)/i);
  assert.match(fence, /if new\.tenant_id is distinct from old\.tenant_id/i);
});

test("a restrictive RLS company fence covers reads AND writes", () => {
  assert.match(fence, /create policy gestlok_tenant_fence on public\.docs as restrictive for all to authenticated/i);
  assert.match(fence, /using \(tenant_id=\(select gestlok_tenancy\.current_tenant_id\(\)\)\)/i);
  assert.match(fence, /with check \(tenant_id=\(select gestlok_tenancy\.current_tenant_id\(\)\)\)/i);
  assert.match(fence, /current_tenant_id\(\)/);
  assert.match(fence, /count\(distinct d\.tenant_id\)=1/i);
  assert.match(fence, /auth\.uid\(\)/i);
  assert.doesNotMatch(fence, /grant all on gestlok_tenancy\.tenants to authenticated/i);
});

test("elevated role and branch lookups are tenant-scoped", () => {
  for (const name of ["mi_rol", "mi_acceso", "puede_ver_local", "puede_editar_local", "comparte_local"]) {
    assert.match(helpers, new RegExp("function public\\." + name + "\\("));
  }
  assert.ok((helpers.match(/tenant_id/g)||[]).length >= 8);
  assert.match(helpers, /where l\.col='locales' and l\.tenant_id=d\.tenant_id/i);
});

test("import RPC is isolated and internal importer is not callable by clients", () => {
  assert.match(rpc, /rename to importar_mercaderia_internal/i);
  assert.match(rpc, /revoke all on function public\.importar_mercaderia_internal\([^)]+\) from public,anon,authenticated/i);
  assert.match(rpc, /where col='locales' and id=p_local and tenant_id=v_tenant/i);
  assert.match(rpc, /col='importaciones' and id=p_clave and tenant_id<>v_tenant/i);
  assert.match(rpc, /public\.importar_mercaderia_internal\(p_local,p_operacion,p_items,p_archivo,p_clave,p_forzar\)/i);
});

test("new companies are not provisioned by the current user interface", () => {
  assert.doesNotMatch(controller, /createTenant|createCompany|nuevoTenant|registrarEmpresa/i);
  assert.doesNotMatch(fence, /insert into gestlok_tenancy\.tenants\s*\([^)]*\)\s*values\s*\('fixture-/i);
});

test("no identifiable owner account is committed to tenancy SQL", () => {
  for (const sql of [fence, helpers, rpc]) {
    assert.doesNotMatch(sql, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  }
});
