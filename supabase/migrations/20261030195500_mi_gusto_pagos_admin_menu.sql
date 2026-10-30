-- Mi Gusto: Pagos Online también disponible para administradora general verificada.
-- Dueños y gerentes conservan sus permisos; soporte en otras empresas NO obtiene escritura.
-- Sin modificaciones a turnos, fotos, pagos ni datos existentes.
create or replace function gestlok_mg_online_private.authorized(p_local text)
returns boolean
language plpgsql stable security definer set search_path=''
as $$
declare v_role text;
begin
 if auth.uid() is null or p_local not in ('munro','torcuato')
    or gestlok_tenancy.current_tenant_id() is distinct from 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
    or not public.puede_editar_local(p_local) then
  return false;
 end if;
 v_role:=public.mi_rol();
 if v_role in ('dueno','gerente') then
  return true;
 end if;
 if v_role='creadora' then
  perform gestlok_platform.require_admin();
  return true;
 end if;
 return false;
end $$;
