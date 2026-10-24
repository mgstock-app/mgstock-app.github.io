-- GestLok: el Dueño puede preparar y administrar GERENTES de su propia empresa.
-- No puede crear/editar/eliminar Dueños, Creadoras ni integrantes de otro tenant.
drop policy if exists gestlok_owner_team_insert on public.docs;
create policy gestlok_owner_team_insert on public.docs
for insert to authenticated
with check (
  col='equipo'
  and tenant_id=(select gestlok_tenancy.current_tenant_id())
  and public.mi_rol()='dueno'
  and data->>'rol' in ('gerente','lectura')
  and lower(data->>'email')=lower(id)
  and jsonb_typeof(data->'locales')='array'
  and not exists (
    select 1 from jsonb_array_elements_text(data->'locales') x
    where not public.puede_ver_local(x.value)
  )
);
drop policy if exists gestlok_owner_team_update on public.docs;
create policy gestlok_owner_team_update on public.docs
for update to authenticated
using (
  col='equipo'
  and tenant_id=(select gestlok_tenancy.current_tenant_id())
  and public.mi_rol()='dueno'
  and data->>'rol' in ('gerente','lectura')
)
with check (
  col='equipo'
  and tenant_id=(select gestlok_tenancy.current_tenant_id())
  and public.mi_rol()='dueno'
  and data->>'rol' in ('gerente','lectura')
  and lower(data->>'email')=lower(id)
  and jsonb_typeof(data->'locales')='array'
  and not exists (
    select 1 from jsonb_array_elements_text(data->'locales') x
    where not public.puede_ver_local(x.value)
  )
);
drop policy if exists gestlok_owner_team_delete on public.docs;
create policy gestlok_owner_team_delete on public.docs
for delete to authenticated
using (
  col='equipo'
  and tenant_id=(select gestlok_tenancy.current_tenant_id())
  and public.mi_rol()='dueno'
  and data->>'rol' in ('gerente','lectura')
);
