-- Modo diseño de la Administradora General (09/11/2026).
-- Cambios visuales por empresa: editar un texto, ocultar un elemento o agregar un bloque.
-- Solo texto (nunca HTML). Leen los miembros de la empresa activa; escribe solo la creadora
-- verificada dentro de esa empresa. Aditiva: no modifica ni borra datos existentes.
create table if not exists public.gestlok_design_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  page text not null check (char_length(page) between 1 and 120),
  anchor text not null check (char_length(anchor) between 1 and 600),
  original text not null default '' check (char_length(original) <= 500),
  kind text not null check (kind in ('text','hide','add')),
  value text not null default '' check (char_length(value) <= 2000),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gestlok_design_overrides_tenant_page_idx
  on public.gestlok_design_overrides (tenant_id, page);

create or replace function public.gestlok_design_can_edit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.mi_rol() = 'creadora', false)
     and exists (select 1 from gestlok_platform.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.gestlok_design_can_edit() from public, anon;
grant execute on function public.gestlok_design_can_edit() to authenticated;

alter table public.gestlok_design_overrides enable row level security;
revoke all on public.gestlok_design_overrides from anon;
grant select, insert, update, delete on public.gestlok_design_overrides to authenticated;

drop policy if exists design_overrides_read on public.gestlok_design_overrides;
create policy design_overrides_read on public.gestlok_design_overrides
  for select to authenticated
  using (tenant_id = (select gestlok_tenancy.current_tenant_id()) and (select public.es_miembro()));

drop policy if exists design_overrides_insert on public.gestlok_design_overrides;
create policy design_overrides_insert on public.gestlok_design_overrides
  for insert to authenticated
  with check (tenant_id = (select gestlok_tenancy.current_tenant_id())
              and (select public.gestlok_design_can_edit())
              and created_by = auth.uid());

drop policy if exists design_overrides_update on public.gestlok_design_overrides;
create policy design_overrides_update on public.gestlok_design_overrides
  for update to authenticated
  using (tenant_id = (select gestlok_tenancy.current_tenant_id()) and (select public.gestlok_design_can_edit()))
  with check (tenant_id = (select gestlok_tenancy.current_tenant_id()) and (select public.gestlok_design_can_edit()));

drop policy if exists design_overrides_delete on public.gestlok_design_overrides;
create policy design_overrides_delete on public.gestlok_design_overrides
  for delete to authenticated
  using (tenant_id = (select gestlok_tenancy.current_tenant_id()) and (select public.gestlok_design_can_edit()));
