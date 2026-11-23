-- Mi Gusto (Munro y Don Torcuato) · cierre automático de turnos a las 00:50 (hora de Argentina).
-- Es el respaldo de los cierres manuales, que siguen disponibles («Cerrar turno» en Conteo y en Stock Local).
-- A partir de las 00:50 se cierra lo del día anterior que quedó abierto:
--  · Conteo: los turnos en borrador (Mañana entrada, Mañana salida, Noche salida) de ese día o anteriores pasan a
--    finalizados con cierre_automatico = true, aunque falte el responsable o haya diferencias sin marcar.
--  · Stock Local: si ese día no tiene cierre, se archiva en el historial cómo quedó la planilla, con el mismo formato
--    que el cierre manual (id cierre-<hoja>-<día>) y cierreAutomatico = true. Solo entre las 00:50 y las 06:00,
--    para no archivar como «ayer» lo que se cargue al día siguiente.
-- Idempotente: corre a las 00:50 y, como respaldo, cada 15 minutos.

alter table gestlok_munro_conteo_private.shifts add column if not exists cierre_automatico boolean not null default false;
alter table gestlok_torcuato_conteo_private.shifts add column if not exists cierre_automatico boolean not null default false;

create or replace function gestlok_platform.mi_gusto_cierre_automatico(p_ahora timestamp default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_tenant constant uuid := 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
  v_ahora timestamp := coalesce(p_ahora, now() at time zone 'America/Argentina/Buenos_Aires');
  v_dia date;
  v_munro integer := 0;
  v_torcuato integer := 0;
  v_stock jsonb := '[]'::jsonb;
  v_local text;
  v_hoja_id text;
  v_hoja_nombre text;
  v_id text;
  v_filas jsonb;
  v_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- Día operativo que se cierra: el anterior a partir de las 00:50; antes de esa hora, el de dos días atrás.
  v_dia := v_ahora::date - case when v_ahora::time >= time '00:50' then 1 else 2 end;

  update gestlok_munro_conteo_private.shifts
     set status = 'finalizado', finished_at = now(), updated_at = now(), cierre_automatico = true
   where status <> 'finalizado' and day <= v_dia;
  get diagnostics v_munro = row_count;

  update gestlok_torcuato_conteo_private.shifts
     set status = 'finalizado', finished_at = now(), updated_at = now(), cierre_automatico = true
   where status <> 'finalizado' and day <= v_dia;
  get diagnostics v_torcuato = row_count;

  if v_ahora::time >= time '00:50' and v_ahora::time < time '06:00' then
    foreach v_local in array array['munro', 'torcuato'] loop
      select d.id, coalesce(nullif(btrim(d.data->>'nombre'), ''), 'Stock Local') into v_hoja_id, v_hoja_nombre
        from public.docs d
       where d.col = v_local || '/hojas' and d.tenant_id = c_tenant and d.id <> 'stock'
         and d.data->>'tipo' = 'ingreso' and lower(btrim(coalesce(d.data->>'nombre', ''))) = 'stock local'
         and coalesce(d.data->>'oculta', 'false') <> 'true'
       order by d.id limit 1;
      continue when v_hoja_id is null;
      v_id := 'cierre-' || v_hoja_id || '-' || to_char(v_dia, 'YYYY-MM-DD');
      continue when exists (select 1 from public.docs x where x.col = v_local || '/conteos' and x.id = v_id);

      -- Misma foto que arma la planilla al cerrar: Local, Ingreso, Total y sin stock (Local en 0, o marcado sin Local).
      select coalesce(jsonb_agg(jsonb_build_object(
               'pid', i.id, 'nombre', i.nombre, 'bloque', i.bloque, 'local', i.l, 'fabrica', i.f,
               'total', round(coalesce(i.l, 0) + coalesce(i.f, 0), 2),
               'sin', case when i.l is not null then i.l = 0 else i.marcado end,
               'cambio', false)
             order by i.bloque, i.orden nulls last, i.nombre), '[]'::jsonb)
        into v_filas
        from (
          select d.id, coalesce(d.data->>'nombre', '') as nombre,
                 case when coalesce(d.data->>'local', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (d.data->>'local')::numeric end as l,
                 case when coalesce(d.data->>'fabrica', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (d.data->>'fabrica')::numeric end as f,
                 greatest(1, round(case when coalesce(d.data->>'bloque', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                   then (d.data->>'bloque')::numeric else 1 end))::integer as bloque,
                 case when coalesce(d.data->>'orden', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (d.data->>'orden')::numeric end as orden,
                 coalesce(d.data->>'sinStock', 'false') = 'true' as marcado
            from public.docs d
           where d.col = v_local || '/fabrica' and d.tenant_id = c_tenant
             and coalesce(d.data->>'hoja', 'fabrica') = v_hoja_id
        ) i;
      continue when jsonb_array_length(v_filas) = 0;

      insert into public.docs(col, id, data, updated_at, updated_by, tenant_id)
      values (v_local || '/conteos', v_id, jsonb_build_object(
        'tipo', 'fabrica', 'fecha', v_ms, 'autor', null, 'responsable', 'Cierre automático 00:50', 'nota', '',
        'hoja', v_hoja_id, 'nombreHoja', v_hoja_nombre, 'filas', v_filas, 'cambiadas', 0,
        'total', jsonb_array_length(v_filas),
        'sinStock', (select coalesce(jsonb_agg(x->>'nombre'), '[]'::jsonb) from jsonb_array_elements(v_filas) x where (x->>'sin')::boolean),
        'turnoCerrado', true, 'fechaOperativa', to_char(v_dia, 'YYYY-MM-DD'), 'cerradoEn', v_ms, 'cierreAutomatico', true),
        now(), 'cierre-automatico', c_tenant)
      on conflict do nothing;
      if found then v_stock := v_stock || to_jsonb(v_local); end if;
    end loop;
  end if;

  return jsonb_build_object('dia', v_dia, 'conteo_munro', v_munro, 'conteo_torcuato', v_torcuato, 'stock_local', v_stock);
end $$;

revoke all on function gestlok_platform.mi_gusto_cierre_automatico(timestamp) from public;
revoke all on function gestlok_platform.mi_gusto_cierre_automatico(timestamp) from anon, authenticated;

-- 00:50 en Argentina = 03:50 GMT (sin horario de verano). El respaldo cubre una corrida fallida.
select cron.schedule('mi-gusto-cierre-0050-ar', '50 3 * * *', $$select gestlok_platform.mi_gusto_cierre_automatico()$$);
select cron.schedule('mi-gusto-cierre-respaldo', '*/15 * * * *', $$select gestlok_platform.mi_gusto_cierre_automatico()$$);
