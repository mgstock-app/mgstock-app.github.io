-- Conteo Munro: fijar selección de secciones elegida por administradora.
-- Captura exactamente las secciones ocultas en mañana entrada del 14/11/2026.
-- Los gerentes no pueden quitar ni reactivar más categorías después del bloqueo.
create table if not exists gestlok_munro_conteo_private.settings (
 id smallint primary key check(id=1),
 hidden_sections text[] not null default array[]::text[],
 locked boolean not null default true,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table gestlok_munro_conteo_private.settings enable row level security;
revoke all on gestlok_munro_conteo_private.settings from public,anon,authenticated;

do $$
begin
 if not exists (
  select 1 from gestlok_munro_conteo_private.shifts
  where day=date '2026-11-14' and shift='manana_entrada'
 ) then raise exception 'No se encontró la selección real de Munro para fijar'; end if;
end $$;

insert into gestlok_munro_conteo_private.settings (id,hidden_sections,locked,updated_at)
select 1,array(select distinct unnest(hidden_sections) order by 1),true,now()
  from gestlok_munro_conteo_private.shifts
 where day=date '2026-11-14' and shift='manana_entrada'
on conflict (id) do nothing;

-- Preservar los históricos finalizados; sincronizar los borradores actuales.
update gestlok_munro_conteo_private.shifts
set hidden_sections = (select hidden_sections from gestlok_munro_conteo_private.settings where id=1)
where status='borrador';

-- Los siguientes turnos nacen con la misma configuración del local.
create or replace function gestlok_munro_conteo_private.set_default_sections()
returns trigger language plpgsql security definer set search_path='' as $$
declare fixed text[];
begin
 select hidden_sections into fixed from gestlok_munro_conteo_private.settings where id=1;
 if found then new.hidden_sections:=fixed; end if;
 return new;
end $$;
revoke all on function gestlok_munro_conteo_private.set_default_sections() from public,anon,authenticated;
drop trigger if exists gestlok_munro_conteo_default_sections on gestlok_munro_conteo_private.shifts;
create trigger gestlok_munro_conteo_default_sections
before insert on gestlok_munro_conteo_private.shifts
for each row execute function gestlok_munro_conteo_private.set_default_sections();

-- Verificar permisos de local y rol en el servidor, nunca solo en la interfaz.
create or replace function public.gestlok_munro_conteo_set_section(
 p_day date,p_shift text,p_section text,p_visible boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r gestlok_munro_conteo_private.shifts%rowtype;
 fixed boolean := false;
begin
 perform gestlok_munro_conteo_private.require_access(true,false);
 if p_day is null or p_day < date '2025-01-01'
    or p_day > (now() at time zone 'America/Argentina/Buenos_Aires')::date+1
    or p_shift not in ('manana_entrada','manana_salida','noche_salida')
    or p_visible is null or p_section is null or length(p_section)>70
 then raise exception 'Turno o sección no válidos'; end if;
 if p_section<>'_waste' then
   if not exists (select 1 from gestlok_munro_conteo_private.products
                  where section=p_section and active=true)
   then raise exception 'La sección no está disponible'; end if;
   select locked into fixed from gestlok_munro_conteo_private.settings where id=1;
   if coalesce(fixed,false) then
     -- Una vez fijada la configuración, solo la administradora real puede cambiarla.
     perform gestlok_munro_conteo_private.require_access(true,true);
   end if;
 end if;
 insert into gestlok_munro_conteo_private.shifts(day,shift) values(p_day,p_shift)
   on conflict do nothing;
 select * into r from gestlok_munro_conteo_private.shifts
  where day=p_day and shift=p_shift for update;
 if r.status='finalizado' then
   raise exception 'No se pueden editar secciones de un conteo finalizado';
 end if;
 if p_section='_waste' then
   update gestlok_munro_conteo_private.shifts
    set waste_visible=p_visible,updated_by=auth.uid(),updated_at=now()
    where day=p_day and shift=p_shift;
 elsif coalesce(fixed,false) then
   update gestlok_munro_conteo_private.settings
      set hidden_sections=case
        when p_visible then array_remove(hidden_sections,p_section)
        when not p_section=any(hidden_sections) then array_append(hidden_sections,p_section)
        else hidden_sections end,
        updated_by=auth.uid(),updated_at=now()
      where id=1;
   -- Mantener los borradores de mañana, tarde y noche de la tienda sincronizados.
   update gestlok_munro_conteo_private.shifts
      set hidden_sections=(select hidden_sections from gestlok_munro_conteo_private.settings where id=1)
      where status='borrador';
 else
   update gestlok_munro_conteo_private.shifts set
    hidden_sections=case when p_visible then array_remove(r.hidden_sections,p_section)
     when not p_section=any(r.hidden_sections) then array_append(r.hidden_sections,p_section)
     else r.hidden_sections end,
    updated_by=auth.uid(),updated_at=now()
   where day=p_day and shift=p_shift;
 end if;
 return jsonb_build_object('ok',true,'section',p_section,'visible',p_visible);
end $$;

create or replace function public.gestlok_munro_conteo_state(p_day date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d date :=coalesce(p_day,(now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
 perform gestlok_munro_conteo_private.require_access(false,false);
 return jsonb_build_object(
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position)
                       from gestlok_munro_conteo_private.products p),'[]'::jsonb),
  'counts',coalesce((select jsonb_agg(to_jsonb(s) order by s.shift)
                     from gestlok_munro_conteo_private.shifts s where s.day=d),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(to_jsonb(q) order by q.day desc,q.shift) from
            (select * from gestlok_munro_conteo_private.shifts
             where status='finalizado' order by day desc,shift limit 150) q),'[]'::jsonb),
  'settings',coalesce((select jsonb_build_object('locked',locked,'hidden_sections',hidden_sections)
                       from gestlok_munro_conteo_private.settings where id=1),'{}'::jsonb)
 );
end $$;
revoke all on function public.gestlok_munro_conteo_set_section(date,text,text,boolean) from public,anon;
revoke all on function public.gestlok_munro_conteo_state(date) from public,anon;
grant execute on function public.gestlok_munro_conteo_set_section(date,text,text,boolean) to authenticated;
grant execute on function public.gestlok_munro_conteo_state(date) to authenticated;