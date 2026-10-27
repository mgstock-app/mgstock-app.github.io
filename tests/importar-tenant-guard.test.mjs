import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261026210000_gestlok_importar_mercaderia_tenant_guard.sql", "utf8");
const rollback = readFileSync("supabase/migrations/rollback-20261026210000_gestlok_importar_mercaderia_tenant_guard.sql.txt", "utf8");
const sqlTest = readFileSync("supabase/tests/importar-mercaderia-tenant-guard.sql", "utf8");
const code = migration.replace(/^\s*--.*$/gm, "");

test("Ingreso de mercadería: la función pública exige un local de la propia empresa", () => {
  assert.match(code, /rename to importar_mercaderia_internal/);
  assert.match(code, /revoke all on function public\.importar_mercaderia_internal[^;]+from public, anon, authenticated/);
  assert.match(code, /security definer set search_path = ''/);
  assert.match(code, /gestlok_tenancy\.current_tenant_id\(\)/);
  assert.match(code, /not public\.puede_editar_local\(p_local\)/);
  assert.match(code, /col = 'importaciones' and id = p_clave\s+and tenant_id is distinct from v_tenant/);
  assert.match(code, /not in \('creadora', 'dueno'\)/);
  assert.match(code, /grant execute on function public\.importar_mercaderia\([^)]*\)\s+to authenticated, service_role/);
});

test("Ingreso de mercadería: la migración no borra ni modifica documentos", () => {
  assert.doesNotMatch(code, /\b(delete\s+from|truncate|drop\s+table|update\s+public\.docs|insert\s+into)\b/i);
  assert.doesNotMatch(code, /grant execute[^;]*\banon\b/i);
});

test("Ingreso de mercadería: hay rollback manual y prueba SQL sin datos personales", () => {
  assert.match(rollback, /rename to importar_mercaderia;/);
  assert.match(sqlTest, /Dueño de otra empresa en Munro[^\n]+MGS:sucursal/);
  assert.match(sqlTest, /Dueño de otra empresa en Torcuato[^\n]+MGS:sucursal/);
  assert.match(sqlTest, /huella de Munro y Torcuato/);
  assert.doesNotMatch(sqlTest, /@(gmail|hotmail|yahoo|outlook)\./i);
  assert.doesNotMatch(sqlTest, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
