-- Finalizar y archivar el pedido de un proveedor en UNA transacción.
-- No modifica productos, stock operativo, conteos, historial anterior ni otras empresas.
create or replace function public.gestlok_proveedor_guardar_historial(
  p_local text,
  p_proveedor_id text,
  p_version bigint,
  p_items jsonb,
  p_catalogo jsonb,
  p_productos jsonb
)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare
  v_tenant uuid := gestlok_tenancy.current_tenant_id();
  v_ficha public.docs%rowtype;
  v_stamp bigint;
  v_hist_id text := 'pedido-' || replace(gen_random_uuid()::text,'-','');
  v_nombre text;
  v_now bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_user text := coalesce((select auth.jwt())->>'email',(select auth.uid())::text);
begin
  if (select auth.uid()) is null or v_tenant is null
     or p_local !~ '^[a-zA-Z0-9_-]{1,80}$'
     or not public.puede_editar_local(p_local) then
    raise exception 'No tenés permiso para guardar pedidos en este local.' using errcode='42501';
  end if;
  if p_proveedor_id is null or length(p_proveedor_id)>220
     or p_proveedor_id not like 'p-%'
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_typeof(p_catalogo) is distinct from 'object'
     or jsonb_typeof(p_productos) is distinct from 'array'
     or jsonb_array_length(p_productos) < 1 or jsonb_array_length(p_productos)>1500
     or length(p_items::text)>200000 or length(p_catalogo::text)>200000
     or length(p_productos::text)>250000 then
    raise exception 'La lista del proveedor es inválida o demasiado extensa.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_productos) x
    where jsonb_typeof(x.value) is distinct from 'object'
       or length(coalesce(x.value->>'nombre','')) not between 1 and 140
       or (x.value->>'pedir') !~ '^[0-9]+(\.[0-9]{1,2})?$'
       or (x.value->>'pedir')::numeric <= 0
       or (x.value->>'pedir')::numeric > 1000000) then
    raise exception 'Revisá los productos y cantidades de Pedir.';
  end if;
  select * into v_ficha from public.docs
   where col=p_local||'/proveedores' and id=p_proveedor_id and tenant_id=v_tenant
   for update;
  if not found then
    -- Un proveedor que ya figura en los productos puede no tener ficha manual:
    -- crear su carpeta automáticamente, dentro de la misma transacción y tenant.
    v_nombre := trim(coalesce(p_productos->0->>'proveedor',''));
    if coalesce(p_version,0) <> 0 or length(v_nombre) not between 2 and 90 then
      raise exception 'No se encontró la carpeta del proveedor.';
    end if;
    insert into public.docs(col,id,data,tenant_id,updated_by)
    values(p_local||'/proveedores',p_proveedor_id,
      jsonb_build_object('nombre',v_nombre,'contacto','','telefono','','entrega','','nota','',
        'items','[]'::jsonb,'catalogo','{}'::jsonb,'pedidoActualizado',0),
      v_tenant,v_user)
    on conflict (col,id) do nothing;
    select * into v_ficha from public.docs
      where col=p_local||'/proveedores' and id=p_proveedor_id and tenant_id=v_tenant
      for update;
    if not found then raise exception 'No se encontró la carpeta del proveedor.'; end if;
  end if;
  if coalesce((v_ficha.data->>'pedidoActualizado')::bigint,0) <> coalesce(p_version,0) then
    raise exception 'Otro usuario actualizó el pedido. Recargá antes de guardarlo.';
  end if;
  v_stamp := greatest(v_now, coalesce(p_version,0)+1);
  update public.docs
     set data = v_ficha.data || jsonb_build_object('items',p_items,'catalogo',p_catalogo,
       'pedidoActualizado',v_stamp,'pedidoPor',v_user),
         updated_at=now(),updated_by=v_user
   where col=p_local||'/proveedores' and id=p_proveedor_id and tenant_id=v_tenant;
  insert into public.docs(col,id,data,tenant_id,updated_by)
    values(p_local||'/proveedores_historial',v_hist_id,
      jsonb_build_object('proveedorId',p_proveedor_id,
        'proveedor',coalesce(v_ficha.data->>'nombre','Proveedor'),
        'productos',p_productos,
        'fecha',v_stamp,'autor',v_user,
        'version',v_stamp,'local',p_local),
      v_tenant,v_user);
  return jsonb_build_object('pedidoActualizado',v_stamp,'historialId',v_hist_id);
end
$function$;
revoke all on function public.gestlok_proveedor_guardar_historial(text,text,bigint,jsonb,jsonb,jsonb)
 from public,anon;
grant execute on function public.gestlok_proveedor_guardar_historial(text,text,bigint,jsonb,jsonb,jsonb)
 to authenticated;
