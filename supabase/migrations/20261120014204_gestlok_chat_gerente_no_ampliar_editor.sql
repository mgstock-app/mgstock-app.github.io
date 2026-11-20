-- GESTLOK Chat: gerente configura su sucursal; editor conserva nivel gestionar.
CREATE OR REPLACE FUNCTION gestlok_chat_private.nivel(p_sucursal uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_t uuid; v_local text; v_rol text;
begin
  if auth.uid() is null or p_sucursal is null then return null; end if;
  select s.tenant_id, s.local_id into v_t, v_local
    from gestlok_chat_private.sucursales s
    join gestlok_chat_private.empresas e on e.tenant_id = s.tenant_id and e.habilitada
   where s.id = p_sucursal;
  if v_t is null or gestlok_tenancy.current_tenant_id() is distinct from v_t then return null; end if;
  v_rol := public.mi_rol();
  if v_rol = 'creadora' then perform gestlok_platform.require_admin(); return 'configurar'; end if;
  if v_rol = 'dueno' and public.puede_editar_local(v_local) then return 'configurar'; end if;
  if v_rol = 'gerente' and public.puede_editar_local(v_local) then return 'configurar'; end if;
  if v_rol = 'editor' and public.puede_editar_local(v_local) then return 'gestionar'; end if;
  if v_rol = 'lectura' and gestlok_platform.support_tenant() is not distinct from v_t then return 'ver'; end if;
  return null;
end $function$
;
