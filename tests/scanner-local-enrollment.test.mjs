import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261104221000_scanner_new_stock_tenant_enrollment.sql');
const ui=read('public/stock/gestlok-pilot.js');
const retired=read('supabase/migrations/20261104213000_scanner_local_enrollment_draft.sql');

test('new company registration cannot automatically grant Scanner',()=>{
 assert.doesNotMatch(sql,/create trigger scanner_capture_new_company\s+after insert/i);
 assert.match(sql,/scanner_approve_new_company/);
 assert.match(sql,/gestlok_platform\.admins a where a\.user_id=auth\.uid\(\)/i);
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

test('Scanner approval is creator-only and excludes preexisting companies',()=>{
 assert.match(sql,/create or replace function public\.gestlok_scanner_approve_new_company/i);
 assert.match(sql,/c\.created_at\s*>\s*\(select g\.installed_at/i);
 assert.match(sql,/scanner_enrollment_release_gate/i);
 assert.match(sql,/grant execute on function public\.gestlok_scanner_approve_new_company\(uuid\) to authenticated/i);
 assert.doesNotMatch(sql,/create trigger scanner_capture_new_company/i);
});
test('SQL function dollar-quote delimiters are balanced',()=>{
 const tags=[...sql.matchAll(/\$(?:[a-z_]+)?\$/gi)].map(m=>m[0]);
 const counts=new Map();
 for(const tag of tags)counts.set(tag,(counts.get(tag)||0)+1);
 for(const [tag,count] of counts)assert.equal(count%2,0,'Unbalanced SQL quote '+tag);
});
