-- GESTLOK piloto privado: únicamente la empresa Perfumes (cuenta autorizada).
-- Ningún cambio a docs, Mi Gusto, Munro, Torcuato, ni permisos existentes.
create table if not exists public.gestlok_pilot_access (
  tenant_id uuid primary key,
  owner_uid uuid not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.gestlok_pilot_access enable row level security;
revoke all on public.gestlok_pilot_access from public, anon, authenticated;
grant select on public.gestlok_pilot_access to authenticated;
create policy pilot_access_read_self on public.gestlok_pilot_access
  for select to authenticated using (owner_uid = (select auth.uid()));
insert into public.gestlok_pilot_access (tenant_id,owner_uid,enabled)
values ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103','8ddf2c6c-8d62-44de-8ce8-27eb5759daa3',true)
on conflict (tenant_id) do nothing;

create table if not exists public.gestlok_pilot_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.gestlok_pilot_access(tenant_id),
  created_by uuid not null default auth.uid(),
  module text not null check (module in (
    'finanzas','ventas','compras','movimientos','costos','apertura_cierre',
    'personal','tareas','alertas','transferencias','mermas','reposicion',
    'comparativas','integraciones','documentos','clientes','resguardos','metas'
  )),
  title text not null check (char_length(trim(title)) between 2 and 160),
  note text not null default '' check (char_length(note)<=2000),
  amount numeric(14,2) check (amount is null or (amount>=0 and amount<=999999999999)),
  status text not null default 'pendiente' check (status in ('pendiente','en_curso','completado','cancelado')),
  due_on date,
  occurred_on date not null default current_date,
  responsible text not null default '' check (char_length(responsible)<=100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gestlok_pilot_records_tenant_module_idx
on public.gestlok_pilot_records(tenant_id,module,occurred_on desc);
alter table public.gestlok_pilot_records enable row level security;
revoke all on public.gestlok_pilot_records from public,anon,authenticated;
grant select,insert,update,delete on public.gestlok_pilot_records to authenticated;
create policy pilot_records_read on public.gestlok_pilot_records for select to authenticated
using (created_by=(select auth.uid()) and exists(
 select 1 from public.gestlok_pilot_access a
 where a.tenant_id=gestlok_pilot_records.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled
));
create policy pilot_records_add on public.gestlok_pilot_records for insert to authenticated
with check (created_by=(select auth.uid()) and exists(
 select 1 from public.gestlok_pilot_access a
 where a.tenant_id=gestlok_pilot_records.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled
));
create policy pilot_records_change on public.gestlok_pilot_records for update to authenticated
using (created_by=(select auth.uid()) and exists(
 select 1 from public.gestlok_pilot_access a
 where a.tenant_id=gestlok_pilot_records.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled
))
with check (created_by=(select auth.uid()) and exists(
 select 1 from public.gestlok_pilot_access a
 where a.tenant_id=gestlok_pilot_records.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled
));
create policy pilot_records_remove on public.gestlok_pilot_records for delete to authenticated
using (created_by=(select auth.uid()) and exists(
 select 1 from public.gestlok_pilot_access a
 where a.tenant_id=gestlok_pilot_records.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled
));

create table if not exists public.gestlok_pilot_audit (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  record_id uuid not null,
  module text not null,
  action text not null check (action in ('creado','actualizado','eliminado')),
  actor_uid uuid not null,
  at timestamptz not null default now()
);
create index if not exists gestlok_pilot_audit_tenant_at_idx on public.gestlok_pilot_audit(tenant_id,at desc);
alter table public.gestlok_pilot_audit enable row level security;
revoke all on public.gestlok_pilot_audit from public,anon,authenticated;
grant select on public.gestlok_pilot_audit to authenticated;
create policy pilot_audit_owner_read on public.gestlok_pilot_audit for select to authenticated
using (exists (select 1 from public.gestlok_pilot_access a
 where a.tenant_id=gestlok_pilot_audit.tenant_id and a.owner_uid=(select auth.uid()) and a.enabled));

create or replace function public.gestlok_pilot_record_audit()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.gestlok_pilot_records;
begin
 if tg_op='DELETE' then
  v:=old;
 else
  v:=new;
 end if;
 if tg_op='UPDATE' then
  new.updated_at:=now();
  v:=new;
 end if;
 insert into public.gestlok_pilot_audit(tenant_id,record_id,module,action,actor_uid)
 values(v.tenant_id,v.id,v.module,
   case tg_op when 'INSERT' then 'creado' when 'UPDATE' then 'actualizado' else 'eliminado' end,
   auth.uid());
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
revoke all on function public.gestlok_pilot_record_audit() from public,anon,authenticated;
create trigger gestlok_pilot_audit_change
before insert or update or delete on public.gestlok_pilot_records
for each row execute function public.gestlok_pilot_record_audit();

-- Only the explicit pilot owner can read configuration; access writes remain server-side.
