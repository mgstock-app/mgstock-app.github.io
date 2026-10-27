-- Seguridad multiempresa: «Ingreso de mercadería» no comprobaba la empresa del local.
--
-- public.importar_mercaderia es SECURITY DEFINER (no aplica RLS) y solo verificaba que
-- quien llama fuera dueño/creadora de SU empresa y que el local existiera en CUALQUIER
-- empresa. Con dos empresas reales, el dueño de una podía leer cantidades (respuesta
-- «conflicto») o sumar ingresos en la hoja «Local + Ingreso» de un local de otra empresa.
--
-- Cambio mínimo y no destructivo:
--   * la función original se conserva intacta con otro nombre y sin permisos para clientes;
--   * la función pública pasa a ser un control previo que exige que el local pertenezca
--     a la empresa de la sesión (public.puede_editar_local, ya filtrado por empresa) y
--     que la clave de importación no sea de otra empresa;
--   * no modifica ni mueve documentos. Rollback: rollback-20261026210000_*.sql.txt
--
-- La cola sin conexión (public.gestlok_sync_apply) llama a public.importar_mercaderia
-- por nombre, así que también pasa por este control.

alter function public.importar_mercaderia(text,text,jsonb,jsonb,text,boolean)
  rename to importar_mercaderia_internal;
revoke all on function public.importar_mercaderia_internal(text,text,jsonb,jsonb,text,boolean)
  from public, anon, authenticated;

create function public.importar_mercaderia(
  p_local text, p_operacion text, p_items jsonb, p_archivo jsonb, p_clave text,
  p_forzar boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant uuid := gestlok_tenancy.current_tenant_id();
begin
  if (select auth.uid()) is null or v_tenant is null
     or coalesce(public.mi_rol(), '') not in ('creadora', 'dueno') then
    raise exception 'MGS:sin_permiso' using errcode = '42501';
  end if;
  -- puede_editar_local exige que el local sea de la empresa de esta sesión.
  if p_local is null or not public.puede_editar_local(p_local) then
    raise exception 'MGS:sucursal' using errcode = '42501';
  end if;
  if exists (select 1 from public.docs
             where col = 'importaciones' and id = p_clave
               and tenant_id is distinct from v_tenant) then
    raise exception 'MGS:clave' using errcode = '42501';
  end if;
  return public.importar_mercaderia_internal(p_local, p_operacion, p_items, p_archivo, p_clave, p_forzar);
end
$$;

revoke all on function public.importar_mercaderia(text,text,jsonb,jsonb,text,boolean) from public, anon;
grant execute on function public.importar_mercaderia(text,text,jsonb,jsonb,text,boolean)
  to authenticated, service_role;

notify pgrst, 'reload schema';
