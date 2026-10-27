-- Agencia Motos: exclusiva de Mi Gusto – Munro (colección munro/agencia_motos en public.docs).
-- - Dueños y creadora: planilla, valores por hora (doc «tarifas») e historial completo.
-- - Gerentes de Munro: leen y cargan solo la semana en curso (con gracia hasta el martes 00:00
--   para que lo cargado el domingo sin conexión se sincronice); no leen «tarifas» ni semanas cerradas.
-- - Ningún otro local, empresa o rol (lectura) puede leer ni escribir esta colección.
-- Solo agrega una función y políticas restrictivas: no modifica ni borra registros existentes.
-- Reversión: rollback-20261027000000_gestlok_munro_agencia_motos.sql.txt

create or replace function public.gestlok_motos_semana_abierta(p_id text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  with ahora as (select (now() at time zone 'America/Argentina/Buenos_Aires') as t),
  sem as (
    select date_trunc('week', t)::date as lunes, t::date as hoy from ahora
  )
  select coalesce(
    substring(p_id from '^[dm]-([0-9]{4}-[0-9]{2}-[0-9]{2})-') = any (
      array[
        to_char(sem.lunes, 'YYYY-MM-DD'),
        case when sem.hoy = sem.lunes then to_char(sem.lunes - 7, 'YYYY-MM-DD') end
      ]
    ), false)
  from sem
$$;
revoke all on function public.gestlok_motos_semana_abierta(text) from public, anon;
grant execute on function public.gestlok_motos_semana_abierta(text) to authenticated;

-- 1) Solo Mi Gusto, solo Munro, solo dueños, creadora o gerentes de Munro.
drop policy if exists gestlok_munro_motos_guard on public.docs;
create policy gestlok_munro_motos_guard
on public.docs
as restrictive
for all
to authenticated
using (
  case when col ~ '/agencia_motos$' then
    tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
    and col = 'munro/agencia_motos'
    and (public.mi_rol() in ('creadora', 'dueno')
         or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro')))
  else true end
)
with check (
  case when col ~ '/agencia_motos$' then
    tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
    and col = 'munro/agencia_motos'
    and (public.mi_rol() in ('creadora', 'dueno')
         or (public.mi_rol() = 'gerente' and public.puede_editar_local('munro')))
  else true end
);

-- 2) Gerentes: solo leen la semana abierta (sin valores por hora ni historial).
drop policy if exists gestlok_munro_motos_gerente_read on public.docs;
create policy gestlok_munro_motos_gerente_read
on public.docs
as restrictive
for select
to authenticated
using (
  case when col = 'munro/agencia_motos' and public.mi_rol() not in ('creadora', 'dueno') then
    public.gestlok_motos_semana_abierta(id)
  else true end
);

-- 3) Escrituras: formato de documento fijo; la semana del id coincide con la de los datos.
--    «tarifas» solo dueños y creadora; gerentes solo la semana abierta.
drop policy if exists gestlok_munro_motos_write_insert on public.docs;
create policy gestlok_munro_motos_write_insert
on public.docs
as restrictive
for insert
to authenticated
with check (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
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
    or (id <> 'tarifas' and (public.mi_rol() in ('creadora', 'dueno') or public.gestlok_motos_semana_abierta(id)))
  else true end
)
with check (
  case when col = 'munro/agencia_motos' then
    (id = 'tarifas' and public.mi_rol() in ('creadora', 'dueno'))
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
    id <> 'tarifas' and (public.mi_rol() in ('creadora', 'dueno') or public.gestlok_motos_semana_abierta(id))
  else true end
);
