import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261031000017_gestlok_employee_receipt_draft_contact_sync.sql',import.meta.url),'utf8');

test('Only the identity of the invited employee in their exact local can update a draft sheet',()=>{
  assert.match(sql,/i\.profile_id=new\.id/);
  assert.match(sql,/i\.organization_id=new\.organization_id/);
  assert.match(sql,/i\.local_id=new\.local_id and i\.redeemed_by=auth\.uid\(\)/);
  assert.match(sql,/m\.role='employee' and m\.local_id=i\.local_id/);
  assert.match(sql,/d\.organization_id=new\.organization_id/);
  assert.match(sql,/rm_test_private\.sheet_local\(d\.path,d\.data,d\.organization_id\)=new\.local_id/);
  assert.match(sql,/if new\.needs_completion or auth\.uid\(\) is null then return new/);
  assert.match(sql,/revoke all on function rm_test_private\.staff_initial_legajo_to_sheet\(\)/);
});

test('Corrections to phone, alias and optional hire date propagate without changing payroll',()=>{
  for(const field of ['first_name','last_name','phone','payment_alias','started_on'])
    assert.ok(sql.includes('old.'+field+' is not distinct from new.'+field),field);
  assert.match(sql,/'alias',new\.payment_alias/);
  assert.match(sql,/'tel',new\.phone/);
  assert.match(sql,/'fechaIngreso',to_char\(new\.started_on/);
  assert.match(sql,/\) - 'fechaIngreso'/);
  assert.match(sql,/not exists\(select 1 from public\.rm_app_images/);
  assert.match(sql,/not exists\(select 1 from public\.rm_test_documents h/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.rm_test_documents/i);
  assert.doesNotMatch(sql,/update\s+public\.rm_app_images/i);
  assert.doesNotMatch(sql,/set\s+data\s*=.*['"]items['"]/i);
  assert.doesNotMatch(sql,/set\s+data\s*=.*['"]tarifas['"]/i);
});

test('One-time backfill is limited to draft sheets in Munro/Torcuato, no cross-company contact leak',()=>{
  assert.match(sql,/lower\(btrim\(c\.name\)\)='alessandro'/);
  assert.match(sql,/l\.id in \('munro','dt'\)/);
  assert.match(sql,/p\.needs_completion=false/);
  assert.match(sql,/where d\.path='hojas\/'\|\|p\.sheet_id/);
  assert.match(sql,/d\.organization_id=p\.organization_id/);
  assert.match(sql,/and coalesce\(d\.data->'items','\{\}'::jsonb\)='\{\}'::jsonb/);
  assert.match(sql,/and coalesce\(d\.data->'tarifas','\{\}'::jsonb\)='\{\}'::jsonb/);
  assert.match(sql,/not exists\(select 1 from public\.rm_app_images/);
  assert.match(sql,/not exists\(select 1 from public\.rm_test_documents h/);
  assert.doesNotMatch(sql,/insert\s+into\s+public\.rm_test_documents/i);
});
