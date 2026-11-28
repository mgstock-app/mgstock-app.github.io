-- Indicadores de entrega (no son una medida del tiempo interno de WhatsApp).
-- Instalar primero en Prueba; mismo contrato para ambos entornos.
-- Solo administradora: no devolver teléfonos, texto, QR ni identificadores de clientes.
create or replace function public.gestlok_chat_wai_latencia_admin()
returns jsonb language plpgsql security definer set search_path='' as $$
declare datos jsonb;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Sin permiso' using errcode='42501';end if;
 perform gestlok_platform.require_admin();
 with muestras as (
  select p.habilitacion_id as id,m.estado,m.entregado_at,
   greatest(0,extract(epoch from coalesce(m.entregado_at,statement_timestamp())-m.creado_at)) as segundos
  from gestlok_chat_private.wai_mensajes m
  join gestlok_chat_private.wai_pilotos p on p.id=m.piloto_id
  join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=p.habilitacion_id and h.habilitada
  where m.direccion='salida' and m.origen='wai'
    and m.creado_at>=statement_timestamp()-interval '15 minutes'
    and m.estado in ('pendiente','reservado','aceptado','incierto')
 ), agregados as (
  select id,count(*) as total,
   count(*) filter(where entregado_at is not null and segundos<=5) as hasta5,
   count(*) filter(where entregado_at is not null and segundos>5 and segundos<=10) as hasta10,
   count(*) filter(where entregado_at is not null and segundos>10 and segundos<=20) as hasta20,
   count(*) filter(where segundos>20) as demora,
   count(*) filter(where entregado_at is null and segundos>20) as sin_confirmar,
   count(*) filter(where estado='incierto' and entregado_at is null) as inciertos,
   round(max(segundos) filter(where entregado_at is not null),1) as max_entrega
  from muestras group by id
 )
 select coalesce(jsonb_agg(to_jsonb(agregados) order by id),'[]'::jsonb) into datos from agregados;
 return datos;
end$$;
revoke all on function public.gestlok_chat_wai_latencia_admin() from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_latencia_admin() to authenticated;
