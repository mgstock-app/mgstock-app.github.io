-- Mi Gusto: ocultamiento visual reversible de Conteo diario.
-- No se modifica ni elimina ninguna planilla, historial, movimiento ni permiso existente.
create table if not exists gestlok_platform.mi_gusto_daily_visibility (
  feature text primary key check(feature='munro_conteo_diario'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table gestlok_platform.mi_gusto_daily_visibility enable row level security;
revoke all on gestlok_platform.mi_gusto_daily_visibility from public,anon,authenticated;

create or replace function public.gestlok_mi_gusto_daily_visibility()
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then
   return false;
 end if;
 return coalesce((
   select v.enabled from gestlok_platform.mi_gusto_daily_visibility v
   where v.feature='munro_conteo_diario'
 ),false);
end $$;

create or replace function public.gestlok_creator_set_mi_gusto_daily_visibility(p_visible boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_admin uuid := gestlok_platform.require_admin();
 v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
 if p_visible is null
    or v_email <> 'kmu15lopez@gmail.com'
    or not exists(
      select 1 from auth.users u where u.id=v_admin
      and u.email_confirmed_at is not null and lower(u.email)=v_email
    )
 then raise exception 'Solo la creadora verificada puede cambiar la visibilidad'
   using errcode='42501';
 end if;

 insert into gestlok_platform.mi_gusto_daily_visibility(feature,enabled,updated_at,updated_by)
 values('munro_conteo_diario',p_visible,now(),v_admin)
 on conflict(feature) do update
 set enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
 values(v_admin,'mi_gusto_diario_visibility',
        'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid,
        jsonb_build_object('visible',p_visible));
 return p_visible;
end $$;
revoke all on function public.gestlok_mi_gusto_daily_visibility(),
 public.gestlok_creator_set_mi_gusto_daily_visibility(boolean) from public,anon;
grant execute on function public.gestlok_mi_gusto_daily_visibility(),
 public.gestlok_creator_set_mi_gusto_daily_visibility(boolean) to authenticated;
