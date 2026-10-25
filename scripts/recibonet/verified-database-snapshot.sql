-- Operator-only logical backup, on the two confirmed application databases.
-- Never exports credentials. Never writes to original application tables.
-- A verified temporary-table row restore is NOT an independent disaster-recovery restore.
create schema if not exists gestlok_integration_backup;
revoke all on schema gestlok_integration_backup from public,anon,authenticated,service_role;
create table if not exists gestlok_integration_backup.snapshots (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 source text not null, reason text not null, routines jsonb not null, views jsonb not null,
 verified boolean not null default false
);
create table if not exists gestlok_integration_backup.entities (
 snapshot_id uuid not null references gestlok_integration_backup.snapshots(id),
 schema_name text not null,table_name text not null,row_count bigint not null,
 sha256 text not null,payload jsonb not null,structure jsonb not null,verified boolean not null,
 primary key(snapshot_id,schema_name,table_name)
);
alter table gestlok_integration_backup.snapshots enable row level security;
alter table gestlok_integration_backup.entities enable row level security;
revoke all on all tables in schema gestlok_integration_backup from public,anon,authenticated,service_role;

create or replace function gestlok_integration_backup.capture_verified(p_reason text)
returns jsonb language plpgsql set search_path=''
as $$
declare
 v_source text;v_id uuid;v_table record;v_payload jsonb;v_restored jsonb;v_structure jsonb;
 v_routines jsonb;v_views jsonb;v_count integer:=0;v_rows bigint:=0;v_temp text;
begin
 if to_regclass('public.rm_test_documents') is not null then v_source:='recibonet';
 elsif to_regclass('public.docs') is not null and to_regnamespace('gestlok_tenancy') is not null then v_source:='gestlok';
 else raise exception 'Unknown application database';end if;
 select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb)
 into v_routines from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and
 ((v_source='recibonet' and (n.nspname='rm_test_private' or(n.nspname='public' and left(p.proname,3)='rm_'))) or
 (v_source='gestlok' and ((left(n.nspname,8)='gestlok_' and n.nspname<>'gestlok_integration_backup') or
 (n.nspname='public' and (left(p.proname,8)='gestlok_' or p.proname in ('mi_rol','mi_acceso','es_creadora','puede_ver_local','puede_editar_local','doc_update','pedir_acceso'))))));
 select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'definition',pg_get_viewdef(c.oid))),'[]'::jsonb)
 into v_views from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='v' and
 ((v_source='recibonet' and (n.nspname='rm_test_private' or(n.nspname='public' and left(c.relname,3)='rm_'))) or
 (v_source='gestlok' and left(n.nspname,8)='gestlok_' and n.nspname<>'gestlok_integration_backup'));
 insert into gestlok_integration_backup.snapshots(source,reason,routines,views)
 values(v_source,left(p_reason,200),v_routines,v_views) returning id into v_id;
 for v_table in
  select c.oid,n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and
   ((v_source='recibonet' and (n.nspname='rm_test_private' or(n.nspname='public' and left(c.relname,3)='rm_'))) or
    (v_source='gestlok' and ((left(n.nspname,8)='gestlok_' and n.nspname<>'gestlok_integration_backup') or
     (n.nspname='public' and (c.relname='docs' or left(c.relname,8)='gestlok_')))))
  order by n.nspname,c.relname
 loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from %I.%I r',v_table.nspname,v_table.relname) into v_payload;
  select jsonb_build_object('rls',v_table.relrowsecurity,
   'columns',coalesce((select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=v_table.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb),
   'constraints',coalesce((select jsonb_agg(pg_get_constraintdef(k.oid)) from pg_constraint k where k.conrelid=v_table.oid),'[]'::jsonb),
   'indexes',coalesce((select jsonb_agg(pg_get_indexdef(i.indexrelid)) from pg_index i where i.indrelid=v_table.oid),'[]'::jsonb),
   'policies',coalesce((select jsonb_agg(to_jsonb(p)) from pg_policies p where p.schemaname=v_table.nspname and p.tablename=v_table.relname),'[]'::jsonb)) into v_structure;
  v_temp:='gl_snapshot_verify_'||v_count;
  execute format('create temp table %I on commit drop as select * from %I.%I with no data',v_temp,v_table.nspname,v_table.relname);
  execute format('insert into pg_temp.%I select * from jsonb_populate_recordset(null::pg_temp.%I,$1)',v_temp,v_temp) using v_payload;
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from pg_temp.%I r',v_temp) into v_restored;
  if v_payload is distinct from v_restored then raise exception 'Restore verification failed: %.%',v_table.nspname,v_table.relname;end if;
  insert into gestlok_integration_backup.entities(snapshot_id,schema_name,table_name,row_count,sha256,payload,structure,verified)
  values(v_id,v_table.nspname,v_table.relname,jsonb_array_length(v_payload),encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_payload,v_structure,true);
  execute format('drop table pg_temp.%I',v_temp);
  v_count:=v_count+1;v_rows:=v_rows+jsonb_array_length(v_payload);
 end loop;
 if v_count=0 then raise exception 'Empty snapshot scope';end if;
 update gestlok_integration_backup.snapshots set verified=true where id=v_id;
 return jsonb_build_object('snapshot_id',v_id,'source',v_source,'tables_verified',v_count,'rows_verified',v_rows,'verified',true,'scope','application_rows_and_schema_metadata','credentials_included',false,'independent_restore_verified',false);
end $$;
revoke all on function gestlok_integration_backup.capture_verified(text) from public,anon,authenticated,service_role;
-- Execute explicitly in REPEATABLE READ, as the database operator, then commit.
