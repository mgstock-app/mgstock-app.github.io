-- Staff · Munro: los colaboradores ven el Resumen semanal en solo lectura
-- (pedido del 17/11/2026) y dejan de recibir el enlace a la planilla de Google Sheets.
-- Aditiva: no cambia tablas, datos ni la función de dueños/gerentes (rm_munro_horarios_obtener).
-- Solo la persona aprobada, con correo verificado y asignada al local munro.
-- Sin notas manuales del dueño ni versiones internas; nunca permite editar.

create or replace function rm_test_private.munro_horarios_es_colaborador()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((
    select true
    from public.rm_test_members m
    join public.rm_app_directory d on d.user_id = m.user_id
    join public.rm_organization_members om on om.user_id = m.user_id
    join public.rm_app_local l on l.id = m.local_id and l.organization_id = om.organization_id
    where m.user_id = rm_test_private.uid()
      and m.role = 'employee'
      and m.local_id = 'munro'
      and rm_test_private.app_role() = 'employee'
      and d.status = 'approved'
      and rm_test_private.verified_email(d.email)
    limit 1
  ), false)
$$;
revoke all on function rm_test_private.munro_horarios_es_colaborador() from public, anon;
grant execute on function rm_test_private.munro_horarios_es_colaborador() to authenticated;

-- Quita la aclaración manual del dueño de cada registro (queda solo para dueño/gerentes).
create or replace function rm_test_private.munro_horarios_registro_lectura(p_registro jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id', p_registro->'id', 'semana', p_registro->'semana',
    'nombre', p_registro->'nombre', 'modalidad', p_registro->'modalidad', 'version', 0,
    'datos', coalesce((
      select jsonb_object_agg(e.key,
        case when jsonb_typeof(e.value) = 'object' then e.value - 'observaciones' else e.value end)
      from jsonb_each(coalesce(p_registro->'datos', '{}'::jsonb)) e
    ), '{}'::jsonb))
$$;
revoke all on function rm_test_private.munro_horarios_registro_lectura(jsonb) from public, anon;

