-- Test-only SQL fixture. Run inside BEGIN / ROLLBACK.
do $test$
<<flujo>>
declare s gestlok_chat_private.sucursales; p gestlok_chat_private.wai_pilotos;
 h uuid; ci uuid; u uuid; llave text:=repeat('a',64); rev uuid; jid text;
 token uuid; ref uuid; paso text; n int:=0; foto uuid; otra uuid; catalogo jsonb; pack jsonb; d jsonb; r jsonb; f jsonb; m gestlok_chat_private.wai_mensajes; o gestlok_chat_private.wai_pedidos; apertura timestamptz; bloqueado boolean; voto_id uuid;
begin
 if not exists(select 1 from gestlok_chat_private.wai_piloto_entorno where id and habilitado) then raise exception 'Solo entorno de ensayo';end if;
 select a.user_id into u from gestlok_platform.admins a join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.creada_por=a.user_id order by h.creada_at limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
 if (select count(*) from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato'))<>2 then raise exception 'Faltan sucursales';end if;
 for s in select * from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato') order by slug loop
  begin
   -- Tomorrow only, two turns. Today's clock cannot accidentally be open.
   update gestlok_chat_private.sucursales set dias_apertura=array[extract(isodow from (clock_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date+1)::smallint],turnos_chat='[{"inicio":"11:00","fin":"14:40"},{"inicio":"19:00","fin":"23:15"}]' where id=s.id returning * into s;
   apertura=(gestlok_chat_private.estado_atencion(s)->>'proxima_apertura')::timestamptz;
   if apertura<=clock_timestamp() then raise exception 'Próxima apertura incorrecta';end if;
   jid=case s.slug when 'mi-gusto-munro' then '5491100000091' else '5491100000092' end||'@s.whatsapp.net';
   insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
   values(s.tenant_id,s.local_id,case s.slug when 'mi-gusto-munro' then '+5491100000093' else '+5491100000094' end,u,u) returning id into h;
   insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash,estado,senal_at,wa_verificada_at,opciones_at,imagenes_at,salsas_at)
   values(h,encode(sha256(convert_to(llave,'UTF8')),'hex'),'conectado',now(),now(),now(),now(),now()) returning revision into rev;
   insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_por,vence_at)
   values(h,s.id,'+'||split_part(jid,'@',1),u,now()+interval '25 minutes') returning * into p;
   insert into gestlok_chat_private.wai_ciclos(hilo_id) values(p.id) returning id into ci;
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,ciclo_id) values(p.id,ci);
   r=public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,jid,'qa-menu','Carta');
   if not exists(select 1 from gestlok_chat_private.wai_programaciones where ciclo_id=ci and estado='ofrecido' and wai_programaciones.apertura=flujo.apertura) then raise exception 'No ofreció pedido programado: %',s.slug;end if;
   if exists(select 1 from gestlok_chat_private.wai_menu_accesos where piloto_id=p.id) then raise exception 'Envió menú sin consentimiento';end if;
   select id into voto_id from gestlok_chat_private.wai_mensajes where piloto_id=p.id and interaccion->'opciones' @> '[{"id":"programar_no"}]';
   if voto_id is null then raise exception 'Falta pregunta';end if;
   update gestlok_chat_private.wai_mensajes set estado='aceptado',wa_id='qa-programar-no' where id=voto_id;
   perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,jid,'qa-programar-no','programar_no');
   if not exists(select 1 from gestlok_chat_private.wai_programaciones where ciclo_id=ci and estado='rechazado') then raise exception 'No procesó rechazo';end if;
   perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,jid,'qa-nuevo','Hola');
   select id into voto_id from gestlok_chat_private.wai_mensajes where piloto_id=p.id and interaccion->'opciones' @> '[{"id":"programar_si"}]' order by creado_at desc limit 1;
   update gestlok_chat_private.wai_mensajes set estado='aceptado',wa_id='qa-programar-si' where id=voto_id;
   perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'voto',p.id,jid,'qa-programar-si','programar_si');
   if not exists(select 1 from gestlok_chat_private.wai_programaciones where ciclo_id=ci and estado='aceptado') then raise exception 'No procesó aceptación';end if;
   select id into token from gestlok_chat_private.wai_menu_accesos where piloto_id=p.id;
   if token is null then raise exception 'No emitió acceso: %', s.slug;end if;
   catalogo=public.gestlok_chat_wai_menu(token);
   if not coalesce((catalogo->>'ok')::boolean,false) or jsonb_array_length(catalogo->'productos')<20 or catalogo?'tester' then raise exception 'Carta incorrecta';end if;
   if coalesce((public.gestlok_chat_wai_menu(gen_random_uuid())->>'ok')::boolean,false) then raise exception 'Acceso ajeno';end if;
   select x into pack from jsonb_array_elements(catalogo->'productos') x where x->>'nombre'='Pack 6 empanadas + 2 salsas';
   if pack is null then raise exception 'Falta el pack';end if;
   d=jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('id',pack->>'id','grupos','{"empanadas":{"big_burger":6},"salsas":{"cheddar":2}}'::jsonb,'salsas_extra','{"crema_de_ajo":1}'::jsonb)),
      'total',(pack->>'precio')::numeric+(pack->>'salsa_precio')::numeric);
   r=public.gestlok_chat_wai_menu_preparar(token,jsonb_set(d,'{lineas,0,grupos,empanadas,big_burger}','5'));
   if (r->>'ok')::boolean then raise exception 'Aceptó 5 empanadas';end if;
   r=public.gestlok_chat_wai_menu_preparar(token,jsonb_set(d,'{total}','1'));
   if (r->>'ok')::boolean then raise exception 'Aceptó precio manipulado';end if;
   r=public.gestlok_chat_wai_menu_preparar(token,d);
   if not (r->>'ok')::boolean then raise exception 'No preparó pedido: %',r;end if;
   ref=(r->>'referencia')::uuid;
   if (public.gestlok_chat_wai_menu_preparar(token,d)->>'referencia')::uuid is distinct from ref then raise exception 'No es idempotente';end if;
   if exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id and pendiente) then raise exception 'Confirmó antes de WhatsApp';end if;
   r=public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,jid,'qa-seleccion','Mi selección WAI '||ref);
   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'estado' is distinct from 'nombre' or f?'nombre' or f?'modalidad' or f?'pago' or exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=p.id) then raise exception 'El menú no regresó al asistente: %',f;end if;
   foreach paso in array array['Cliente ficticio','Delivery','Calle Ejemplo 123 entre Calle A y Calle B','transferencia','Confirmar mi pedido'] loop
    n=n+1;perform public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,jid,'qa-datos:'||n,paso);
   end loop;
   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'estado' is distinct from 'pendiente' or (f->>'total')::numeric is distinct from (d->>'total')::numeric+s.envio_costo or f->>'demora' is distinct from s.demora_envio then raise exception 'Solicitud incompleta: %',f;end if;
   if f->'carrito'->0->'selecciones'->0->'valores'->0->>'id'<>'big_burger' or f->'carrito'->0->'selecciones'->1->'valores'->0->>'cantidad'<>'2' then raise exception 'Selecciones incorrectas';end if;
   if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=p.id) then raise exception 'Confirmó sin gerente';end if;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'transferencia',null,null,2,gen_random_uuid()) then raise exception 'Falla transferencia';end if;
   -- Only a new, authorized ordinary image is stored; a caption cannot
   -- trigger a payment or confirm the request.
   if public.gestlok_chat_wai_recibir_imagen(h,llave,rev,p.id,'5491100000000@s.whatsapp.net','qa-photo-unauth',null,'image/png','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG4YAAAAASUVORK5CYII=') is not null then raise exception 'Aceptó remitente ajeno';end if;
   r=public.gestlok_chat_wai_recibir_imagen(h,llave,rev,p.id,jid,'qa-photo','Confirmar mi pedido','image/png','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG4YAAAAASUVORK5CYII=');
   if r->>'adjunto_estado'<>'imagen' then raise exception 'No guardó foto: %',r;end if;
   perform public.gestlok_chat_wai_recibir_imagen(h,llave,rev,p.id,jid,'qa-photo',null,null,null);
   select id into foto from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='qa-photo';
   if (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and evento='qa-photo')<>1 then raise exception 'Duplicó foto';end if;
   if public.gestlok_chat_wai_adjunto_imagen(s.id,foto)->>'mime' is distinct from 'image/png' then raise exception 'No se puede ver foto';end if;
   select id into otra from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato') and id<>s.id limit 1;
   if public.gestlok_chat_wai_adjunto_imagen(otra,foto) is not null then raise exception 'Foto cruzada entre sucursales';end if;
   if not exists(select 1 from jsonb_array_elements(public.gestlok_chat_wai_bandeja(s.id)->'chats') x cross join lateral jsonb_array_elements(x->'mensajes') y where y->>'id'=foto::text and y->>'adjunto_estado'='imagen' and not (y?'base64') and y->>'leido'='false') then raise exception 'No aparece imagen no leída en bandeja';end if;
   r=public.gestlok_chat_wai_recibir_imagen(h,llave,rev,p.id,jid,'qa-photo-invalid',null,'image/png','dGVzdA==');
   if r->>'adjunto_estado'<>'no_disponible' then raise exception 'Aceptó formato inválido';end if;
   if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=p.id) or (select ficha->>'estado' from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id)<>'pendiente' then raise exception 'La imagen cambió el pedido';end if;
   if (f->>'programado_para')::timestamptz is distinct from apertura then raise exception 'Perdió programación';end if;
   if not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p.id and direccion='salida' and texto like '%Demora aproximada desde la apertura:%') then raise exception 'Falta demora programada';end if;
   bloqueado=false;
   begin
    perform public.gestlok_chat_wai_pedido(s.id,p.id,'aceptar',null,null,2,gen_random_uuid());
   exception when raise_exception then
    if sqlerrm not like 'Pedido programado:%' then raise;end if;
    bloqueado=true;
   end;
   if not bloqueado or exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=p.id) then raise exception 'Aceptó pedido antes de apertura';end if;
   -- Simulate opening by moving only synthetic fixture to past and enabling manual schedule.
   update gestlok_chat_private.sucursales set turnos_chat='[]'::jsonb where id=s.id;
   update gestlok_chat_private.wai_atencion_hilos set ficha=jsonb_set(ficha,'{programado_para}',to_jsonb(clock_timestamp()-interval '1 minute')) where hilo_id=p.id;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'aceptar',null,null,2,gen_random_uuid()) then raise exception 'Falla aceptación humana al abrir';end if;
   select * into o from gestlok_chat_private.wai_pedidos where hilo_id=p.id;
   if o.id is null or o.ficha->>'total' is distinct from f->>'total' then raise exception 'Pedido no conservado';end if;
   if (public.gestlok_chat_wai_menu(token)->>'ok')::boolean then raise exception 'Acceso reutilizable';end if;
   raise notice '% OK',s.slug;
  end;
 end loop;
end $test$;
