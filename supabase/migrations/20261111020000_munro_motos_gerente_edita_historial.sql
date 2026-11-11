-- Mi Gusto Munro · Motos Agencia: el gerente autorizado puede corregir semanas cerradas.
-- Conserva el bloqueo de tarifas e importes, el aislamiento por empresa/local y los nombres.
-- No actualiza ni borra datos; solo modifica las reglas restrictivas de escritura.
-- Reversion: rollback-20261111020000_munro_motos_gerente_edita_historial.sql.txt
--
-- La policy gestlok_munro_motos_guard (FOR ALL, AS RESTRICTIVE) sigue exigiendo
-- el tenant Mi Gusto y que el gerente pueda editar especificamente el local Munro.
-- Para los horarios el gerente puede escribir semanas pasadas y la actual, nunca futuras.

alter policy gestlok_munro_motos_write_insert on public.docs
  with check (case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora','dueno'))
    or (id = 'motos' and jsonb_typeof(data->'valores') = 'object')
    or (
      (id ~ '^d-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]{1,24}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or id ~ '^m-[0-9]{4}-[0-9]{2}-[0-9]{2}-r[a-z0-9]{1,24}$')
      and data->>'semana' = substring(id from 3 for 10)
      and (
        public.mi_rol() in ('creadora','dueno')
        or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro')
          and substring(id from 3 for 10) <= to_char(date_trunc('week',now() at time zone 'America/Argentina/Buenos_Aires'),'YYYY-MM-DD'))
      )
    )
  else true end);

alter policy gestlok_munro_motos_write_update on public.docs
  using (case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora','dueno'))
    or id = 'motos'
    or (
      id not in ('tarifas','motos')
      and (
        public.mi_rol() in ('creadora','dueno')
        or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro')
          and substring(id from 3 for 10) <= to_char(date_trunc('week',now() at time zone 'America/Argentina/Buenos_Aires'),'YYYY-MM-DD'))
      )
    )
  else true end)
  with check (case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora','dueno'))
    or (id = 'motos' and jsonb_typeof(data->'valores') = 'object')
    or (
      (id ~ '^d-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]{1,24}-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or id ~ '^m-[0-9]{4}-[0-9]{2}-[0-9]{2}-r[a-z0-9]{1,24}$')
      and data->>'semana' = substring(id from 3 for 10)
      and (
        public.mi_rol() in ('creadora','dueno')
        or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro')
          and substring(id from 3 for 10) <= to_char(date_trunc('week',now() at time zone 'America/Argentina/Buenos_Aires'),'YYYY-MM-DD'))
      )
    )
  else true end);

alter policy gestlok_munro_motos_write_delete on public.docs
  using (case when col = 'munro/agencia_motos' then
    id not in ('tarifas','motos')
    and (
      public.mi_rol() in ('creadora','dueno')
      or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro')
        and substring(id from 3 for 10) <= to_char(date_trunc('week',now() at time zone 'America/Argentina/Buenos_Aires'),'YYYY-MM-DD'))
    )
  else true end);
