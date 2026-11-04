import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261104213000_scanner_local_enrollment_draft.sql', import.meta.url), 'utf8');

test('Scanner: enrollment only for newly inserted locals in explicitly opted-in organizations', () => {
  assert.match(sql, /auto_enroll_new_locals boolean not null default false/i);
  assert.match(sql, /after insert on public\.rm_app_local/i);
  assert.match(sql, /p\.organization_id = new\.organization_id and p\.auto_enroll_new_locals/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.gestlok_scanner_local_enrollment\s+select/i);
});

test('Scanner: unique tenant per branch and no direct client access to enrollment', () => {
  assert.match(sql, /local_id text primary key/i);
  assert.match(sql, /scanner_tenant_id uuid not null unique default gen_random_uuid\(\)/i);
  assert.match(sql, /alter table public\.gestlok_scanner_local_enrollment enable row level security/i);
  assert.match(sql, /revoke all on public\.gestlok_scanner_local_enrollment from anon, authenticated/i);
});

test('Scanner: current branch enrollment is not yet wired into active Scanner access', () => {
  const ui = readFileSync(new URL('../public/stock/gestlok-pilot.js', import.meta.url), 'utf8');
  assert.match(ui, /from\('gestlok_pilot_access'\)/);
  assert.doesNotMatch(ui, /gestlok_scanner_local_enrollment/);
});
