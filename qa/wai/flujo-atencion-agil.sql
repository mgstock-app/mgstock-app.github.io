-- ONLY against the isolated Prueba/Testing database.
-- Every fixture (including the connection) is rolled back before returning.
do $test$
declare
 s gestlok_chat_private.sucursales%rowtype; p gestlok_chat_private.wai_pilotos%rowtype;
 m gestlok_chat_private.wai_mensajes%rowtype; o gestlok_chat_private.wai_pedidos%rowtype;
 h uuid; ci uuid; u uuid; f jsonb; paso text; e int:=0; phone text; tester_jid text; rev uuid; pack int; sa1 text; sa2 text; opc text; pollid uuid; llave text:=repeat('a',64);
begin
 if not exists(select 1 from gestlok_chat_private.wai_piloto_entorno where id and habilitado) then raise exception 'Solo entorno de ensayo';end if;
 select a.user_id into u from gestlok_platform.admins a join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.creada_por=a.user_id order by h.creada_at limit 1;
 if u is null then raise exception 'No hay administrador de ensayo';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
 if (select count(*) from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato'))<>2 then raise exception 'Faltan las dos sucursales';end if;
 for s in select * from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato') order by slug loop
  foreach pack in array array[6,12] loop
  begin
   phone=case s.slug when 'mi-gusto-munro' then '+5491100000091' else '+5491100000092' end;
   tester_jid=substring(phone from 2)||'@s.whatsapp.net';
   insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
   values(s.tenant_id,s.local_id,case s.slug when 'mi-gusto-munro' then '+5491100000093' else '+5491100000094' end,u,u) returning id into h;
   insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash,estado,senal_at,wa_verificada_at,opciones_at,imagenes_at,salsas_at)
   values(h,encode(sha256(convert_to(llave,'UTF8')),'hex'),'conectado',now(),now(),now(),now(),now()) returning revision into rev;
   insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_por,vence_at)
   values(h,s.id,phone,u,now()+interval '25 minutes') returning * into p;
   insert into gestlok_chat_private.wai_ciclos(hilo_id) values(p.id) returning id into ci;
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,ciclo_id,ultima_carta) values(p.id,ci,'carta_empanadas_promos');
   foreach paso in array array['Pack '||pack,pack||' Jamón y Queso'] loop
    e=e+1;
    insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid,ciclo_id)
    values(p.id,'entrada',paso,'recibido','qa:'||e,tester_jid,ci) returning * into m;
    if not gestlok_chat_private.wai_pedido_guiado(p,m) then raise exception 'Paso no reconocido: % / %',s.slug,paso;end if;
    update gestlok_chat_private.wai_mensajes set agente_procesado_at=now() where id=m.id;
   end loop;

   select * into m from gestlok_chat_private.wai_mensajes where piloto_id=p.id and interaccion->>'tipo'='salsas';
   pollid=m.id;
   if m.id is null or jsonb_array_length(m.interaccion->'opciones')<>12 or (m.interaccion->>'cantidad')::int<>(case pack when 6 then 2 else 3 end) then raise exception 'Encuesta de salsas incorrecta';end if;
   select x->>'id' into sa1 from jsonb_array_elements(m.interaccion->'opciones') x where x->>'sabor'='crema_de_ajo' and (x->>'cantidad')::int=2;
   select x->>'id' into sa2 from jsonb_array_elements(m.interaccion->'opciones') x where x->>'sabor'='cheddar' and (x->>'cantidad')::int=1;
   update gestlok_chat_private.wai_mensajes set estado='aceptado',wa_id='qa-salsas',wa_ruta=tester_jid where id=pollid;
   if not coalesce((public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,tester_jid,'qa-salsas',sa2)->>'ok')::boolean,false) then raise exception 'Voto parcial rechazado';end if;
   if (select ficha->>'estado' from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id)<>'grupo' or exists(select 1 from gestlok_chat_private.wai_mensajes where id=pollid and opcion_elegida is not null) then raise exception 'Voto parcial adelantó carrito';end if;
   opc=case pack when 6 then sa1 else sa1||','||sa2 end;
   if not coalesce((public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,tester_jid,'qa-salsas',opc)->>'ok')::boolean,false) then raise exception 'Voto completo no admitido';end if;
   perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,tester_jid,'qa-salsas',opc);
   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'estado'<>'extras' or not exists(select 1 from jsonb_array_elements(f->'selecciones'->1->'valores') x where x->>'id'='crema_de_ajo' and x->>'cantidad'='2') then raise exception 'Salsas repetidas no registradas: %',f;end if;
   if pack=12 and not exists(select 1 from jsonb_array_elements(f->'selecciones'->1->'valores') x where x->>'id'='cheddar' and x->>'cantidad'='1') then raise exception 'Mezcla de salsas no registrada';end if;
   if (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='agente-voto:'||pollid||':salsas')<>1 then raise exception 'Voto duplicado';end if;
   foreach paso in array array['No gracias','Cliente ficticio','Delivery','Calle Ejemplo 123 entre Calle A y Calle B','transferencia','Confirmar mi pedido'] loop
    e=e+1;
    insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid,ciclo_id)
    values(p.id,'entrada',paso,'recibido','qa:'||e,tester_jid,ci) returning * into m;
    if not gestlok_chat_private.wai_pedido_guiado(p,m) then raise exception 'Paso no reconocido: % / %',s.slug,paso;end if;
    update gestlok_chat_private.wai_mensajes set agente_procesado_at=now() where id=m.id;
   end loop;

   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'nombre'<>'Cliente ficticio' or f->>'direccion'<>'Calle Ejemplo 123' or f->>'entrecalles'<>'Calle A y Calle B' or f->>'estado'<>'pendiente' then raise exception 'Datos entrega incorrectos: %',f;end if;
   if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=p.id) then raise exception 'El bot confirmó sin gerente';end if;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'transferencia',null,null,2,gen_random_uuid()) then raise exception 'Falló datos de transferencia';end if;
   if not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento like 'transferencia:%' and strpos(texto,s.datos_transferencia)>0) then raise exception 'Datos incorrectos';end if;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'aceptar',null,null,2,gen_random_uuid()) then raise exception 'No se aceptó';end if;
   select * into o from gestlok_chat_private.wai_pedidos where hilo_id=p.id;
   select * into m from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='pedido:'||o.id||':preparacion';
   if strpos(m.texto,s.demora_envio)=0 then raise exception 'Demora ausente en confirmación';end if;
   update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
   if not coalesce((public.gestlok_chat_wai_piloto_motor(h,llave,rev,'resultado',p.id,tester_jid,'qa-preparacion',null,m.id,'aceptado')->>'ok')::boolean,false) then raise exception 'Resultado no recibido';end if;
   select * into m from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='pedido:'||o.id||':resena';
   if m.id is null or m.interaccion->>'tipo'<>'resena' then raise exception 'Falta reseña al aceptar';end if;
   update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=clock_timestamp() where id=m.id;
   if not coalesce((public.gestlok_chat_wai_piloto_motor(h,llave,rev,'resultado',p.id,tester_jid,'qa-resena',null,m.id,'aceptado')->>'ok')::boolean,false) then raise exception 'Reseña no confirmada';end if;
   if not exists(select 1 from gestlok_chat_private.wai_ciclos where id=ci and cerrado_at is not null and motivo='resena') or not exists(select 1 from gestlok_chat_private.wai_pedidos where id=o.id and atencion_finalizada_at is not null and estado='preparacion') then raise exception 'No cerró tras invitación (sin fingir entrega)';end if;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'transferencia',null,null,2,gen_random_uuid()) then raise exception 'Transferencia posterior al cierre no disponible';end if;
   if not coalesce((public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,tester_jid,'qa-resena','resena_si')->>'ok')::boolean,false) then raise exception 'Voto reseña rechazado';end if;
   if not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='pedido:'||o.id||':resena:link' and strpos(texto,s.mensajes->>'resena_url')>0) then raise exception 'Link incorrecto';end if;
   perform public.gestlok_chat_wai_pedido(s.id,p.id,'listo',o.id,null,2,gen_random_uuid());
   perform gestlok_chat_private.wai_pedido_tick(p);
   if exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento like 'pedido:%:consulta' and cancelada_at is null) then raise exception 'Encuesta no solicitada';end if;
   select * into o from gestlok_chat_private.wai_pedidos where id=o.id;
   perform gestlok_chat_private.wai_resena_invitar(p,o);
   if (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='pedido:'||o.id||':resena')<>1 then raise exception 'Reseña duplicada';end if;
   -- Return within four hours: the three shortcuts; complaint only on request.
   perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,tester_jid,'qa-regreso','Hola');
   select * into m from gestlok_chat_private.wai_mensajes where piloto_id=p.id and interaccion->>'pregunta'='¡Hola de nuevo! ¿En qué podemos ayudarte?' order by creado_at desc limit 1;
   if m.id is null or jsonb_array_length(m.interaccion->'opciones')<>3 then raise exception 'No reconoce el pedido reciente';end if;
   if not exists(select 1 from gestlok_chat_private.wai_ciclos where hilo_id=p.id and id<>ci and cerrado_at is null) then raise exception 'No reabrió atención';end if;
   -- Use the native option (not an automatic survey).
   update gestlok_chat_private.wai_mensajes set estado='aceptado',wa_id='qa-regreso-opciones',wa_ruta=tester_jid where id=m.id;
   if pack=6 then
    perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,tester_jid,'qa-regreso-opciones','pedido');
    if not exists(select 1 from gestlok_chat_private.wai_mensajes x join gestlok_chat_private.wai_atencion_hilos a on a.ciclo_id=x.ciclo_id where a.hilo_id=p.id and (x.interaccion->>'pregunta'='¿Qué te gustaría pedir?' or x.imagen_url is not null)) then raise exception 'No inició el nuevo pedido';end if;
    perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,tester_jid,'qa-reclamo-directo','Tuve un problema con mi pedido');
   else
    perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,tester_jid,'qa-regreso-opciones','reciente_problema');
   end if;
   if not exists(select 1 from gestlok_chat_private.wai_pedidos where id=o.id and valoracion='problema' and resuelto_at is null) or not exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id and pendiente and manual) then raise exception 'No destacó el reclamo';end if;
   if not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento like 'pedido:%:respuesta:problema:%') then raise exception 'No respondió al reclamo';end if;
   perform public.gestlok_chat_wai_pedido(s.id,p.id,'resolver',o.id,null,2,null);
   -- Close just the resolved attention and simulate a return after four hours.
   perform gestlok_chat_private.wai_cerrar_hilo(p.id,'manual');
   update gestlok_chat_private.wai_pedidos set creado_at=now()-interval '4 hours 1 minute' where id=o.id;
   perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,tester_jid,'qa-regreso-tarde','Hola');
   if not exists(select 1 from gestlok_chat_private.wai_mensajes x join gestlok_chat_private.wai_atencion_hilos a on a.ciclo_id=x.ciclo_id where a.hilo_id=p.id and x.interaccion->>'pregunta'='¡Hola! ¿En qué podemos ayudarte?') then raise exception 'No inició como nuevo chat luego de cuatro horas';end if;
   raise exception using errcode='ZX001',message='Rollback de fixture exitoso';
  exception when sqlstate 'ZX001' then raise notice '%: salsas, transferencia, demora, cierre y retorno OK (revertido)',s.slug;end;
  end loop;
 end loop;
end
$test$;
select 'Pack 6 y pack 12: pedido, transferencia, cierre, reclamo y retorno 4 h OK en ambas sucursales' as resultado;
