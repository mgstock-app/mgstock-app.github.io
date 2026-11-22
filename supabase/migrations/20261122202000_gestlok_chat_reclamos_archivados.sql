-- Reclamos vencidos: sin enviar respuestas al chat nuevo; historial por sucursal.
create or replace function public.gestlok_chat_panel_soporte(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $gc_claim_panel$
begin
  perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'conversacion_id',r.conversacion_id,'tipo',r.tipo,
    'detalle',r.detalle,'creado_at',r.creado_at,'respondido_at',r.respondido_at,'estado',r.estado,
    'pedido',p.codigo,'evidencia_paths',r.evidencia_paths,
    'historial_expirado',c.reiniciada_at>r.creado_at,
    'ultimo',(case when r.ciclo=c.ciclo then (select m.texto from gestlok_chat_private.mensajes m
      where m.conversacion_id=r.conversacion_id
        and m.creado_at>=c.reiniciada_at order by m.id desc limit 1) else null end)
    order by case when r.estado='pendiente' then 0 else 1 end, r.actualizado_at desc)
    from (select * from gestlok_chat_private.reclamos
      where sucursal_id=p_sucursal
      order by case when estado='pendiente' then 0 else 1 end, actualizado_at desc limit 80) r
    left join gestlok_chat_private.pedidos p on p.id=r.pedido_id
    join gestlok_chat_private.conversaciones c on c.id=r.conversacion_id),'[]'::jsonb);
end $gc_claim_panel$;

create or replace function public.gestlok_chat_panel_responder(p_conversacion uuid,p_texto text,p_reclamo uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $gc_reply$
declare c gestlok_chat_private.conversaciones; v_texto text:=btrim(coalesce(p_texto,''));
begin
 select * into c from gestlok_chat_private.conversaciones where id=p_conversacion for update;
 if c.id is null then raise exception 'Conversación inexistente' using errcode='P0002'; end if;
 if c.cerrada_at is not null then raise exception 'La conversación ya está cerrada' using errcode='P0001'; end if;
 perform gestlok_chat_private.exigir(c.sucursal_id,'gestionar');
 if length(v_texto) not between 2 and 1000 then raise exception 'Escribí una respuesta entre 2 y 1000 caracteres' using errcode='22023'; end if;
 if c.mensajes>=400 then raise exception 'La conversación llegó a su límite' using errcode='P0001'; end if;
 if p_reclamo is not null and not exists(select 1 from gestlok_chat_private.reclamos r
   where r.id=p_reclamo and r.conversacion_id=c.id and r.sucursal_id=c.sucursal_id
   and r.estado='pendiente' and r.ciclo=c.ciclo) then
   raise exception 'Este reclamo pertenece a una conversación anterior o ya fue cerrado' using errcode='P0001';
 end if;
 insert into gestlok_chat_private.mensajes(conversacion_id,rol,texto) values(c.id,'local',v_texto);
 update gestlok_chat_private.conversaciones set ultima_at=now(),mensajes=mensajes+1 where id=c.id;
 if p_reclamo is not null then
   update gestlok_chat_private.reclamos set estado='pendiente',
   respondido_at=now(),respondido_por=auth.uid(),actualizado_at=now()
   where id=p_reclamo and sucursal_id=c.sucursal_id and conversacion_id=c.id
   and ciclo=c.ciclo and estado='pendiente';
 end if;
 perform gestlok_chat_private.auditar(c.sucursal_id,'soporte_respuesta',
   jsonb_build_object('conversacion',c.id,'reclamo',p_reclamo,'respuesta_enviada',p_reclamo is not null));
 return jsonb_build_object('ok',true);
end $gc_reply$;

create or replace function public.gestlok_chat_panel_archivar_reclamo(p_reclamo uuid)
returns jsonb language plpgsql security definer set search_path='' as $gc_archivar$
declare r gestlok_chat_private.reclamos; c gestlok_chat_private.conversaciones;
begin
 select * into r from gestlok_chat_private.reclamos where id=p_reclamo for update;
 if r.id is null then raise exception 'Reclamo inexistente' using errcode='P0002'; end if;
 perform gestlok_chat_private.exigir(r.sucursal_id,'gestionar');
 select * into c from gestlok_chat_private.conversaciones where id=r.conversacion_id;
 if r.estado<>'pendiente' then raise exception 'Este reclamo ya está cerrado' using errcode='P0001'; end if;
 if c.ciclo<=r.ciclo then raise exception 'El reclamo sigue asociado al chat activo' using errcode='P0001'; end if;
 update gestlok_chat_private.reclamos set estado='respondido',actualizado_at=now()
 where id=r.id and sucursal_id=r.sucursal_id and estado='pendiente';
 perform gestlok_chat_private.auditar(r.sucursal_id,'soporte_archivo_expirado',
 jsonb_build_object('reclamo',r.id,'conversacion',r.conversacion_id));
 return jsonb_build_object('ok',true,'archivado',true);
end $gc_archivar$;
revoke all on function public.gestlok_chat_panel_archivar_reclamo(uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_panel_archivar_reclamo(uuid) to authenticated;
