-- Administration-only health summary: never expose QR, keys, chats or contact details.
create or replace function public.gestlok_chat_wai_estado_global()
returns jsonb language plpgsql security definer set search_path='' as $$
declare datos jsonb;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Sin permiso' using errcode='42501';end if;
 perform gestlok_platform.require_admin();
 datos=public.gestlok_chat_wai_conexiones(null,'listar',null);
 return coalesce((select jsonb_agg(jsonb_build_object('id',v->>'id','numero',v->>'numero','empresa',v->>'empresa','local',v->>'local','slug',s.slug,'habilitada',v->'habilitada','estado',v->>'estado','senal_at',v->>'senal_at','wa_verificada_at',v->>'wa_verificada_at') order by v->>'empresa',v->>'local',v->>'numero')
  from jsonb_array_elements(datos) v join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=(v->>'id')::uuid
  left join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id),'[]'::jsonb);
end$$;
revoke all on function public.gestlok_chat_wai_estado_global() from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_estado_global() to authenticated;
