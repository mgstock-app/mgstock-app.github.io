-- ONLY against the isolated Prueba/Testing database.
-- Every fixture (including the connection) is rolled back before returning.
do $test$
declare
 s gestlok_chat_private.sucursales%rowtype; p gestlok_chat_private.wai_pilotos%rowtype;
 m gestlok_chat_private.wai_mensajes%rowtype; o gestlok_chat_private.wai_pedidos%rowtype;
 h uuid; ci uuid; u uuid; f jsonb; paso text; e int:=0; phone text; tester_jid text;
begin
 if not exists(select 1 from gestlok_chat_private.wai_piloto_entorno where id and habilitado) then raise exception 'Solo entorno de ensayo';end if;
 select a.user_id into u from gestlok_platform.admins a join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.creada_por=a.user_id order by h.creada_at limit 1;
 if u is null then raise exception 'No hay administrador de ensayo';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
 if (select count(*) from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato'))<>2 then raise exception 'Faltan las dos sucursales';end if;
 for s in select * from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato') order by slug loop
  begin
   phone=case s.slug when 'mi-gusto-munro' then '+5491100000091' else '+5491100000092' end;
   tester_jid=substring(phone from 2)||'@s.whatsapp.net';
   insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
   values(s.tenant_id,s.local_id,case s.slug when 'mi-gusto-munro' then '+5491100000093' else '+5491100000094' end,u,u) returning id into h;
   insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash,estado,senal_at,wa_verificada_at,opciones_at,imagenes_at)
   values(h,repeat('0',64),'conectado',now(),now(),now(),now());
   insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_por,vence_at)
   values(h,s.id,phone,u,now()+interval '25 minutes') returning * into p;
   insert into gestlok_chat_private.wai_ciclos(hilo_id) values(p.id) returning id into ci;
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,ciclo_id,ultima_carta) values(p.id,ci,'carta_empanadas_promos');
   foreach paso in array array['Pack 6','6 Jamón y Queso','2 Cheddar','salsa adicional','Crema de ajo','Agregar otro producto','Promociones de empanadas','Pack 8','8 Carne Suave','2 Criolla','No gracias','Continuar con el pedido','Cliente ficticio','Delivery','Calle Ejemplo 123, Localidad','transferencia','Confirmar mi pedido'] loop
    e=e+1;
    insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid,ciclo_id)
    values(p.id,'entrada',paso,'recibido','qa:'||e,tester_jid,ci) returning * into m;
    if not gestlok_chat_private.wai_pedido_guiado(p,m) then raise exception 'Paso no reconocido: % / %',s.slug,paso;end if;
   end loop;
   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'estado'<>'pendiente' or (f->>'total')::numeric<>75900 or (f->>'subtotal')::numeric<>71900 or f->>'modalidad'<>'delivery' or jsonb_array_length(f->'carrito')<>2 or f->'carrito'->0->>'producto' not like 'Pack 6%' or f->'carrito'->1->>'producto' not like 'Pack 8%' then raise exception 'Cotización o estado incorrecto: % / %',s.slug,f;end if;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'aceptar',null,null,2,gen_random_uuid()) then raise exception 'No se aceptó';end if;
   select * into o from gestlok_chat_private.wai_pedidos where hilo_id=p.id;
   if o.estado<>'preparacion' then raise exception 'Preparación incorrecta';end if;
   begin
    perform public.gestlok_chat_wai_pedido(s.id,p.id,'aceptar',null,null,2,gen_random_uuid());
    raise exception using errcode='ZX002',message='Se aceptó dos veces';
   exception when raise_exception then null;end;
   perform public.gestlok_chat_wai_pedido(s.id,p.id,'listo',o.id,null,2,gen_random_uuid());
   perform public.gestlok_chat_wai_pedido(s.id,p.id,'entregado',o.id,null,2,gen_random_uuid());
   select * into o from gestlok_chat_private.wai_pedidos where id=o.id;
   if o.estado<>'entregado' then raise exception 'No entregado';end if;
   -- Simulate a transport acceptance, not physical WhatsApp delivery.
   update gestlok_chat_private.wai_mensajes set estado='aceptado',reservado_at=now()-interval '25 minutes',wa_id='qa-entregado',wa_ruta=tester_jid where piloto_id=p.id and evento='pedido:'||o.id||':entregado';
   if not gestlok_chat_private.wai_resena_invitar(p,o) then raise exception 'No se pudo encolar la reseña';end if;
   if not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='pedido:'||o.id||':resena') then raise exception 'Falta la invitación de reseña: %',s.slug;end if;
   update gestlok_chat_private.wai_pedidos set consulta_at=now()-interval '1 minute' where id=o.id;
   perform gestlok_chat_private.wai_pedido_tick(p);
   update gestlok_chat_private.wai_mensajes set estado='aceptado',wa_id='qa-encuesta',wa_ruta=tester_jid where piloto_id=p.id and evento='pedido:'||o.id||':consulta';
   if not coalesce((gestlok_chat_private.wai_recibir_voto(p,tester_jid,'qa-encuesta','problema')->>'ok')::boolean,false) then raise exception 'Voto de reclamo no registrado';end if;
   perform gestlok_chat_private.wai_pedido_tick(p);
   if not exists(select 1 from gestlok_chat_private.wai_pedidos x join gestlok_chat_private.wai_atencion_hilos a on a.hilo_id=x.hilo_id where x.id=o.id and x.valoracion='problema' and a.pendiente and a.manual and x.respuesta_encolada_at is not null) then raise exception 'Reclamo no escalado';end if;
   perform public.gestlok_chat_wai_pedido(s.id,p.id,'resolver',o.id,null,2,gen_random_uuid());
   perform public.gestlok_chat_wai_atencion_accion(s.id,p.id,'finalizar',gen_random_uuid());
   if not exists(select 1 from gestlok_chat_private.wai_ciclos where id=ci and cerrado_at is not null and aviso_cierre='encolado') or not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='cierre:'||ci) then raise exception 'No se cerró el chat o no se encoló aviso';end if;
   raise exception using errcode='ZX001',message='Rollback de fixture exitoso';
  exception when sqlstate 'ZX001' then raise notice '%: pedido, total, postventa y cierre OK (revertido)',s.slug;end;
 end loop;
end
$test$;
select 'Carrito de dos promociones: flujo y postventa revertidos en ambas sucursales' as resultado;
