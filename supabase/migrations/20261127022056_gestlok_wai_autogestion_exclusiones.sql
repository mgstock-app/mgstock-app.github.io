-- Acceso a exclusiones en la configuración administrativa directa, sin ampliar el acceso de otros roles.
CREATE OR REPLACE FUNCTION public.gestlok_chat_panel_whatsapp_excluidos(p_sucursal uuid, p_accion text DEFAULT 'ver'::text, p_numero text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_t uuid; k text; n text; etiqueta text; v_id uuid; cambio boolean:=false;
begin
 if auth.uid() is null then raise exception 'Ingresá a GESTLOK' using errcode='42501'; end if;
 perform gestlok_chat_private.nivel_config(p_sucursal,'configurar');
 if not gestlok_chat_private.es_creadora_chat() and coalesce(public.mi_rol(),'') not in ('gerente','dueno','creadora') then
  raise exception 'No tenés permiso para administrar números excluidos' using errcode='42501';
 end if;
 if p_accion is null or p_accion not in ('ver','agregar','quitar') then
  raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion='ver' then
  select tenant_id into v_t from gestlok_chat_private.sucursales where id=p_sucursal;
 else
  -- Serializa altas/bajas de la misma sucursal, incluidos el máximo y duplicados.
  select tenant_id into v_t from gestlok_chat_private.sucursales where id=p_sucursal for update;
 end if;
 if v_t is null then raise exception 'Sucursal no disponible' using errcode='42501'; end if;
 if p_accion<>'ver' then
  k:=gestlok_chat_private.whatsapp_exclusion_key(p_numero);
  if k is null then raise exception 'Ingresá un número internacional válido, por ejemplo +54 9 11 0000 0000.' using errcode='22023'; end if;
  n:=regexp_replace(btrim(p_numero),'[[:space:]()-]','','g');
  if p_accion='agregar' then
   if n like '+54%' and n !~ '^\+54(9)?[0-9]{10}$' then
    raise exception 'Número argentino inválido. Usá +549 y 10 dígitos para celulares o +54 y 10 dígitos para líneas fijas.' using errcode='22023';
   end if;
   etiqueta:=btrim(coalesce(p_nombre,''));
   if length(etiqueta)>60 then raise exception 'El identificador debe tener hasta 60 caracteres' using errcode='22023'; end if;
   if not exists(select 1 from gestlok_chat_private.whatsapp_excluidos where tenant_id=v_t and sucursal_id=p_sucursal and clave=k) then
    if (select count(*) from gestlok_chat_private.whatsapp_excluidos where tenant_id=v_t and sucursal_id=p_sucursal)>=500 then
     raise exception 'El local alcanzó el máximo de 500 números excluidos' using errcode='22023'; end if;
    insert into gestlok_chat_private.whatsapp_excluidos(tenant_id,sucursal_id,numero,clave,nombre,creado_por)
      values(v_t,p_sucursal,n,k,etiqueta,auth.uid())
      returning id into v_id;
    cambio:=true;
    perform gestlok_chat_private.auditar(p_sucursal,'whatsapp_exclusion_agregar',jsonb_build_object('id',v_id));
   end if;
  elsif p_accion='quitar' then
   delete from gestlok_chat_private.whatsapp_excluidos where tenant_id=v_t and sucursal_id=p_sucursal and clave=k returning id into v_id;
   cambio:=v_id is not null;
   if cambio then perform gestlok_chat_private.auditar(p_sucursal,'whatsapp_exclusion_quitar',jsonb_build_object('id',v_id)); end if;
  end if;
 end if;
 return jsonb_build_object('cambio',cambio,'numeros',coalesce((
   select jsonb_agg(jsonb_build_object('numero',e.numero,'nombre',e.nombre) order by e.creado_at,e.numero)
   from gestlok_chat_private.whatsapp_excluidos e where e.tenant_id=v_t and e.sucursal_id=p_sucursal
 ),'[]'::jsonb));
end $function$;
revoke all on function public.gestlok_chat_panel_whatsapp_excluidos(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_whatsapp_excluidos(uuid,text,text,text) to authenticated;
