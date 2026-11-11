-- Agencia Motos / Mi Gusto Munro: corrección de semanas cerradas por gerentes del local.
-- Los permisos restrictivos de gestlok_munro_motos_guard y gestlok_tenant_fence
-- siguen limitando la escritura al tenant y al local Munro. No modifica registros.
-- Se puede revertir con rollback-20261111012919_munro_motos_editar_historial_gerentes.sql.txt.

alter policy gestlok_munro_motos_write_insert on public.docs
with check (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
    or (id = 'motos' and jsonb_typeof(data->'valores') = 'object')
    or (
      (id ~ '^d-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]{1,24}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or id ~ '^m-[0-9]{4}-[0-9]{2}-[0-9]{2}-r[a-z0-9]{1,24}$')
      and data->>'semana' = substring(id from 3 for 10)
      and (
        public.mi_rol() in ('creadora', 'dueno')
        or public.gestlok_motos_semana_abierta(id)
        or (id ~ '^d-' and public.mi_rol() = 'gerente' and public.puede_editar_local('munro'))
      )
    )
  else true end
);

alter policy gestlok_munro_motos_write_update on public.docs
using (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
    or id = 'motos'
    or (
      id not in ('tarifas', 'motos')
      and (
        public.mi_rol() in ('creadora', 'dueno')
        or public.gestlok_motos_semana_abierta(id)
        or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro'))
      )
    )
  else true end
)
with check (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
    or (id = 'motos' and jsonb_typeof(data->'valores') = 'object')
    or (
      (id ~ '^d-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]{1,24}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or id ~ '^m-[0-9]{4}-[0-9]{2}-r[a-z0-9]{1,24}$')
      and data->>'semana' = substring(id from 3 for 10)
      and (
        public.mi_rol() in ('creadora', 'dueno')
        or public.gestlok_motos_semana_abierta(id)
        or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro'))
      )
    )
  else true end
);
