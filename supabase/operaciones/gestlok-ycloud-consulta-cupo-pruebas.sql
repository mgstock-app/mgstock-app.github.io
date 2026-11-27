-- SOLO gestlok-pruebas. Nunca instalar esta operación en la base comercial.
do $guard$
begin
 if not exists(select 1 from information_schema.schemata where schema_name='entorno_control') or
    not exists(select 1 from information_schema.columns where table_schema='gestlok_chat_private' and table_name='pedidos' and column_name='es_prueba' and column_default='true') then
   raise exception 'Solo se permite instalar en Pruebas';
 end if;
end $guard$;
-- Solo el servidor verificado ejecuta la reserva y el aviso en una misma
-- transacción. La sucursal y el remitente comercial vienen de la ruta
-- autenticada, jamás de texto del cliente. No hay credenciales/pagos.
create or replace function public.gestlok_ycloud_pilot_reserve_quota_y_avisar(
 p_sucursal uuid,p_sender_key text,p_message_key text,p_units integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r jsonb; w gestlok_ycloud_pilot_private.quota_windows; v_t uuid; v_rest integer;
 v_alerta gestlok_chat_private.whatsapp_cupo_ensayo;
begin
 select tenant_id into v_t from gestlok_chat_private.sucursales where id=p_sucursal;
 if v_t is null then raise exception 'Sucursal inválida' using errcode='22023'; end if;
 if p_sender_key is null or p_sender_key !~ '^[0-9a-f]{64}$'
  or p_message_key is null or p_message_key !~ '^[0-9a-f]{64}$'
  or p_units is null or p_units not between 1 and 10 then
  return '{"reserved":false,"sendAllowed":false,"simulated":true,"reason":"invalid_request"}'::jsonb;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('gestlok-yc-quota:'||p_sender_key,0));
 select * into v_alerta from gestlok_chat_private.whatsapp_cupo_ensayo
  where sucursal_id=p_sucursal and periodo_inicio<=clock_timestamp() and periodo_fin>clock_timestamp()
  order by periodo_inicio desc limit 1;
 if v_alerta.id is not null and v_alerta.sender_key<>p_sender_key then raise exception 'Identidad de cupo no coincide'; end if;
 if v_alerta.id is not null and v_alerta.pausado then
  return jsonb_build_object('reserved',false,'sendAllowed',false,'simulated',true,'reason','limit_reached',
   'remaining',v_alerta.restantes,'aviso','consulta','consulta_id',v_alerta.id,'pausado',true);
 end if;
 r:=public.gestlok_ycloud_pilot_reserve_quota(p_sender_key,p_message_key,p_units);
 if r->>'simulated' is distinct from 'true' or r->>'sendAllowed' is distinct from 'false' then
  raise exception 'Reserva no verificada';
 end if;
 -- Solo la evidencia sintética vigente y única (validada por la reserva
 -- original) puede producir un contador. Los errores nunca autorizan envío.
 if r->>'reason' not in ('simulated_reservation','limit_reached') then return r; end if;
 select * into strict w from gestlok_ycloud_pilot_private.quota_windows
  where sender_key=p_sender_key and period_start<=clock_timestamp() and period_end>clock_timestamp();
 v_rest:=(r->>'remaining')::integer;
 if v_rest is null or v_rest not between 0 and 900 then raise exception 'Saldo inválido'; end if;
 -- No reasignar mediciones a otra sucursal o a otro número durante el período.
 insert into gestlok_chat_private.whatsapp_cupo_ensayo(tenant_id,sucursal_id,sender_key,periodo_inicio,periodo_fin,restantes,pausado)
 values(v_t,p_sucursal,p_sender_key,w.period_start,w.period_end,v_rest,
  v_rest=0 or r->>'reason'='limit_reached')
 on conflict(sucursal_id,periodo_inicio) do update set
  restantes=least(gestlok_chat_private.whatsapp_cupo_ensayo.restantes,excluded.restantes),
  pausado=gestlok_chat_private.whatsapp_cupo_ensayo.pausado or excluded.pausado,
  actualizado_at=clock_timestamp()
 where gestlok_chat_private.whatsapp_cupo_ensayo.sender_key=excluded.sender_key
   and gestlok_chat_private.whatsapp_cupo_ensayo.periodo_fin=excluded.periodo_fin
 returning * into v_alerta;
 if v_alerta.id is null then raise exception 'Identidad de cupo no coincide'; end if;
 -- Ni siquiera una solicitud de continuar abre el transporte.
 return r||jsonb_build_object('aviso',case when v_alerta.pausado then 'consulta'
   when v_alerta.restantes<=100 then 'cerca_del_limite' else 'normal' end,
  'consulta_id',v_alerta.id,'pausado',v_alerta.pausado);
end $$;
revoke all on function public.gestlok_ycloud_pilot_reserve_quota_y_avisar(uuid,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.gestlok_ycloud_pilot_reserve_quota_y_avisar(uuid,text,text,integer) to service_role;
