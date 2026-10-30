-- La administración de GestLok puede operar Pagos Online solo en Mi Gusto
-- y cuando el control existente le habilita edición para esa sucursal.
create or replace function gestlok_mg_online_private.authorized(p_local text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(
   auth.uid() is not null
   and p_local in ('munro','torcuato')
   and gestlok_tenancy.current_tenant_id()='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
   and public.mi_rol() in ('dueno','gerente','creadora')
   and public.puede_editar_local(p_local),false)
$$;
