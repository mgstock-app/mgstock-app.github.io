-- Legajos independientes de la liquidación: no modifican recibos ni registros históricos.
-- Altas y cambios de estado de gerentes visibles al dueño de la misma organización/local.
create table if not exists public.rm_employee_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.rm_organizations(id),
  local_id text not null references public.rm_app_local(id),
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  phone text not null default '' check (length(phone) <= 35),
  payment_alias text not null default '' check (length(payment_alias) <= 120),
  notes text not null default '' check (length(notes) <= 1500),
  status text not null default 'activo' check (status in ('activo','refuerzo','inactivo')),
  reinforcement_dates date[] not null default '{}'::date[] check (coalesce(array_position(reinforcement_dates,null),0)=0),
  last_worked_on date null,
  started_on date null,
  created_by uuid not null default auth.uid(),
  updated_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rm_emp_profile_status_dates check (
    (status <> 'refuerzo' or cardinality(reinforcement_dates) > 0)
    and (status <> 'inactivo' or last_worked_on is not null)
  )
);
create index if not exists rm_emp_profile_local_idx on public.rm_employee_profiles(organization_id,local_id,status);
create table if not exists public.rm_employee_profile_history (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.rm_employee_profiles(id) on delete restrict,
  organization_id uuid not null,
  local_id text not null,
  actor_id uuid not null,
  recorded_at timestamptz not null default now(),
  previous_status text,
  status text not null,
  reinforcement_dates date[] not null,
  last_worked_on date,
  action text not null check (action in ('alta','actualizacion'))
);
create index if not exists rm_emp_profile_history_profile_idx on public.rm_employee_profile_history(profile_id,recorded_at desc);
-- No column in this table stores payroll or the manager's login credentials.
create or replace function rm_test_private.rm_employee_profile_scope(p_org uuid,p_local text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    exists(select 1 from public.rm_app_local l where l.id=p_local and l.organization_id=p_org)
    and (
      rm_test_private.manages_organization(p_org)
      or (
        p_local=any(rm_test_private.gestlok_gerente_locals())
        and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
      )
      or (
        rm_test_private.app_role()='manager' and exists (
          select 1 from public.rm_test_members m
          join public.rm_manager_permissions perm
            on perm.user_id=m.user_id
          join public.rm_app_local l on l.id=m.local_id and l.company_id=perm.company_id
          where m.user_id=rm_test_private.uid()
            and m.role='manager' and m.local_id=p_local
            and perm.organization_id=p_org
        )
      )
    ),false);
$$;
revoke all on function rm_test_private.rm_employee_profile_scope(uuid,text) from public, anon;
grant execute on function rm_test_private.rm_employee_profile_scope(uuid,text) to authenticated;
create or replace function rm_test_private.rm_employee_profile_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.rm_app_local l
                 where l.id=new.local_id and l.organization_id=new.organization_id)
  then raise exception 'Local no pertenece a esta empresa'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.organization_id<>old.organization_id or new.local_id<>old.local_id or new.created_by<>old.created_by
    then raise exception 'No se puede mover un legajo a otro local'; end if;
  end if;
  new.first_name=btrim(new.first_name);
  new.last_name=btrim(new.last_name);
  new.phone=btrim(new.phone);
  new.payment_alias=btrim(new.payment_alias);
  new.updated_at=now();
  new.updated_by=auth.uid();
  return new;
end
$$;
drop trigger if exists rm_employee_profile_touch on public.rm_employee_profiles;
create trigger rm_employee_profile_touch before insert or update on public.rm_employee_profiles
for each row execute function rm_test_private.rm_employee_profile_touch();
create or replace function rm_test_private.rm_employee_profile_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rm_employee_profile_history(
    profile_id, organization_id, local_id,actor_id,previous_status,status,reinforcement_dates,last_worked_on,action
  ) values(new.id,new.organization_id,new.local_id,auth.uid(),
    case when tg_op='INSERT' then null else old.status end,
    new.status,new.reinforcement_dates,new.last_worked_on,
    case when tg_op='INSERT' then 'alta' else 'actualizacion' end);
  return new;
end
$$;
revoke all on function rm_test_private.rm_employee_profile_audit() from public,anon,authenticated;
drop trigger if exists rm_employee_profile_audit on public.rm_employee_profiles;
create trigger rm_employee_profile_audit after insert or update on public.rm_employee_profiles
for each row execute function rm_test_private.rm_employee_profile_audit();
alter table public.rm_employee_profiles enable row level security;
alter table public.rm_employee_profile_history enable row level security;
drop policy if exists rm_employee_profiles_read on public.rm_employee_profiles;
create policy rm_employee_profiles_read on public.rm_employee_profiles for select to authenticated
using (rm_test_private.rm_employee_profile_scope(organization_id,local_id));
drop policy if exists rm_employee_profiles_create on public.rm_employee_profiles;
create policy rm_employee_profiles_create on public.rm_employee_profiles for insert to authenticated
with check (rm_test_private.rm_employee_profile_scope(organization_id,local_id) and created_by=auth.uid());
drop policy if exists rm_employee_profiles_edit on public.rm_employee_profiles;
create policy rm_employee_profiles_edit on public.rm_employee_profiles for update to authenticated
using (rm_test_private.rm_employee_profile_scope(organization_id,local_id))
with check (rm_test_private.rm_employee_profile_scope(organization_id,local_id));
drop policy if exists rm_employee_profile_history_read on public.rm_employee_profile_history;
create policy rm_employee_profile_history_read on public.rm_employee_profile_history for select to authenticated
using (rm_test_private.rm_employee_profile_scope(organization_id,local_id));
revoke all on public.rm_employee_profiles, public.rm_employee_profile_history from anon;
grant select,insert,update on public.rm_employee_profiles to authenticated;
grant select on public.rm_employee_profile_history to authenticated;
-- List only authorized locales for either GESTLOK gerente or ReciboNet manager/owner.
create or replace function rm_test_private.rm_employee_profile_locals()
returns jsonb language sql stable security definer set search_path = '' as $
select coalesce(jsonb_agg(row_to_json(l) order by l.name),'[]'::jsonb)
from public.rm_app_local l
where rm_test_private.rm_employee_profile_scope(l.organization_id,l.id)
$;
revoke all on function rm_test_private.rm_employee_profile_locals() from public,anon;
grant execute on function rm_test_private.rm_employee_profile_locals() to authenticated;
create or replace function public.rm_employee_profile_locals()
returns jsonb language sql stable set search_path = '' as $
select rm_test_private.rm_employee_profile_locals()
$;
revoke all on function public.rm_employee_profile_locals() from public,anon;
grant execute on function public.rm_employee_profile_locals() to authenticated;
