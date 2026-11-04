import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261104221000_scanner_new_stock_tenant_enrollment.sql');
const ui=read('public/stock/gestlok-pilot.js');
const retired=read('supabase/migrations/20261104213000_scanner_local_enrollment_draft.sql');

test('only newly provisioned stock companies receive enrollment marker',()=>{
 assert.match(sql,/after insert on gestlok_platform\.companies/i);
 assert.match(sql,/new\.tenant_id/);
 assert.doesNotMatch(sql,/insert\s+into\s+gestlok_platform\.scanner_new_tenant_enrollment\s+select/i);
 assert.doesNotMatch(retired,/create trigger/i);
});
test('verified matching owner must claim tenant with authorized membership',()=>{
 assert.match(sql,/u\.email_confirmed_at is not null/i);
 assert.match(sql,/auth\.jwt\(\)->>'email'/i);
 assert.match(sql,/d\.tenant_id=p_tenant and d\.col='equipo'/i);
 assert.match(sql,/d\.data->>'rol'='dueno'/i);
 assert.match(sql,/a\.owner_uid<>v_uid/i);
 assert.match(sql,/on conflict\(tenant_id\) do nothing/i);
});
test('Scanner refresh claims before checking server-managed access',()=>{
 const claim=ui.indexOf("rpc('gestlok_scanner_claim_new_company'");
 const access=ui.indexOf("from('gestlok_pilot_access')");
 assert.ok(claim>0&&access>claim);
 assert.match(ui,/context\.logo_id==='mi-gusto'/);
});
