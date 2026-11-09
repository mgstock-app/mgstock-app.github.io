-- Munro: el gerente del local puede archivar manualmente ambas hojas.
-- Permiso ESPECIFICO: no habilitar conexion Google Sheets, marcar pagos ni otros locales.
create or replace function rm_test_private.horarios_puede_archivar(p_local text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    p_local = 'munro'
    and auth.uid() is not null
    and (
      rm_test_private.horarios_puede_administrar(p_local)
      or (
        rm_test_private.app_role() = 'manager'
        and exists (
          select 1 from public.rm_test_members m
          join public.rm_manager_permissions p on p.user_id=m.user_id
          join public.rm_app_local l on l.id=p_local
          where m.user_id=rm_test_private.uid()
            and m.role='manager' and m.local_id=p_local
            and p.company_id=l.company_id and p.organization_id=l.organization_id
            and p.can_edit
        )
      )
      or (
        p_local = any(rm_test_private.gestlok_gerente_locals())
        and exists (
          select 1 from public.docs d
          where d.tenant_id=gestlok_tenancy.current_tenant_id()
            and d.col='equipo'
            and d.data->>'rol'='gerente'
            and lower(d.data->>'email')=lower(coalesce(auth.jwt()->>'email',''))
        )
      )
    ), false
  )
$$;
revoke all on function rm_test_private.horarios_puede_archivar(text) from public,anon,authenticated;

-- La acción guarda solo Munro y mantiene verificaciones de semana, snapshot y duplicados.
create or replace function public.rm_horarios_archivar_manual(
  p_local text, p_desde text, p_actualizado_at timestamptz
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_live rm_test_private.horarios_en_vivo%rowtype;
  v_week rm_test_private.horarios_semanas%rowtype;
  v_id uuid;
  v_date date;
begin
  if p_local is distinct from 'munro'
     or auth.uid() is null
     or not rm_test_private.horarios_puede_archivar(p_local) then
    raise exception 'Solo la administracion o el gerente autorizado de Munro puede enviar horarios a historial'
      using errcode='42501';
  end if;

  v_date := rm_test_private.horarios_fecha(p_desde);
  if v_date is null or p_actualizado_at is null then
    raise exception 'Semana o version no valida' using errcode='22023';
  end if;

  -- El envio del Apps Script toma el mismo bloqueo por conexion.
  -- De esta manera no puede cruzarse una sincronizacion con un archivo.
  perform 1 from rm_test_private.horarios_conexiones
    where local_id='munro' for update;
  if not found then
    raise exception 'La planilla de Munro no esta conectada' using errcode='22023';
  end if;

  -- El PDF anterior de esa semana se conserva: la version corregida
  -- puede guardarse una unica vez de forma manual, sin sobrescribir el PDF.
  select id into v_id from rm_test_private.horarios_archivos
    where local_id='munro' and semana_desde=v_date
      and resumen is null and semana is null
    order by archivado_at desc limit 1;
  if v_id is not null then
    return jsonb_build_object('ok',true,'archivada',true,'archivo_id',v_id,'semana',v_date);
  end if;

  select * into v_live from rm_test_private.horarios_en_vivo
    where local_id='munro' for update;
  if not found or v_live.semana_desde is distinct from v_date then
    raise exception 'La semana en vivo cambio. Actualizala antes de guardar'
      using errcode='22023';
  end if;
  if v_live.actualizado_at is distinct from p_actualizado_at then
    raise exception 'Google Sheets envio cambios nuevos. Revisa la semana actualizada antes de guardar'
      using errcode='22023';
  end if;
  -- Una semana cerrada admite 24 h de revision manual; una semana
  -- en curso mantiene la verificacion estricta de 30 minutos.
  if (v_live.semana_hasta < (now() at time zone 'America/Argentina/Buenos_Aires')::date
      and v_live.actualizado_at < now() - interval '24 hours')
     or (v_live.semana_hasta >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
      and v_live.actualizado_at < now() - interval '30 minutes')
     or v_live.actualizado_at > now() + interval '1 minute' then
    raise exception 'La sincronizacion esta desactualizada. Envia la semana desde Google Sheets primero'
      using errcode='22023';
  end if;
  if rm_test_private.horarios_validar_tabla(v_live.tablas->'Resumen') is not true
     or rm_test_private.horarios_validar_tabla(v_live.tablas->'Semana') is not true then
    raise exception 'Faltan datos de Resumen o Semana. No se archivo nada'
      using errcode='22023';
  end if;
  select * into v_week from rm_test_private.horarios_semanas
    where local_id='munro' and semana_desde=v_date for update;
  if not found or v_week.semana_hasta is distinct from v_live.semana_hasta
     or jsonb_typeof(v_week.filas) is distinct from 'array'
     or jsonb_array_length(v_week.filas)=0 then
    raise exception 'El Resumen aun no esta completo. Usa Enviar la semana ahora en Google Sheets'
      using errcode='22023';
  end if;

  insert into rm_test_private.horarios_archivos
    (local_id, semana_desde, semana_hasta, filas, filas_anteriores, resumen, semana, tablas)
  values
    ('munro', v_date, v_live.semana_hasta, v_week.filas, null, null, null, v_live.tablas)
  returning id into v_id;

  return jsonb_build_object('ok',true,'archivada',false,'archivo_id',v_id,'semana',v_date);
end $$;



revoke all on function public.rm_horarios_archivar_manual(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rm_horarios_archivar_manual(text,text,timestamptz) to authenticated;

-- Este flag es distinto de puede_administrar: el gerente no accede a pagos ni conexiones.
create or replace function public.rm_horarios_locales()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'local_id', l.id, 'local_name', l.name, 'conectado', h.token_hash is not null,
    'ultimo_envio_at', h.ultimo_envio_at, 'codigo_at', h.codigo_at,
    'puede_administrar', rm_test_private.horarios_puede_administrar(l.id),
    'puede_archivar', rm_test_private.horarios_puede_archivar(l.id)
  ) order by l.name), '[]'::jsonb)
  from rm_test_private.horarios_conexiones h
  join public.rm_app_local l on l.id=h.local_id
  where rm_test_private.horarios_puede_ver(l.id)
$$;
revoke all on function public.rm_horarios_locales() from public,anon,authenticated;
grant execute on function public.rm_horarios_locales() to authenticated;