create or replace function public.rm_munro_horarios_colaborador(p_semana date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_actual date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_lunes date;
 v_semana date;
 v_personas jsonb;
 v_planillas jsonb;
 v_historial jsonb;
 v_feriados jsonb;
 v_feriados_historial jsonb;
 v_cerrada boolean;
 v_cierres jsonb;
begin
 if auth.uid() is null or not rm_test_private.munro_horarios_es_colaborador() then
   raise exception 'Sin permiso para el resumen de Staff de Munro' using errcode='42501';
 end if;
 v_lunes := v_actual-(extract(isodow from v_actual)::integer-1);
 v_semana := coalesce(p_semana, v_lunes);
 if extract(isodow from v_semana) <> 1 or v_semana > v_lunes then
   raise exception 'Elegí el lunes de una semana actual o anterior' using errcode='22023';
 end if;
 select exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas where semana=v_semana)
   into v_cerrada;
 select coalesce(jsonb_agg(c.semana order by c.semana desc),'[]'::jsonb) into v_cierres
   from rm_test_private.munro_horarios_semanas_cerradas c;

 if v_cerrada then
   select coalesce(jsonb_agg(rm_test_private.munro_horarios_registro_lectura(item.value)),'[]'::jsonb)
     into v_planillas
   from rm_test_private.munro_horarios_semanas_cerradas c
   cross join lateral jsonb_array_elements(coalesce(c.registros,'[]'::jsonb)) item
   where c.semana=v_semana;
 else
   select coalesce(jsonb_agg(rm_test_private.munro_horarios_registro_lectura(jsonb_build_object(
     'id',p.colaborador_id,'semana',p.semana,'datos',p.datos,
     'nombre',p.nombre_semana,'modalidad',p.modalidad_semana)) order by p.colaborador_id),'[]'::jsonb)
     into v_planillas
   from rm_test_private.munro_horarios_planillas p where p.semana=v_semana;
 end if;

 -- Solo quienes tienen planilla en la semana elegida (sin la lista interna de colaboradores).
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',(r->>'id')::integer,'nombre',r->>'nombre','modalidad',r->>'modalidad',
   'estado','activo') order by (r->>'id')::integer),'[]'::jsonb)
   into v_personas
 from jsonb_array_elements(v_planillas) r
 where coalesce(btrim(r->>'nombre'),'') <> '';

 with rows as (
  select c.semana as dia,(item.value->>'id')::integer as id,item.value as registro
  from rm_test_private.munro_horarios_semanas_cerradas c
  cross join lateral jsonb_array_elements(c.registros) item
  union all
  select p.semana,p.colaborador_id,jsonb_build_object(
     'id',p.colaborador_id,'semana',p.semana,'datos',p.datos,
     'nombre',p.nombre_semana,'modalidad',p.modalidad_semana)
  from rm_test_private.munro_horarios_planillas p
  where p.semana<v_lunes
   and not exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=p.semana)
 )
 select coalesce(jsonb_agg(rm_test_private.munro_horarios_registro_lectura(r.registro)
   order by r.dia desc,r.id),'[]'::jsonb)
 into v_historial from (select * from rows order by dia desc,id limit 1500) r;

 select coalesce(f.dias,'[]'::jsonb) into v_feriados
   from rm_test_private.munro_horarios_feriados f where f.semana=v_semana;
 select coalesce(jsonb_object_agg(f.semana::text,f.dias),'{}'::jsonb)
   into v_feriados_historial from rm_test_private.munro_horarios_feriados f
   where f.semana<v_lunes
      or exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=f.semana);

 return jsonb_build_object('semana',v_semana,'personas',v_personas,'planillas',v_planillas,
   'historial',v_historial,'puede_editar',false,'solo_lectura',true,
   'semana_cerrada',v_cerrada,'cierres',v_cierres,
   'feriados',coalesce(v_feriados,'[]'::jsonb),'feriados_version',0,
   'feriados_historial',coalesce(v_feriados_historial,'{}'::jsonb));
end $$;
revoke all on function public.rm_munro_horarios_colaborador(date) from public, anon;
grant execute on function public.rm_munro_horarios_colaborador(date) to authenticated;

-- Sin acceso a la planilla de Google Sheets para colaboradores de Munro.
-- Igual a la versión vigente, más «l.id <> 'munro'». Don Torcuato y otras empresas sin cambios.
create or replace function rm_test_private.rm_employee_schedule_view()
returns jsonb language sql stable security definer set search_path to '' as $function$
  select coalesce((
    select jsonb_build_object(
      'local_id', l.id,
      'local_name', l.name,
      'url',
        'https://docs.google.com/spreadsheets/d/'
        || substring(s.url from '^https://docs[.]google[.]com/spreadsheets/d/([A-Za-z0-9_-]+)/edit')
        || '/preview'
        || case
          when substring(s.url from '[?#&]gid=([0-9]+)') is not null
          then '?gid=' || substring(s.url from '[?#&]gid=([0-9]+)')
          else ''
        end
    )
    from public.rm_test_members m
    join public.rm_app_directory d on d.user_id = m.user_id
    join public.rm_organization_members om on om.user_id = m.user_id
    join public.rm_app_local l
      on l.id = m.local_id and l.organization_id = om.organization_id
    join rm_test_private.branch_schedule_links s
      on s.local_id = l.id and s.enabled and s.url is not null
    where m.user_id = rm_test_private.uid()
      and m.role = 'employee'
      and rm_test_private.app_role() = 'employee'
      and d.status = 'approved'
      and rm_test_private.verified_email(d.email)
      and s.url ~ '^https://docs[.]google[.]com/spreadsheets/d/[A-Za-z0-9_-]+/edit([?#].*)?$'
      and l.id <> 'munro'
    limit 1
  ), '{}'::jsonb)
$function$;
