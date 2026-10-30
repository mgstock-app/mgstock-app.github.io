-- GESTLOK: mantener planillas vacías/invisibles hasta completar el legajo.
-- Los recibos anteriores se conservan SIN BORRAR NI LIMPIAR fórmulas, horas, importes o historial.
-- Restringido a empresa Mi Gusto con locales Munro (munro) y Torcuato (dt).

create table if not exists rm_test_private.owner_roster_settings (
  organization_id uuid primary key references public.rm_organizations(id),
  enabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists rm_test_private.owner_roster_archive (
  organization_id uuid not null references public.rm_organizations(id),
  path text not null,
  archived_at timestamptz not null default clock_timestamp(),
  primary key (organization_id,path)
);
alter table rm_test_private.owner_roster_settings enable row level security;
alter table rm_test_private.owner_roster_archive enable row level security;
revoke all on rm_test_private.owner_roster_settings,rm_test_private.owner_roster_archive
  from public,anon,authenticated;

-- El corte inicial se hace sobre las carpetas EXISTENTES. Los nuevos legajos
-- quedan habilitados cuando su dueño complete sus datos personales.
insert into rm_test_private.owner_roster_settings(organization_id)
select distinct c.organization_id from public.rm_companies c
where lower(btrim(c.name))='mi gusto'
  and exists(select 1 from public.rm_app_local l
      where l.organization_id=c.organization_id and l.company_id=c.id and l.id='munro')
  and exists(select 1 from public.rm_app_local l
      where l.organization_id=c.organization_id and l.company_id=c.id and l.id='dt')
on conflict (organization_id) do nothing;

insert into rm_test_private.owner_roster_archive(organization_id,path)
select d.organization_id,d.path from public.rm_test_documents d
join rm_test_private.owner_roster_settings s on s.organization_id=d.organization_id and s.enabled
where d.path ~ '^hojas/[^/]+$'
on conflict (organization_id,path) do nothing;

-- Respuesta limitada a IDs de las planillas del propio negocio del Dueño.
-- No se exponen documentos ni detalles salariales por esta RPC.
create or replace function rm_test_private.owner_roster_state(p_organization uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare enabled_flag boolean; enabled_ids jsonb;
begin
  if auth.uid() is null or not rm_test_private.ensure_directory()
     or rm_test_private.app_role()<>'owner'
     or not rm_test_private.manages_organization(p_organization)
  then raise exception 'Nómina privada: acceso del dueño requerido' using errcode='42501'; end if;

  select s.enabled into enabled_flag
  from rm_test_private.owner_roster_settings s
  where s.organization_id=p_organization;
  if coalesce(enabled_flag,false) is false then
    return jsonb_build_object('enabled',false,'active_sheet_ids','[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(distinct m.sheet_id),'[]'::jsonb) into enabled_ids
  from rm_test_private.manager_staff_invites i
  join public.rm_employee_profiles p on p.id=i.profile_id
    and p.organization_id=i.organization_id and p.local_id=i.local_id
  join public.rm_test_members m on m.user_id=i.redeemed_by
    and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om on om.user_id=i.redeemed_by
    and om.organization_id=i.organization_id
  join public.rm_app_local l on l.id=i.local_id
    and l.organization_id=i.organization_id and l.company_id=i.company_id
  where i.organization_id=p_organization
    and p.needs_completion=false and m.sheet_id is not null
    and not exists (select 1 from rm_test_private.owner_roster_archive a
        where a.organization_id=i.organization_id and a.path='hojas/'||m.sheet_id);

  return jsonb_build_object('enabled',true,'active_sheet_ids',enabled_ids);
end $fn$;
revoke all on function rm_test_private.owner_roster_state(uuid) from public,anon,authenticated;
grant execute on function rm_test_private.owner_roster_state(uuid) to authenticated;

create or replace function public.rm_app_owner_roster_state(p_organization uuid)
returns jsonb language sql set search_path='' as $fn$
  select rm_test_private.owner_roster_state(p_organization)
$fn$;
revoke all on function public.rm_app_owner_roster_state(uuid) from public,anon,authenticated;
grant execute on function public.rm_app_owner_roster_state(uuid) to authenticated;

-- Al guardar SU PROPIO legajo, se habilita solamente la planilla asociada
-- a ese usuario y sucursal. Nunca hay coincidencias automáticas por apodo.
create or replace function rm_test_private.owner_roster_activate_on_legajo_save()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare sheet text;
begin
  if new.needs_completion or auth.uid() is null then return new; end if;
  select m.sheet_id into sheet
  from rm_test_private.manager_staff_invites i
  join public.rm_test_members m on m.user_id=i.redeemed_by
    and m.role='employee' and m.local_id=i.local_id
  join public.rm_organization_members om on om.user_id=i.redeemed_by
    and om.organization_id=i.organization_id
  where i.profile_id=new.id and i.organization_id=new.organization_id
    and i.local_id=new.local_id and i.redeemed_by=auth.uid()
  limit 1;

  if sheet is not null then
    delete from rm_test_private.owner_roster_archive a
      where a.organization_id=new.organization_id and a.path='hojas/'||sheet;
  end if;
  return new;
end $fn$;
revoke all on function rm_test_private.owner_roster_activate_on_legajo_save()
  from public,anon,authenticated;
drop trigger if exists trg_owner_roster_activate_on_legajo_save on public.rm_employee_profiles;
create trigger trg_owner_roster_activate_on_legajo_save
after update of first_name,last_name,phone,payment_alias,started_on,needs_completion
on public.rm_employee_profiles
for each row execute function rm_test_private.owner_roster_activate_on_legajo_save();
