-- Durable offline replay. Data mutations run as the caller, through existing RLS/RPCs.
create schema if not exists gestlok_sync_private;
revoke all on schema gestlok_sync_private from public, anon;
grant usage on schema gestlok_sync_private to authenticated;
create table gestlok_sync_private.receipts (
 user_id uuid not null, id uuid not null, tenant_id uuid not null,
 payload_hash text not null, result jsonb, created_at timestamptz not null default now(),
 primary key(user_id,id)
);
alter table gestlok_sync_private.receipts enable row level security;
revoke all on gestlok_sync_private.receipts from public,anon,authenticated;
create function gestlok_sync_private.tenant() returns uuid language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
  and lower(u.email)=lower(coalesce(auth.jwt()->>'email',''))) then coalesce(
  gestlok_tenancy.current_tenant_id(),
  (select k.tenant_id from gestlok_platform.recibonet_links k join public.rm_organization_members m on m.organization_id=k.organization_id
   where m.user_id=rm_test_private.uid() and rm_test_private.app_role()<>'' limit 1)) end
$$;
create function public.gestlok_sync_context() returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('actor',auth.uid(),'tenant',gestlok_sync_private.tenant())
$$;
create function gestlok_sync_private.begin_op(p_id uuid,p_tenant uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r gestlok_sync_private.receipts;
begin
 if auth.uid() is null or p_tenant is distinct from gestlok_sync_private.tenant() then raise exception 'SYNC_IDENTITY' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_id::text,0));
 select * into r from gestlok_sync_private.receipts where user_id=auth.uid() and id=p_id;
 if found then
  if r.tenant_id<>p_tenant or r.payload_hash<>md5(p_payload::text) then raise exception 'SYNC_ID_REUSED';end if;
  return jsonb_build_object('found',true,'result',r.result);
 end if;
 return '{"found":false}'::jsonb;
