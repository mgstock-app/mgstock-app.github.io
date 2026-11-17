-- Mi Gusto Munro: resumen semanal privado de cada colaborador.
-- Vinculacion explicita, nunca por coincidencia del nombre abreviado.
create table if not exists rm_test_private.munro_horarios_cuentas (
 usuario_id uuid primary key references public.rm_app_directory(user_id) on delete cascade,
 colaborador_id integer not null unique references rm_test_private.munro_horarios_colaboradores(id) on delete restrict,
 vinculado_por uuid not null,
 vinculado_at timestamptz not null default now()
);
alter table rm_test_private.munro_horarios_cuentas enable row level security;
revoke all on rm_test_private.munro_horarios_cuentas from public,anon,authenticated;

create or replace function public.rm_munro_horarios_cuentas_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
   raise exception 'Sin permiso para vincular colaboradores de Munro' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'usuario_id', d.user_id, 'nombre', d.display_name, 'email', d.email,
  'colaborador_id',v.colaborador_id
 ) order by d.display_name), '[]'::jsonb) into v_result
 from public.rm_test_members m
 join public.rm_app_directory d on d.user_id=m.user_id
 join public.rm_app_local l on l.id=m.local_id
 join public.rm_organization_members om on om.user_id=m.user_id and om.organization_id=l.organization_id
 left join rm_test_private.munro_horarios_cuentas v on v.usuario_id=m.user_id
 where m.local_id='munro' and m.role='employee' and d.status='approved'
   and rm_test_private.verified_email(d.email);
 return v_result;
end $$;
revoke all on function public.rm_munro_horarios_cuentas_listar() from public,anon,authenticated;
grant execute on function public.rm_munro_horarios_cuentas_listar() to authenticated;

create or replace function public.rm_munro_horarios_cuentas_vincular(
 p_usuario uuid,p_colaborador integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not rm_test_private.horarios_puede_archivar('munro') then
   raise exception 'Sin permiso para vincular colaboradores de Munro' using errcode='42501';
 end if;
 if p_usuario is null or not exists (
  select 1 from public.rm_test_members m
  join public.rm_app_directory d on d.user_id=m.user_id
  join public.rm_app_local l on l.id=m.local_id
  join public.rm_organization_members om on om.user_id=m.user_id and om.organization_id=l.organization_id
  where m.user_id=p_usuario and m.role='employee' and m.local_id='munro'
    and d.status='approved' and rm_test_private.verified_email(d.email)
 ) then
  raise exception 'La cuenta no es de un colaborador aprobado de Munro' using errcode='42501';
 end if;
 if p_colaborador is null then
  delete from rm_test_private.munro_horarios_cuentas where usuario_id=p_usuario;
  return jsonb_build_object('ok',true,'vinculado',false);
 end if;
 if not exists(select 1 from rm_test_private.munro_horarios_colaboradores
    where id=p_colaborador and btrim(nombre)<>'') then
   raise exception 'El colaborador no está disponible en Staff Munro' using errcode='22023';
 end if;
 if exists(select 1 from rm_test_private.munro_horarios_cuentas
   where colaborador_id=p_colaborador and usuario_id<>p_usuario) then
   raise exception 'Este colaborador ya está vinculado a otra cuenta' using errcode='22023';
 end if;
 insert into rm_test_private.munro_horarios_cuentas (usuario_id,colaborador_id,vinculado_por)
 values(p_usuario,p_colaborador,auth.uid())
 on conflict (usuario_id) do update
 set colaborador_id=excluded.colaborador_id,vinculado_por=excluded.vinculado_por,vinculado_at=now();
 return jsonb_build_object('ok',true,'vinculado',true);
end $$;
revoke all on function public.rm_munro_horarios_cuentas_vincular(uuid,integer) from public,anon,authenticated;
grant execute on function public.rm_munro_horarios_cuentas_vincular(uuid,integer) to authenticated;

create or replace function public.rm_munro_horarios_mi_resumen()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_usuario uuid;
 v_persona integer;
 v_nombre text;
 v_modalidad text;
 v_lunes date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
 v_semanas jsonb;
begin
 if auth.uid() is null or rm_test_private.app_role()<>'employee' then
  raise exception 'Sin permiso para el resumen de Munro' using errcode='42501';
 end if;
 select m.user_id into v_usuario
 from public.rm_test_members m
 join public.rm_app_directory d on d.user_id=m.user_id
 join public.rm_app_local l on l.id=m.local_id
 join public.rm_organization_members om on om.user_id=m.user_id and om.organization_id=l.organization_id
 where m.user_id=rm_test_private.uid() and m.role='employee'
   and m.local_id='munro' and d.status='approved'
   and rm_test_private.verified_email(d.email);
 if v_usuario is null then
  raise exception 'Esta cuenta no pertenece a un colaborador aprobado de Munro' using errcode='42501';
 end if;
 select c.id,c.nombre,c.modalidad into v_persona,v_nombre,v_modalidad
 from rm_test_private.munro_horarios_cuentas v
 join rm_test_private.munro_horarios_colaboradores c on c.id=v.colaborador_id
 where v.usuario_id=v_usuario;
 if v_persona is null then
  return jsonb_build_object('vinculado',false,'semanas','[]'::jsonb);
 end if;
 v_lunes:=v_lunes-(extract(isodow from v_lunes)::integer-1);
 with semanas as (
  select c.semana, coalesce(j.value->'datos','{}'::jsonb) as datos,
   coalesce(nullif(j.value->>'modalidad',''),v_modalidad) as modalidad,
   coalesce(nullif(j.value->>'nombre',''),v_nombre) as nombre,
   c.feriados, true as finalizada
  from rm_test_private.munro_horarios_semanas_cerradas c
  cross join lateral jsonb_array_elements(c.registros) j(value)
  where (j.value->>'id')::integer=v_persona and c.semana<=v_lunes
  union all
  select p.semana,p.datos,coalesce(p.modalidad_semana,v_modalidad),
   coalesce(nullif(p.nombre_semana,''),v_nombre),
   coalesce(f.dias,'[]'::jsonb),p.semana<v_lunes
  from rm_test_private.munro_horarios_planillas p
  left join rm_test_private.munro_horarios_feriados f on f.semana=p.semana
  where p.colaborador_id=v_persona and p.semana<=v_lunes
    and not exists(select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=p.semana)
  union all
  select v_lunes,'{}'::jsonb,v_modalidad,v_nombre,'[]'::jsonb,false
  where not exists (select 1 from rm_test_private.munro_horarios_planillas p where p.colaborador_id=v_persona and p.semana=v_lunes)
    and not exists (select 1 from rm_test_private.munro_horarios_semanas_cerradas c where c.semana=v_lunes)
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'semana',x.semana,'datos',x.datos,'modalidad',x.modalidad,'nombre',x.nombre,
  'feriados',x.feriados,'finalizada',x.finalizada
 ) order by x.semana desc),'[]'::jsonb) into v_semanas
 from (select * from semanas order by semana desc limit 52) x;
 return jsonb_build_object('vinculado',true,'semanas',v_semanas);
end $$;
revoke all on function public.rm_munro_horarios_mi_resumen() from public,anon,authenticated;
grant execute on function public.rm_munro_horarios_mi_resumen() to authenticated;
