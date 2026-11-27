-- BORRADOR para revisión/convertir en migración antes de desplegar.
-- Solo consulta del destino del webhook oficial firmado. No vincula, activa,
-- cobra, crea pedidos, guarda mensajes ni autoriza envíos. No usar como
-- autorización de salida: el cupo gratuito garantizado y el estado actual
-- del proveedor deben comprobarse antes de cada intento de envío.
begin;
create or replace function public.gestlok_chat_srv_wai_ruta_verificada(
 p_waba text,p_to text,p_from text
) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'habilitacion_id',h.id,'tenant_id',h.tenant_id,'sucursal_id',s.id,
  'local_id',h.local_id,'slug',s.slug,'telefono_id',c.telefono_id,
  'numero_proveedor',c.telefono_proveedor,'verificado_at',c.verificado_at,
  'send_allowed',false
 )
 from gestlok_chat_private.whatsapp_premium_habilitaciones h
 join gestlok_chat_private.whatsapp_premium_conexiones c on c.habilitacion_id=h.id
 join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id
 join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
 where p_waba ~ '^[0-9]{1,30}$' and c.waba_id=p_waba
  and p_to ~ '^\+[1-9][0-9]{7,14}$' and p_from ~ '^\+[1-9][0-9]{7,14}$'
  and h.numero_clave=regexp_replace(p_to,'^\+549([0-9]{10})$','+54\1')
  and h.numero_clave=regexp_replace(c.telefono_proveedor,'^\+549([0-9]{10})$','+54\1')
  and gestlok_chat_private.whatsapp_exclusion_key(p_from)<>gestlok_chat_private.whatsapp_exclusion_key(p_to)
  and c.telefono_id is not null and c.verificado_at is not null and c.evento_id is not null
  and h.habilitada and s.activa and e.habilitada
  and not exists (
   select 1 from gestlok_chat_private.whatsapp_premium_conexiones cx
   join gestlok_chat_private.whatsapp_premium_habilitaciones hx on hx.id=cx.habilitacion_id
   where cx.waba_id=c.waba_id and hx.tenant_id<>h.tenant_id
  )
  and not exists (
   select 1 from gestlok_chat_private.suscripciones b
   where b.tenant_id=h.tenant_id and (
    b.pausada_por_cobro or (b.requiere_cobro and b.estado<>'activa'
     and b.mora_desde is not null
     and b.mora_desde+make_interval(days=>coalesce(
      (select a.gracia_dias from gestlok_chat_private.cobro_ajustes a where a.id),3
     ))<now())
   )
  )
  and not exists (
   select 1 from gestlok_chat_private.whatsapp_excluidos x
   where x.tenant_id=h.tenant_id and x.sucursal_id=s.id
    and x.clave=gestlok_chat_private.whatsapp_exclusion_key(p_from)
  )
$$;
revoke all on function public.gestlok_chat_srv_wai_ruta_verificada(text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_srv_wai_ruta_verificada(text,text,text) to service_role;
commit;
