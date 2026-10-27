-- Restricción estricta del Conteo diario de Munro.
-- Ninguna otra empresa o sucursal tiene habilitado el diario, tampoco un rol 'editor'.
-- No modifica registros ni elimina el historial existente.
drop policy if exists gestlok_munro_daily_exclusive_guard on public.docs;
create policy gestlok_munro_daily_exclusive_guard
on public.docs
as restrictive
for all
to authenticated
using (
  case
    when col = 'munro/munro_control' or col like '%/diario' then
      tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
      and col in ('munro/munro_control', 'munro/diario')
      and (
        public.mi_rol() = 'creadora'
        or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro'))
      )
    else true
  end
)
with check (
  case
    when col = 'munro/munro_control' or col like '%/diario' then
      tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
      and col in ('munro/munro_control', 'munro/diario')
      and (
        public.mi_rol() = 'creadora'
        or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro'))
      )
    else true
  end
);
