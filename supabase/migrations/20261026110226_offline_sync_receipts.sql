-- GESTLOK · envío automático de cambios guardados sin conexión (ambas áreas).
-- Cada cambio pendiente se aplica UNA sola vez (recibo por cuenta + id de operación) y
-- se ejecuta COMO la persona que lo hizo: las políticas RLS, los triggers y las reglas
-- de cada función siguen decidiendo qué se puede guardar. No modifica tablas de negocio.

create schema if not exists gestlok_sync_private;
revoke all on schema gestlok_sync_private from public, anon;
grant usage on schema gestlok_sync_private to authenticated;

create table if not exists gestlok_sync_private.receipts (
  user_id uuid not null,
  id uuid not null,
  tenant_id uuid,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table gestlok_sync_private.receipts enable row level security;
revoke all on gestlok_sync_private.receipts from public, anon, authenticated;

-- Empresa activa de la cuenta (null si no tiene una única empresa). Solo identifica el contexto.
create or replace function gestlok_sync_private.tenant() returns uuid
language sql stable security definer set search_path = '' as $$
  select gestlok_tenancy.current_tenant_id()
$$;

create or replace function public.gestlok_sync_context() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('actor', auth.uid(), 'tenant', gestlok_sync_private.tenant())
$$;

-- Recibos: solo de la propia cuenta. Se toma un candado por operación para que dos
-- pestañas o un reintento no la apliquen dos veces.
create or replace function gestlok_sync_private.begin_op(p_id uuid, p_tenant uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r gestlok_sync_private.receipts;
begin
  if auth.uid() is null or p_id is null then raise exception 'SYNC_IDENTITY' using errcode = '42501'; end if;
  if p_tenant is distinct from gestlok_sync_private.tenant() then raise exception 'SYNC_IDENTITY: otra empresa' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_id::text, 0));
  select * into r from gestlok_sync_private.receipts where user_id = auth.uid() and id = p_id;
  if found then
    if r.payload_hash <> md5(p_payload::text) or r.tenant_id is distinct from p_tenant then
      raise exception 'SYNC_ID_REUSED' using errcode = '22023';
    end if;
    return jsonb_build_object('found', true, 'result', r.result);
  end if;
  return '{"found":false}'::jsonb;
end $$;

