-- Mi Gusto · Munro: historial solamente por confirmacion manual desde GESTLOK.
-- La planilla sigue enviando datos en vivo; los archivos PDF anteriores no se modifican.
-- No se cambia Torcuato ni se habilitan permisos de lectura/escritura sobre tablas privadas.

-- Una copia manual conserva las dos tablas originales con colores y merges.
-- Los PDF siguen existiendo para archivos creados previamente desde Sheets.
alter table rm_test_private.horarios_archivos
  alter column resumen drop not null,
  alter column semana drop not null;

alter table rm_test_private.horarios_archivos
  add constraint horarios_archivos_documentos_consistentes
  check (
    (resumen is not null and semana is not null)
    or (resumen is null and semana is null and tablas is not null)
  );

-- Incluso con dos sesiones simultaneas solo puede existir un archivo manual por semana.
create unique index horarios_archivos_manuales_unicos
  on rm_test_private.horarios_archivos(local_id, semana_desde)
  where resumen is null and semana is null;

create function public.rm_horarios_archivar_manual(
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

  select id into v_id from rm_test_private.horarios_archivos
    where local_id='munro' and semana_desde=v_date
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
  if v_live.actualizado_at < now() - interval '30 minutes'
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
revoke all on function public.rm_horarios_archivar_manual(text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.rm_horarios_archivar_manual(text,text,timestamptz)
  to authenticated;

-- La copia PDF es opcional UNICAMENTE en archivos manuales. En la UI no
-- se ofrece descargar PDF si la copia se hizo sin exportacion desde Sheets.
create or replace function public.rm_horarios_tabla(p_local text,p_archivo uuid,p_hoja text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_local is distinct from 'munro' or not rm_test_private.horarios_puede_ver(p_local) then
    raise exception 'Sin acceso al historial del local' using errcode='42501';
  end if;
  if p_hoja is null or p_hoja not in ('Resumen','Semana') then
    raise exception 'Hoja invalida' using errcode='22023';
  end if;
  select jsonb_build_object('tabla',tablas->p_hoja,'filas',filas,'tiene_pdf',resumen is not null)
    into result from rm_test_private.horarios_archivos
    where id=p_archivo and local_id=p_local;
  if result is null then raise exception 'Archivo no encontrado' using errcode='22023'; end if;
  return result;
end $$;
revoke all on function public.rm_horarios_tabla(text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.rm_horarios_tabla(text,uuid,text)
  to authenticated;

-- La funcion usada por Apps Script en Munro se deshabilita, incluso si en
-- la planilla quedo instalado el antiguo disparador del lunes 08:00.
-- Torcuato utiliza una funcion distinta y no se modifica.
revoke execute on function public.rm_horarios_archivar_tablas(
  text,text,text,jsonb,text,text,jsonb
) from public,anon,authenticated;
