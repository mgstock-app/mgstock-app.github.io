-- El cierre y la preparación de la próxima planilla ocurren en la misma transacción.
-- Sólo un INSERT nuevo del cierre canónico puede vaciar cantidades. No hay limpieza retroactiva.
create or replace function gestlok_platform.stock_local_vaciar_al_cerrar()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_col text;
  v_hoja text;
  v_dia date;
  v_filas jsonb;
  v_n integer;
  v_actualizadas integer;
begin
  if new.tenant_id is distinct from 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
    or new.col not in ('munro/conteos','torcuato/conteos')
    or new.data->>'tipo' is distinct from 'fabrica'
    or new.data->>'turnoCerrado' is distinct from 'true' then return new; end if;
  v_hoja := new.data->>'hoja';
  if not exists (
    select 1 from public.docs d
    where d.tenant_id = new.tenant_id and d.col = replace(new.col,'/conteos','/hojas')
      and d.id = v_hoja and d.data->>'tipo' = 'ingreso'
      and lower(btrim(d.data->>'nombre')) = 'stock local'
      and coalesce(d.data->>'oculta','false') <> 'true'
  ) then return new; end if;
  v_dia := (timezone('America/Argentina/Buenos_Aires',statement_timestamp()) - interval '50 minutes')::date;
  if new.data->>'cierreAutomatico' = 'true' then
    v_dia := v_dia - 1;
  end if;
  if new.id is distinct from ('cierre-' || v_hoja || '-' || v_dia::text)
    or new.data->>'fechaOperativa' is distinct from v_dia::text then
    raise exception 'Fecha de cierre de Stock Local no vigente; actualizá la planilla';
  end if;
  v_col := replace(new.col,'/conteos','/fabrica');
  v_filas := new.data->'filas';
  if jsonb_typeof(v_filas) is distinct from 'array' then
    raise exception 'Falta la copia histórica del Stock Local';
  end if;
  -- Bloqueo de las filas hasta confirmar archivo y reinicio. Si otra sesión cambió
  -- cantidades desde la foto, se cancela TODO el cierre sin vaciar ninguna fila.
  perform 1 from public.docs d
   where d.tenant_id = new.tenant_id and d.col = v_col and d.data->>'hoja' = v_hoja
   order by d.id for update;
  select count(*) into v_n from public.docs d
   where d.tenant_id = new.tenant_id and d.col = v_col and d.data->>'hoja' = v_hoja;
  if v_n = 0 or v_n <> jsonb_array_length(v_filas)
    or v_n <> (select count(distinct f->>'pid') from jsonb_array_elements(v_filas) f)
    or exists (
      select 1 from public.docs d
       where d.tenant_id = new.tenant_id and d.col = v_col and d.data->>'hoja' = v_hoja
        and not exists (
          select 1 from jsonb_array_elements(v_filas) f
           where f->>'pid' = d.id
            and coalesce(f->'local','null'::jsonb) = coalesce(d.data->'local','null'::jsonb)
            and coalesce(f->'fabrica','null'::jsonb) = coalesce(d.data->'fabrica','null'::jsonb)
            and f->'sin' = to_jsonb(case when d.data->>'local' is not null
              then d.data->'local' = '0'::jsonb else coalesce(d.data->>'sinStock','false') = 'true' end)
        )
    ) then raise exception 'Stock Local cambió o falta información. Actualizá y volvé a cerrar'; end if;
  update public.docs d
   set data = d.data || jsonb_build_object('local',null,'fabrica',null,'sinStock',false,
          'actualizado',(extract(epoch from clock_timestamp())*1000)::bigint),
       updated_at = clock_timestamp(), updated_by = new.updated_by
   where d.tenant_id = new.tenant_id and d.col = v_col and d.data->>'hoja' = v_hoja;
  get diagnostics v_actualizadas = row_count;
  if v_actualizadas <> v_n then
    raise exception 'No se pudo preparar toda la planilla; cierre cancelado';
  end if;
  return new;
end $$;
revoke all on function gestlok_platform.stock_local_vaciar_al_cerrar() from public, anon, authenticated;
drop trigger if exists gestlok_stock_local_vaciar_al_cerrar on public.docs;
create trigger gestlok_stock_local_vaciar_al_cerrar after insert on public.docs
for each row when (new.col in ('munro/conteos','torcuato/conteos'))
execute function gestlok_platform.stock_local_vaciar_al_cerrar();

-- Un reintento de upsert no puede reemplazar la foto archivada ni volver a vaciar
-- una planilla que ya se empezó a cargar. El editor histórico conserva cerradoEn.
create or replace function gestlok_platform.stock_local_proteger_cierre()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
     and old.col in ('munro/conteos','torcuato/conteos')
     and old.data->>'tipo' = 'fabrica' and old.data->>'turnoCerrado' = 'true'
     and old.id = 'cierre-' || (old.data->>'hoja') || '-' || (old.data->>'fechaOperativa')
     and (new.data->>'cerradoEn' is distinct from old.data->>'cerradoEn'
       or new.data->>'fechaOperativa' is distinct from old.data->>'fechaOperativa'
       or new.data->>'turnoCerrado' is distinct from old.data->>'turnoCerrado'
       or new.data->>'hoja' is distinct from old.data->>'hoja') then
    raise exception 'El turno ya está cerrado; usá Modificar turno en Historial';
  end if;
  return new;
end $$;
revoke all on function gestlok_platform.stock_local_proteger_cierre() from public, anon, authenticated;
drop trigger if exists gestlok_stock_local_proteger_cierre on public.docs;
create trigger gestlok_stock_local_proteger_cierre before update on public.docs
for each row when (old.col in ('munro/conteos','torcuato/conteos'))
execute function gestlok_platform.stock_local_proteger_cierre();
