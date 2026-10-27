import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql = fs.readFileSync("supabase/migrations/20261024_billing_foundation_private.sql", "utf8");
const markup = JSON.parse(fs.readFileSync("lib/stock/markup.json", "utf8"));
const source = fs.readFileSync("public/stock/app.js", "utf8");

test("billing schema is private, with RLS on all tables", () => {
  assert.match(sql, /create schema if not exists gestlok_billing/i);
  assert.match(sql, /revoke all on schema gestlok_billing from public, anon, authenticated/i);
  assert.match(sql, /revoke all on all tables in schema gestlok_billing from public, anon, authenticated/i);
  for (const table of ["accounts", "license_grants", "subscriptions"]) {
    assert.match(sql, new RegExp("alter table gestlok_billing\\." + table + " enable row level security", "i"));
  }
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all)[^;]* to (?:anon|authenticated)/i);
});

test("complimentary licenses are individually keyed and can have no expiration", () => {
  assert.match(sql, /owner_user_id uuid not null unique references auth\.users/i);
  assert.match(sql, /license_kind text not null default 'complimentary_unlimited'/);
  assert.match(sql, /ends_at timestamptz,/);
});

test("no billing option or payment prompt is shipped to current users", () => {
  const billingMenu = /(?:data-go|data-act|href|aria-label)=["'][^"']*(?:billing|subscription|suscripcion|suscripción|facturacion|facturación|checkout|payment)/i;
  assert.doesNotMatch(markup, billingMenu);
  assert.doesNotMatch(source, billingMenu);
  assert.doesNotMatch(markup, /(?:Suscripciones|Actualizar plan|Método de pago|Contratar plan)/i);
});

test("public migration does not embed any identified customer's email", () => {
  assert.doesNotMatch(sql, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
});
