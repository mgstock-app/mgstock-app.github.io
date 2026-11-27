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
   foreach paso in array array['Pack 6','6 Jamón y Queso','2 Cheddar','Agregar otro producto','Promociones de empanadas','Pack 8','8 Carne Suave','2 Criolla','No gracias','Cliente ficticio','Delivery','Calle Ejemplo 123','Calle A y Calle B','transferencia','Modificar pedido','Quitar un producto','2','Continuar con el pedido'] loop
    e=e+1;
    insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid,ciclo_id)
    values(p.id,'entrada',paso,'recibido','qa:'||e,tester_jid,ci) returning * into m;
    if not gestlok_chat_private.wai_pedido_guiado(p,m) then raise exception 'Paso no reconocido: % / %',s.slug,paso;end if;
   end loop;

   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'estado'<>'cotizacion' or jsonb_array_length(f->'carrito')<>1 or (f->>'total')::numeric<>35500 then raise exception 'El producto quitado sigue en el total: %',s.slug;end if;
   if exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id and pedido_solicitado_at is not null) then raise exception 'Pedido prematuro';end if;
   -- A catalog change blocks confirmation, not a silent price substitution.
   update gestlok_chat_private.productos set disponible=false where id::text=f->'carrito'->0->>'producto_id';
   foreach paso in array array['Confirmar mi pedido'] loop
    e=e+1;
    insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid,ciclo_id)
    values(p.id,'entrada',paso,'recibido','qa:'||e,tester_jid,ci) returning * into m;
    if not gestlok_chat_private.wai_pedido_guiado(p,m) then raise exception 'Paso no reconocido: % / %',s.slug,paso;end if;
   end loop;

   select ficha into f from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id;
   if f->>'estado'<>'revision' or exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id and pedido_solicitado_at is not null) then raise exception 'Se confirmó un producto no disponible';end if;
   -- Start a fresh draft without a manager acceptance. Verify cancellation.
   update gestlok_chat_private.productos set disponible=true where id::text=f->'carrito'->0->>'producto_id';
   update gestlok_chat_private.wai_atencion_hilos set ficha=null,manual=false,pendiente=false,ultima_carta='carta_empanadas_promos' where hilo_id=p.id;
   foreach paso in array array['Pack 6','6 Jamón y Queso','2 Cheddar','No gracias','Cancelar pedido'] loop
    e=e+1;
    insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid,ciclo_id)
    values(p.id,'entrada',paso,'recibido','qa:'||e,tester_jid,ci) returning * into m;
    if not gestlok_chat_private.wai_pedido_guiado(p,m) then raise exception 'Paso no reconocido: % / %',s.slug,paso;end if;
   end loop;

   if exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=p.id and (ficha is not null or pedido_solicitado_at is not null or pendiente)) or exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=p.id) then raise exception 'Cancelación incompleta';end if;
   raise exception using errcode='ZX001',message='Rollback de fixture exitoso';
  exception when sqlstate 'ZX001' then raise notice '%: edición, cancelación y precios OK (revertido)',s.slug;end;
 end loop;
end
$test$;
select 'Edición, cancelación y disponibilidad verificadas en ambas sucursales' as resultado;
