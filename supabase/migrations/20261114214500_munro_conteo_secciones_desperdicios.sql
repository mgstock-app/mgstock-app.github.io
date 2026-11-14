-- Mi Gusto Munro / Conteo: secciones ocultables y Desperdicios opcional por turno.
-- Ninguna fila o producto se elimina al ocultar. Todo cambio requiere acceso al local.
alter table gestlok_munro_conteo_private.shifts
  add column if not exists hidden_sections text[] not null default ARRAY[]::text[],
  add column if not exists waste_visible boolean not null default false;

-- Conservar visible cualquier desperdicio existente antes de habilitar esta opción.
update gestlok_munro_conteo_private.shifts
   set waste_visible=true
 where jsonb_array_length(coalesce(waste,'[]'::jsonb)) > 0
   and waste_visible=false;

create or replace function public.gestlok_munro_conteo_set_section(
 p_day date, p_shift text, p_section text, p_visible boolean
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r gestlok_munro_conteo_private.shifts%rowtype;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
    or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
    or p_shift not in ('manana_entrada','manana_salida','noche_salida')
    or p_visible is null or p_section is null or length(p_section)>70
 then raise exception 'Turno o sección no válidos'; end if;
 if p_section <> '_waste' and not exists(
   select 1 from gestlok_munro_conteo_private.products
   where section=p_section and active=true
 ) then raise exception 'La sección no está disponible'; end if;

 insert into gestlok_munro_conteo_private.shifts(day,shift)
   values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_munro_conteo_private.shifts
   where day=p_day and shift=p_shift for update;
 if r.status='finalizado' then
   raise exception 'No se pueden editar secciones de un conteo finalizado';
 end if;
 if p_section='_waste' then
   update gestlok_munro_conteo_private.shifts set
    waste_visible=p_visible,updated_by=auth.uid(),updated_at=now()
    where day=p_day and shift=p_shift;
 else
   update gestlok_munro_conteo_private.shifts set
    hidden_sections=case when p_visible then array_remove(r.hidden_sections,p_section)
      when not (p_section=any(r.hidden_sections)) then array_append(r.hidden_sections,p_section)
      else r.hidden_sections end,
    updated_by=auth.uid(),updated_at=now()
    where day=p_day and shift=p_shift;
 end if;
 return jsonb_build_object('ok',true,'section',p_section,'visible',p_visible);
end $$;

-- El cliente no puede introducir desperdicios vía RPC si Desperdicios no está activo.
create or replace function public.gestlok_munro_conteo_set_extra(
 p_day date,p_shift text,p_kind text,p_items jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r gestlok_munro_conteo_private.shifts%rowtype;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
    or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1
    or p_shift not in ('manana_entrada','manana_salida','noche_salida')
    or p_kind not in ('consumption','waste') or p_items is null
    or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items)>60 or length(p_items::text)>12000
 then raise exception 'Datos no válidos'; end if;
 insert into gestlok_munro_conteo_private.shifts(day,shift)
   values(p_day,p_shift) on conflict do nothing;
 select * into r from gestlok_munro_conteo_private.shifts
   where day=p_day and shift=p_shift for update;
 if r.status='finalizado' then raise exception 'Este conteo ya fue finalizado'; end if;
 if p_kind='waste' then
   if not r.waste_visible then raise exception 'Activá Desperdicios para cargar sus datos'; end if;
   update gestlok_munro_conteo_private.shifts set
      waste=p_items,updated_by=auth.uid(),updated_at=now()
      where day=p_day and shift=p_shift;
 else
   update gestlok_munro_conteo_private.shifts set
      consumption=p_items,updated_by=auth.uid(),updated_at=now()
      where day=p_day and shift=p_shift;
 end if;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.gestlok_munro_conteo_set_section(date,text,text,boolean)
 from public,anon;
grant execute on function public.gestlok_munro_conteo_set_section(date,text,text,boolean)
 to authenticated;
revoke all on function public.gestlok_munro_conteo_set_extra(date,text,text,jsonb)
 from public,anon;
grant execute on function public.gestlok_munro_conteo_set_extra(date,text,text,jsonb)
 to authenticated;