create or replace function gestlok_sync_private.finish_op(p_id uuid, p_tenant uuid, p_payload jsonb, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SYNC_IDENTITY' using errcode = '42501'; end if;
  insert into gestlok_sync_private.receipts(user_id, id, tenant_id, payload_hash, result)
  values (auth.uid(), p_id, p_tenant, md5(p_payload::text), p_result);
  -- Los recibos viejos de la misma cuenta ya no se necesitan.
  delete from gestlok_sync_private.receipts where user_id = auth.uid() and created_at < now() - interval '45 days';
end $$;

-- Aplica un cambio pendiente. SECURITY INVOKER: corre con los permisos de quien llama.
create or replace function public.gestlok_sync_apply(p_id uuid, p_tenant uuid, p_payload jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  receipt jsonb; result jsonb := '[]'::jsonb; item jsonb; tbl text; method text; mode text; keys text[];
  rel regclass; cond text; row_match jsonb; old_row jsonb; new_row jsonb; body jsonb; merge jsonb;
  cols text; vals text; upd text; fn text; proc record; arg record; args_sql text := ''; arg_type text; n int;
begin
  receipt := gestlok_sync_private.begin_op(p_id, p_tenant, p_payload);
  if (receipt->>'found')::boolean then return receipt->'result'; end if;

  if p_payload->>'kind' = 'table' then
    tbl := p_payload->>'table'; method := p_payload->>'method'; mode := coalesce(p_payload->>'mode', 'upsert');
    keys := case tbl when 'docs' then array['col','id'] when 'rm_test_documents' then array['path']
                     when 'rm_app_settings' then array['owner_id','organization_id','path'] end;
    if keys is null or method not in ('POST','PATCH','DELETE') or mode not in ('insert','upsert','ignore')
       or jsonb_typeof(p_payload->'rows') <> 'array' then
      raise exception 'SYNC_UNSUPPORTED' using errcode = '22023';
    end if;
    rel := format('public.%I', tbl)::regclass;
    for item in select value from jsonb_array_elements(p_payload->'rows') loop
      if jsonb_typeof(item->'key') <> 'object'
         or exists (select 1 from unnest(keys) k where nullif(item->'key'->>k, '') is null)
         or exists (select 1 from jsonb_object_keys(item->'key') k where not k = any(keys)) then
        raise exception 'SYNC_KEY' using errcode = '22023';
      end if;
      row_match := (item->'key') || coalesce(item->'constraints', '{}'::jsonb);
      body := coalesce(item->'body', '{}'::jsonb);
      if jsonb_typeof(row_match) <> 'object' or jsonb_typeof(body) <> 'object' then raise exception 'SYNC_KEY' using errcode = '22023'; end if;
      -- Solo columnas reales y no generadas de la tabla.
      if exists (select 1 from (select jsonb_object_keys(row_match) k union select jsonb_object_keys(body)) x
                 where not exists (select 1 from pg_attribute a where a.attrelid = rel and a.attname = x.k
                                   and a.attnum > 0 and not a.attisdropped and a.attgenerated = '')) then
        raise exception 'SYNC_COLUMN' using errcode = '22023';
      end if;
      select string_agg(format('t.%I is not distinct from (jsonb_populate_record(null::public.%I, $1)).%I', k, tbl, k), ' and ')
        into cond from jsonb_object_keys(row_match) k;
      execute format('select to_jsonb(t) from public.%I t where %s for update', tbl, cond) into old_row using row_match;
      new_row := null;

      if method = 'DELETE' then
        execute format('delete from public.%I t where %s returning to_jsonb(t)', tbl, cond) into new_row using row_match;
      elsif method = 'PATCH' then
        if old_row is null then raise exception 'SYNC_MISSING: el registro ya no existe' using errcode = 'P0002'; end if;
        merge := item->'data_merge';
        if merge is not null then
          -- Solo los campos de «data» que cambió esta persona; el resto queda como está en la nube.
          body := body || jsonb_build_object('data',
            ((coalesce(old_row->'data', '{}'::jsonb)
              - coalesce(array(select jsonb_array_elements_text(coalesce(merge->'unset', '[]'::jsonb))), '{}'::text[]))
             || coalesce(merge->'set', '{}'::jsonb)));
        end if;
        body := body - keys;
        if body = '{}'::jsonb then new_row := old_row;
        else
          select string_agg(format('%I = (jsonb_populate_record(null::public.%I, $2)).%I', k, tbl, k), ', ')
            into upd from jsonb_object_keys(body) k;
          execute format('update public.%I t set %s where %s returning to_jsonb(t)', tbl, upd, cond) into new_row using row_match, body;
        end if;
      else -- POST
        body := body || (item->'key');
        if mode = 'insert' and old_row is not null then raise exception 'SYNC_EXISTS: el registro ya existe' using errcode = '23505'; end if;
        select string_agg(format('%I', k), ', '), string_agg(format('(jsonb_populate_record(null::public.%I, $1)).%I', tbl, k), ', '),
               string_agg(format('%I = excluded.%I', k, k), ', ') filter (where not k = any(keys))
          into cols, vals, upd from jsonb_object_keys(body) k;
        execute format('insert into public.%I as t (%s) select %s on conflict (%s) %s returning to_jsonb(t)', tbl, cols, vals,
          array_to_string(array(select format('%I', k) from unnest(keys) k), ', '),
          case when mode = 'ignore' or upd is null then 'do nothing' else 'do update set ' || upd end)
          into new_row using body;
      end if;
      result := result || jsonb_build_array(coalesce(new_row, old_row));
    end loop;

  elsif p_payload->>'kind' = 'rpc' then
    fn := p_payload->>'name';
    if fn not in ('doc_update','importar_mercaderia','gestlok_proveedor_guardar_historial','rm_app_save_schedule',
                  'rm_app_set_branch_schedule_link','rm_app_schedule_comment','rm_app_record_whatsapp')
       or jsonb_typeof(coalesce(p_payload->'args', '{}'::jsonb)) <> 'object' then
      raise exception 'SYNC_UNSUPPORTED' using errcode = '22023';
    end if;
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = fn and p.prokind = 'f';
    if n <> 1 then raise exception 'SYNC_FUNCTION' using errcode = '22023'; end if;
    select p.* into proc from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = fn and p.prokind = 'f';
    if exists (select 1 from jsonb_object_keys(coalesce(p_payload->'args', '{}'::jsonb)) k where not k = any(proc.proargnames)) then
      raise exception 'SYNC_ARGUMENT' using errcode = '22023';
    end if;
    for arg in select t.oid, proc.proargnames[t.n] as name from unnest(proc.proargtypes) with ordinality t(oid, n) loop
      if (p_payload->'args') ? arg.name then
        arg_type := format_type(arg.oid, null);
        args_sql := args_sql || case when args_sql = '' then '' else ', ' end || format('%I => ', arg.name) ||
          case when arg_type in ('jsonb','json') then format('($1->%L)::%s', arg.name, arg_type)
               when arg_type like '%[]' then format('array(select jsonb_array_elements_text($1->%L))::%s', arg.name, arg_type)
               else format('($1->>%L)::%s', arg.name, arg_type) end;
      end if;
    end loop;
    if proc.prorettype = 'void'::regtype then
      execute format('select public.%I(%s)', fn, args_sql) using p_payload->'args';
      result := 'null'::jsonb;
    else
      execute format('select to_jsonb(public.%I(%s))', fn, args_sql) into result using p_payload->'args';
    end if;
    if fn = 'doc_update' and coalesce((result#>>'{}')::int, 0) = 0 then
      raise exception 'SYNC_MISSING: el registro ya no existe o no se puede modificar' using errcode = 'P0002';
    end if;
  else
    raise exception 'SYNC_UNSUPPORTED' using errcode = '22023';
  end if;

  perform gestlok_sync_private.finish_op(p_id, p_tenant, p_payload, result);
  return result;
end $$;

revoke all on all functions in schema gestlok_sync_private from public, anon;
grant execute on function gestlok_sync_private.tenant(), gestlok_sync_private.begin_op(uuid, uuid, jsonb),
  gestlok_sync_private.finish_op(uuid, uuid, jsonb, jsonb) to authenticated;
revoke all on function public.gestlok_sync_context(), public.gestlok_sync_apply(uuid, uuid, jsonb) from public, anon;
grant execute on function public.gestlok_sync_context(), public.gestlok_sync_apply(uuid, uuid, jsonb) to authenticated;
