-- Motos Agencia: nombres editables de colaboradores y motos (documento «motos»).
-- Lo leen y modifican dueños, creadora y gerentes de Munro (la política
-- gestlok_munro_motos_guard ya limita la colección a Mi Gusto – Munro). No se borra.
-- Solo reemplaza políticas restrictivas de esta colección: no modifica datos.
-- Reversión: rollback-20261027010000_gestlok_munro_motos_nombres.sql.txt

drop policy if exists gestlok_munro_motos_gerente_read on public.docs;
create policy gestlok_munro_motos_gerente_read
on public.docs
as restrictive
for select
to authenticated
using (
  case when col = 'munro/agencia_motos' and public.mi_rol() not in ('creadora', 'dueno') then
    id = 'motos' or public.gestlok_motos_semana_abierta(id)
  else true end
);

drop policy if exists gestlok_munro_motos_write_insert on public.docs;
create policy gestlok_munro_motos_write_insert
on public.docs
as restrictive
for insert
to authenticated
with check (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
    or (id = 'motos' and jsonb_typeof(data->'valores') = 'object')
    or (
      (id ~ '^d-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]{1,24}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or id ~ '^m-[0-9]{4}-[0-9]{2}-[0-9]{2}-r[a-z0-9]{1,24}$')
      and data->>'semana' = substring(id from 3 for 10)
      and (public.mi_rol() in ('creadora', 'dueno') or public.gestlok_motos_semana_abierta(id))
    )
  else true end
);

drop policy if exists gestlok_munro_motos_write_update on public.docs;
create policy gestlok_munro_motos_write_update
on public.docs
as restrictive
for update
to authenticated
using (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
    or id = 'motos'
    or (id not in ('tarifas', 'motos') and (public.mi_rol() in ('creadora', 'dueno') or public.gestlok_motos_semana_abierta(id)))
  else true end
)
with check (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
    or (id = 'motos' and jsonb_typeof(data->'valores') = 'object')
    or (
      (id ~ '^d-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]{1,24}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or id ~ '^m-[0-9]{4}-[0-9]{2}-[0-9]{2}-r[a-z0-9]{1,24}$')
      and data->>'semana' = substring(id from 3 for 10)
      and (public.mi_rol() in ('creadora', 'dueno') or public.gestlok_motos_semana_abierta(id))
    )
  else true end
);

drop policy if exists gestlok_munro_motos_write_delete on public.docs;
create policy gestlok_munro_motos_write_delete
on public.docs
as restrictive
for delete
to authenticated
using (
  case when col = 'munro/agencia_motos' then
    id not in ('tarifas', 'motos') and (public.mi_rol() in ('creadora', 'dueno') or public.gestlok_motos_semana_abierta(id))
  else true end
);
