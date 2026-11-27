-- Test-only SQL fixture. Run inside BEGIN / ROLLBACK.
do $test$
declare s gestlok_chat_private.sucursales; p gestlok_chat_private.wai_pilotos;
 h uuid; ci uuid; u uuid; llave text:=repeat('a',64); rev uuid; jid text;
 token uuid; ref uuid; catalogo jsonb; pack jsonb; d jsonb; r jsonb; f jsonb; m gestlok_chat_private.wai_mensajes; o gestlok_chat_private.wai_pedidos;
begin
 if not exists(select 1 from gestlok_chat_private.wai_piloto_entorno where id and habilitado) then raise exception 'Solo entorno de ensayo';end if;
 select a.user_id into u from gestlok_platform.admins a join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.creada_por=a.user_id order by h.creada_at limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
 if (select count(*) from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato'))<>2 then raise exception 'Faltan sucursales';end if;
 for s in select * from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato') order by slug loop
  begin
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
   select id into token from gestlok_chat_private.wai_menu_accesos where piloto_id=p.id;
   if token is null then raise exception 'No emitió acceso: %', s.slug;end if;
   catalogo=public.gestlok_chat_wai_menu(token);
   if not coalesce((catalogo->>'ok')::boolean,false) or jsonb_array_length(catalogo->'productos')<20 or catalogo?'tester' then raise exception 'Carta incorrecta';end if;
   if coalesce((public.gestlok_chat_wai_menu(gen_random_uuid())->>'ok')::boolean,false) then raise exception 'Acceso ajeno';end if;
   select x into pack from jsonb_array_elements(catalogo->'productos') x where x->>'nombre'='Pack 6 empanadas + 2 salsas';
   if pack is null then raise exception 'Falta el pack';end if;
   d=jsonb_build_object('lineas',jsonb_build_array(jsonb_build_object('id',pack->>'id','grupos','{"empanadas":{"big_burger":6},"salsas":{"cheddar":2}}'::jsonb,'salsas_extra','{"crema_de_ajo":1}'::jsonb)),
      'nombre','Cliente ficticio','direccion','Calle Ejemplo 123','entrecalles','Calle A y Calle B','modalidad','delivery','pago','transferencia','total',(pack->>'precio')::numeric+s.envio_costo+(pack->>'salsa_precio')::numeric);
   r=public.gestlok_chat_wai_menu_preparar(token,jsonb_set(d,'{lineas,0,grupos,empanadas,big_burger}','5'));
   if (r->>'ok')::boolean then raise exception 'Aceptó 5 empanadas';end if;
   r=public.gestlok_chat_wai_menu_preparar(token,jsonb_set(d,'{total}','1'));
   if (r->>'ok')::boolean then raise exception 'Aceptó precio manipulado';end if;
   r=public.gestlok_chat_wai_menu_preparar(token,d);
   if not (r->>'ok')::boolean then raise exception 'No preparó pedido: %',r;end if;
   ref=(r->>'referencia')::uuid;
   if (public.gestlok_chat_wai_menu_preparar(token,d)->>'referencia')::uuid is distinct from ref then raise exception 'No es idempotente';end if;
   if exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id and pendiente) then raise exception 'Confirmó antes de WhatsApp';end if;
   r=public.gestlok_chat_wai_piloto_motor(h,llave,rev,'recibir',p.id,jid,'qa-confirmar','Confirmo mi pedido WAI '||ref);
   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'estado' is distinct from 'pendiente' or (f->>'total')::numeric is distinct from (d->>'total')::numeric or f->>'demora' is distinct from s.demora_envio then raise exception 'Solicitud incompleta: %',f;end if;
   if f->'carrito'->0->'selecciones'->0->'valores'->0->>'id'<>'big_burger' or f->'carrito'->0->'selecciones'->1->'valores'->0->>'cantidad'<>'2' then raise exception 'Selecciones incorrectas';end if;
   if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=p.id) then raise exception 'Confirmó sin gerente';end if;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'transferencia',null,null,2,gen_random_uuid()) then raise exception 'Falla transferencia';end if;
   if not public.gestlok_chat_wai_pedido(s.id,p.id,'aceptar',null,null,2,gen_random_uuid()) then raise exception 'Falla aceptación humana';end if;
   select * into o from gestlok_chat_private.wai_pedidos where hilo_id=p.id;
   if o.id is null or o.ficha->>'total' is distinct from f->>'total' then raise exception 'Pedido no conservado';end if;
   if (public.gestlok_chat_wai_menu(token)->>'ok')::boolean then raise exception 'Acceso reutilizable';end if;
   raise notice '% OK',s.slug;
  end;
 end loop;
end $test$;
