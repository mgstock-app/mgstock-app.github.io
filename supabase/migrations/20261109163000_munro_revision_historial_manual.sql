-- Mi Gusto Munro: permitir enviar una revision manual de una semana
-- ya archivada automaticamente, sin eliminar ni sobrescribir los PDFs.
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
     or not rm_test_private.horarios_puede_administrar(p_local) then
    raise exception 'Solo la administracion autorizada de Munro puede enviar horarios a historial'
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
  if v_live.actualizado_at < now() -
      case when v_live.semana_hasta < (now() at time zone 'America/Argentina/Buenos_Aires')::date
           then interval '24 hours' else interval '30 minutes' end
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


-- Estado solo lectura para distinguir PDF previo de la nueva copia manual.
-- No permite escrituras ni acceso a locales distintos de los autorizados.
create or replace function public.rm_horarios_estado_archivo(p_local text,p_desde text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_date date;
  v_live rm_test_private.horarios_en_vivo%rowtype;
  v_old rm_test_private.horarios_archivos%rowtype;
  v_manual boolean;
  v_pdf boolean;
  v_pending boolean;
begin
  if p_local is distinct from 'munro'
    or auth.uid() is null
    or not rm_test_private.horarios_puede_ver(p_local) then
    raise exception 'Sin acceso a los archivos del local' using errcode='42501';
  end if;
  v_date := rm_test_private.horarios_fecha(p_desde);
  if v_date is null then
    raise exception 'Semana no valida' using errcode='22023';
  end if;
  select * into v_live from rm_test_private.horarios_en_vivo
    where local_id=p_local and semana_desde=v_date;
  if not found then return jsonb_build_object('manual',false,'pdf',false,'pendiente',false); end if;
  select exists(select 1 from rm_test_private.horarios_archivos
    where local_id=p_local and semana_desde=v_date
      and resumen is null and semana is null) into v_manual;
  select exists(select 1 from rm_test_private.horarios_archivos
    where local_id=p_local and semana_desde=v_date
      and resumen is not null and semana is not null) into v_pdf;
  select * into v_old from rm_test_private.horarios_archivos
    where local_id=p_local and semana_desde=v_date
    order by archivado_at desc limit 1;
  v_pending := not v_manual and (
    v_old.id is null
    or v_live.tablas->'Resumen'->'values' is distinct from v_old.tablas->'Resumen'->'values'
    or v_live.tablas->'Semana'->'values' is distinct from v_old.tablas->'Semana'->'values');
  return jsonb_build_object('manual',v_manual,'pdf',v_pdf,'pendiente',v_pending);
end $$;
revoke all on function public.rm_horarios_estado_archivo(text,text) from public,anon,authenticated;
grant execute on function public.rm_horarios_estado_archivo(text,text) to authenticated;