end $$;
create function gestlok_sync_private.finish_op(p_id uuid,p_tenant uuid,p_payload jsonb,p_result jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_tenant is distinct from gestlok_sync_private.tenant() then raise exception 'SYNC_IDENTITY' using errcode='42501';end if;
 insert into gestlok_sync_private.receipts(user_id,id,tenant_id,payload_hash,result) values(auth.uid(),p_id,p_tenant,md5(p_payload::text),p_result);
end $$;
create function public.gestlok_sync_apply(p_id uuid,p_tenant uuid,p_payload jsonb,p_deferred boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare receipt jsonb; result jsonb; item jsonb; tbl text; method text; keys text[]; key text;
 cond text; columns_sql text; values_sql text; updates_sql text; old_row jsonb; new_row jsonb; body jsonb; row_match jsonb;
 fn text; proc record; arg record; args_sql text; arg_type text;
begin
 receipt:=gestlok_sync_private.begin_op(p_id,p_tenant,p_payload);
 if (receipt->>'found')::boolean then return receipt->'result';end if;
 if p_payload->>'kind'='table' then
  tbl:=p_payload->>'table';method:=p_payload->>'method';
  keys:=case tbl when 'docs' then array['col','id'] when 'rm_test_documents' then array['path']
   when 'rm_app_settings' then array['owner_id','organization_id','path'] when 'gestlok_tiendas' then array['id'] end;
  if keys is null or method not in ('POST','PATCH','DELETE') then raise exception 'SYNC_UNSUPPORTED';end if;
  result:='[]'::jsonb;
  for item in select value from jsonb_array_elements(p_payload->'rows') loop
   if exists(select 1 from unnest(keys) k where item->'key'->>k is null) then raise exception 'SYNC_KEY';end if;
   row_match:=(item->'key')||coalesce(item->'constraints','{}'::jsonb);
   select string_agg(format('t.%I is not distinct from (jsonb_populate_record(null::public.%I,$1)).%I',k,tbl,k),' and ') into cond from jsonb_object_keys(row_match) k;
   execute format('select to_jsonb(t) from public.%I t where %s for update',tbl,cond) into old_row using row_match;
   if p_deferred and method<>'POST' and not coalesce((item->>'check')::boolean,false) then raise exception 'SYNC_BASELINE: falta una copia descargada';end if;
   if coalesce((item->>'check')::boolean,false) then
    if old_row is null and coalesce((item->>'exists')::boolean,false) then raise exception 'SYNC_CONFLICT: registro eliminado';end if;
    if old_row is not null and not coalesce((item->>'exists')::boolean,false) then raise exception 'SYNC_CONFLICT: registro nuevo';end if;
    if old_row is not null and (case when tbl='gestlok_tiendas' then old_row else old_row->'data' end) is distinct from item->'expected' then raise exception 'SYNC_CONFLICT: datos modificados en otro equipo';end if;
   end if;
   if method='DELETE' then
    execute format('delete from public.%I t where %s returning to_jsonb(t)',tbl,cond) into new_row using row_match;
   else
    body:=(item->'body')||(item->'key');
    if coalesce((item->>'merge_data')::boolean,false) then body:=jsonb_set(body,'{data}',coalesce(old_row->'data','{}'::jsonb)||coalesce(body->'data','{}'::jsonb));end if;
    if exists(select 1 from jsonb_object_keys(body) k where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=tbl and c.column_name=k and c.is_generated='NEVER')) then raise exception 'SYNC_COLUMN';end if;
    select string_agg(format('%I',k),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',tbl,k),','),
      string_agg(format('%I=excluded.%I',k,k),',') filter(where not k=any(keys))
     into columns_sql,values_sql,updates_sql from jsonb_object_keys(body) k;
    if method='PATCH' then
     if old_row is null then raise exception 'SYNC_CONFLICT: registro no disponible';end if;
     select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$2)).%I',k,tbl,k),',') into updates_sql from jsonb_object_keys(body) k where not k=any(keys);
     execute format('update public.%I t set %s where %s returning to_jsonb(t)',tbl,updates_sql,cond) into new_row using row_match,body;
    else
     execute format('insert into public.%I as t(%s) select %s on conflict(%s) %s returning to_jsonb(t)',tbl,columns_sql,values_sql,
      (select string_agg(format('%I',k),',') from unnest(keys) k),case when updates_sql is null then 'do nothing' else 'do update set '||updates_sql end) into new_row using body;
    end if;
   end if;
   result:=result||jsonb_build_array(coalesce(new_row,old_row));
  end loop;
 elsif p_payload->>'kind'='rpc' then
  fn:=p_payload->>'name';
  if fn not in ('importar_mercaderia','gestlok_proveedor_guardar_historial','rm_app_save_schedule','rm_app_set_branch_schedule_link','rm_app_schedule_comment') then raise exception 'SYNC_UNSUPPORTED';end if;
  if fn='rm_app_set_branch_schedule_link' and p_deferred then
   if not p_payload ? 'expected_link' then raise exception 'SYNC_BASELINE: falta enlace descargado';end if;
   if (public.rm_app_branch_schedule_links(p_payload->'args'->>'p_local',null)->0->'url') is distinct from p_payload->'expected_link' then raise exception 'SYNC_CONFLICT: enlace cambiado';end if;
  end if;
  select p.* into proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=fn and p.prokind='f';
  if not found then raise exception 'SYNC_FUNCTION';end if;
  if exists(select 1 from jsonb_object_keys(p_payload->'args') k where not k=any(proc.proargnames)) then raise exception 'SYNC_ARGUMENT';end if;
  args_sql:='';
  for arg in select t.oid,proc.proargnames[t.n] name from unnest(proc.proargtypes) with ordinality t(oid,n) loop
   if (p_payload->'args') ? arg.name then
    arg_type:=format_type(arg.oid,null);
    args_sql:=args_sql||case when args_sql='' then '' else ',' end||format('%I => ',arg.name)||
     case when arg_type in ('jsonb','json') then format('($1->%L)::%s',arg.name,arg_type)
      when arg_type like '%[]' then format('array(select jsonb_array_elements_text($1->%L))::%s',arg.name,arg_type)
      else format('($1->>%L)::%s',arg.name,arg_type) end;
   end if;
  end loop;
  execute format('select to_jsonb(public.%I(%s))',fn,args_sql) into result using p_payload->'args';
 else raise exception 'SYNC_UNSUPPORTED';end if;
 perform gestlok_sync_private.finish_op(p_id,p_tenant,p_payload,result);
 return result;
end $$;
revoke all on all functions in schema gestlok_sync_private from public,anon;
grant execute on all functions in schema gestlok_sync_private to authenticated;
revoke all on function public.gestlok_sync_context(),public.gestlok_sync_apply(uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.gestlok_sync_context(),public.gestlok_sync_apply(uuid,uuid,jsonb,boolean) to authenticated;
