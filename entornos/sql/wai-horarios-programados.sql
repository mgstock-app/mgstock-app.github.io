-- WAI: closed-hours scheduling, shared with Gestlok Chat. Private per-cycle consent.
create table if not exists gestlok_chat_private.wai_programaciones (
 ciclo_id uuid primary key references gestlok_chat_private.wai_ciclos(id) on delete cascade,
 estado text not null check (estado in ('ofrecido','aceptado','rechazado')),
 apertura timestamptz not null,
 pregunta_evento text not null,
 entrada_id uuid not null references gestlok_chat_private.wai_mensajes(id) on delete cascade,
 actualizado_at timestamptz not null default clock_timestamp()
);
alter table gestlok_chat_private.wai_programaciones enable row level security;
revoke all on gestlok_chat_private.wai_programaciones from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_fecha_programada(t timestamptz)
returns text language sql stable set search_path='' as $$
 select to_char(t at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY "a las" HH24:MI')
$$;
create or replace function gestlok_chat_private.wai_programacion_actual(c uuid)
returns timestamptz language sql stable set search_path='' as $$
 select apertura from gestlok_chat_private.wai_programaciones where ciclo_id=c and estado='aceptado'
$$;
revoke all on function gestlok_chat_private.wai_fecha_programada(timestamptz),gestlok_chat_private.wai_programacion_actual(uuid) from public,anon,authenticated;

-- Ask once for a specific opening, before any new order or next draft step.
-- A choice is tied to the current cycle/poll, not merely to a phone number.
create or replace function gestlok_chat_private.wai_fuera_horario(p gestlok_chat_private.wai_pilotos,m gestlok_chat_private.wai_mensajes)
returns boolean language plpgsql set search_path='' as $$
declare a gestlok_chat_private.wai_atencion_hilos; s gestlok_chat_private.sucursales; z gestlok_chat_private.wai_programaciones; original gestlok_chat_private.wai_mensajes;
 v jsonb; apertura timestamptz; texto text; horario text; e text:='agente:'||m.id||':horario'; n text:=gestlok_chat_private.wai_normalizar(m.texto); voto text; si boolean; no boolean; f jsonb; existe boolean; actual text;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 if not found or a.ciclo_id is null or a.manual or a.ficha->>'estado' in ('pendiente','revision') then return false;end if;
 -- Do not intercept complaints or human support, including a recent order.
 if n ~ '\m(problema|reclamo|queja|gerente|humano|persona)\M' or m.evento like 'agente-voto:%:reciente_%' then return false;end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 v=gestlok_chat_private.estado_atencion(s);
 select * into z from gestlok_chat_private.wai_programaciones where ciclo_id=a.ciclo_id for update;
 existe=found;
 if m.evento like 'agente-voto:%:programar_%' then
  voto=split_part(m.evento,':',3);
  select evento into actual from gestlok_chat_private.wai_mensajes where id::text=split_part(m.evento,':',2) and piloto_id=p.id;
  if not existe or z.estado<>'ofrecido' or actual is distinct from z.pregunta_evento then return true;end if;
 end if;
 if existe and z.estado='ofrecido' then
  si=coalesce(voto='programar_si',false) or n in ('si','si quiero','si programar','programar','dejar pedido','si, programar pedido','si programar pedido');
  no=coalesce(voto='programar_no',false) or n in ('no','no gracias','ahora no','no por ahora');
  if no then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias por escribirnos! Te esperamos cuando abramos.') then raise exception 'No se pudo responder';end if;
   update gestlok_chat_private.wai_programaciones set estado='rechazado',actualizado_at=clock_timestamp() where ciclo_id=a.ciclo_id;
   update gestlok_chat_private.wai_atencion_hilos set ficha=null,modalidad=null,espera_modalidad=false,pedido_solicitado_at=null,pedido_texto=null,pendiente=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
   return true;
  end if;
 else si=false;end if;
 if coalesce((v->>'habilitado')::boolean,false) and not coalesce((v->>'abierto')::boolean,false) then
  apertura=(v->>'proxima_apertura')::timestamptz;
  if apertura is null then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'Ahora estamos cerrados. El comercio todavía no indicó su próxima apertura. Una persona revisará tu mensaje.') then raise exception 'No se pudo responder';end if;
   update gestlok_chat_private.wai_atencion_hilos set manual=true,pendiente=true where hilo_id=a.hilo_id;
   return true;
  end if;
  if existe and z.estado='aceptado' and z.apertura=apertura then return false;end if;
  if not si or z.apertura is distinct from apertura then
   select string_agg(case d when 1 then 'Lun' when 2 then 'Mar' when 3 then 'Mié' when 4 then 'Jue' when 5 then 'Vie' when 6 then 'Sáb' when 7 then 'Dom' end,', ' order by d) into horario from unnest(s.dias_apertura) d;
   select coalesce(horario||' · ','')||string_agg((x->>'inicio')||'–'||(x->>'fin'),', ' order by x->>'inicio') into horario from jsonb_array_elements(s.turnos_chat) x;
   texto='¡Hola! En este momento estamos cerrados. Horarios: '||coalesce(horario,s.horario,'a confirmar')||'. Volvemos a abrir '||(v->>'proximo_texto')||'.';
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':aviso',texto) or not gestlok_chat_private.wai_agente_poll(p,e,'¿Querés dejar un pedido programado?','[{"id":"programar_si","label":"Sí, programar pedido"},{"id":"programar_no","label":"No, gracias"}]'::jsonb) then raise exception 'No se pudo ofrecer programación';end if;
   insert into gestlok_chat_private.wai_programaciones(ciclo_id,estado,apertura,pregunta_evento,entrada_id) values(a.ciclo_id,'ofrecido',apertura,e,case when existe and z.estado='ofrecido' then z.entrada_id else m.id end)
   on conflict(ciclo_id) do update set estado='ofrecido',apertura=excluded.apertura,pregunta_evento=excluded.pregunta_evento,entrada_id=excluded.entrada_id,actualizado_at=clock_timestamp();
   -- Raw product recognition can create a pending flag before the assistant.
   -- Do not expose this as a manager-ready order until the customer opts in.
   if a.ficha is null then update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=null,pedido_texto=null,pendiente=false where hilo_id=a.hilo_id;end if;
   return true;
  end if;
 elsif not (existe and z.estado='ofrecido' and si) then return false;
 end if;
 -- A valid yes: if the shop opened while asking, continue as an ordinary order.
 if apertura is not null then
  update gestlok_chat_private.wai_programaciones set estado='aceptado',actualizado_at=clock_timestamp() where ciclo_id=a.ciclo_id;
 else
  delete from gestlok_chat_private.wai_programaciones where ciclo_id=a.ciclo_id and estado='ofrecido';
 end if;
 if not gestlok_chat_private.wai_pedido_encolar(p.id,e,case when apertura is null then '¡Ya abrimos! Podés hacer tu pedido.' else '¡Perfecto! Tu pedido quedará programado para el '||gestlok_chat_private.wai_fecha_programada(apertura)||'. El gerente lo confirmará cuando abra el local.' end) then raise exception 'No se pudo confirmar programación';end if;
 f=a.ficha;
 if f is not null and f->>'estado'='cotizacion' then
  f=(f-'programado_para')||case when apertura is not null then jsonb_build_object('programado_para',apertura) else '{}'::jsonb end;
  if not gestlok_chat_private.wai_carrito_mostrar(p,e||':cotizacion',f,true) then raise exception 'No se pudo mostrar el resumen';end if;
  update gestlok_chat_private.wai_atencion_hilos set ficha=f||jsonb_build_object('espera',e||':cotizacion'),actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
 else
  select * into original from gestlok_chat_private.wai_mensajes where id=z.entrada_id and piloto_id=p.id and ciclo_id=a.ciclo_id;
  if original.id is not null and gestlok_chat_private.wai_pedido_guiado(p,original) then return true;end if;
  if not gestlok_chat_private.wai_menu_invitar(p,e||':carta') then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':carta','Contame qué querés pedir. El comercio revisará tu solicitud.') then raise exception 'No se pudo continuar';end if;
  end if;
 end if;
 return true;
end$$;
revoke all on function gestlok_chat_private.wai_fuera_horario(gestlok_chat_private.wai_pilotos,gestlok_chat_private.wai_mensajes) from public,anon,authenticated;


CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_guiado(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h uuid:=gestlok_chat_private.wai_hilo(p); a gestlok_chat_private.wai_atencion_hilos%rowtype; s gestlok_chat_private.sucursales%rowtype;
 f jsonb; st text; voto text; de_evento text; e text:='agente:'||m.id; t text:=btrim(m.texto); n text:=gestlok_chat_private.wai_normalizar(m.texto);
 x record; g jsonb; v jsonb; partes jsonb; opts jsonb; q int; parcial int; k int; desde int; extra text; modo text; pago text; pagos text[]; demora text; envio numeric; sub numeric; monto numeric; ok boolean:=false; pregunta text; resumen text; ficha_nueva jsonb; salsa_precio numeric; pack_n text; salsa_n text; pagina text; idx int;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=h for update;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 f=a.ficha; st=f->>'estado';
 if f is not null and gestlok_chat_private.wai_programacion_actual(a.ciclo_id) is not null then f=f||jsonb_build_object('programado_para',gestlok_chat_private.wai_programacion_actual(a.ciclo_id));end if;
 if st='cancelado' then f=null;st=null;end if;
 if m.evento not like 'agente-voto:%' and lower(btrim(m.texto)) ~ '^(?:confirmo mi pedido|mi selección|mi seleccion) wai [a-f0-9-]{36}$' then
  return gestlok_chat_private.wai_menu_recibir(p,m);
 end if;
 if ((m.evento not like 'agente-voto:%' and n in ('carta','menu','carta interactiva','menu interactivo','hacer un pedido','quiero hacer un pedido','hacer otro pedido','pedido','pedir')) or m.evento like 'agente-voto:%:pedido' or m.evento like 'agente-voto:%:catalogo') and st is distinct from 'pendiente' and st is distinct from 'revision' then
  if gestlok_chat_private.wai_menu_invitar(p,e) then return true;end if;
 end if;
 if n='pedir por chat' then n='hacer un pedido';end if;

 if m.evento like 'agente-voto:%' then
  voto=split_part(m.evento,':',3);
  select evento into de_evento from gestlok_chat_private.wai_mensajes where id::text=split_part(m.evento,':',2) and piloto_id=p.id;
 end if;
 pack_n=substring(n from '^(?:quiero |quisiera |dame |pedir )?(?:el )?pack (?:de )?([0-9]+)(?: |$)');
 salsa_n=substring(n from ' ([0-9]+) salsas?(?: |$)');
 if st='pendiente' then
  if voto is not null then return true;end if;
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'Tu pedido está pendiente de confirmación del comercio. Si necesitás cambiar algo, el gerente revisará tu mensaje.');
 end if;
 if st='revision' then return false;end if;
 if st='confirmado' then
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=h and estado<>'entregado' and atencion_finalizada_at is null and creado_at>clock_timestamp()-interval '4 hours') then return false;end if;
  if voto='pedido' or pack_n is not null or n ~ '^(quiero |quisiera )?(hacer un pedido|pedir)$' then f=null;st=null;else return false;end if;
 end if;
 if f is null and pack_n is not null and a.ultima_carta is not null and exists(select 1 from gestlok_chat_private.wai_ofertas(s.id,a.ultima_carta)) then
  f=jsonb_build_object('estado','oferta','carta',a.ultima_carta,'desde',0,'extras','[]'::jsonb,'selecciones','[]'::jsonb);st='oferta';
 end if;
 if f is null then
  if a.ultima_carta is null or not (coalesce(voto,'')='pedido' or n ~ '^(quiero |quisiera )?(hacer un pedido|pedir)$') then return false;end if;
  if not exists(select 1 from gestlok_chat_private.wai_ofertas(s.id,a.ultima_carta)) then return false;end if;
  opts=gestlok_chat_private.wai_ficha_opciones(s.id,a.ultima_carta,null,0);
  ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué promoción o producto de la imagen te interesó?',opts);
  f=jsonb_build_object('estado','oferta','carta',a.ultima_carta,'desde',0,'extras','[]'::jsonb,'selecciones','[]'::jsonb);
 elsif voto is not null and de_evento is distinct from f->>'espera' then
  -- A vote from an older step cannot advance the new draft.
  return true;
 elsif voto='fc_cancelar' or (voto is null and n in ('cancelar','cancelar pedido','cancelar mi pedido')) then
  ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Cancelamos tu carrito. No se envió ningún pedido al comercio. Podés iniciar otro cuando quieras.');
  f=jsonb_build_object('estado','cancelado');
 elsif st='carrito_carta' then
  desde=coalesce((f->>'pagina_desde')::int,0);
  if voto='cc_volver' or n='volver al carrito' then
   f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
  elsif voto='cc_mas' then
   desde=desde+4;f=f||jsonb_build_object('pagina_desde',desde);
   ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí otra categoría',gestlok_chat_private.wai_carrito_paginas(s.id,desde));
  else
   select w.clave into pagina from gestlok_chat_private.wai_carta_paginas w where w.sucursal_id=s.id and (voto='cc_'||w.clave or (voto is null and gestlok_chat_private.wai_normalizar(w.titulo)=n)) and exists(select 1 from gestlok_chat_private.wai_ofertas(s.id,'carta_'||w.clave));
   if pagina is not null then
    f=f||jsonb_build_object('estado','oferta','carta','carta_'||pagina,'desde',0,'extras','[]'::jsonb,'selecciones','[]'::jsonb);
    ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí el próximo producto o promoción',gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',null,0));
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una categoría para agregar otro producto',gestlok_chat_private.wai_carrito_paginas(s.id,desde));end if;
  end if;
 elsif st='carrito_revision' then
  if (voto='fc_datos' or n in ('continuar','continuar con el pedido')) and jsonb_array_length(f->'carrito')>0 then
   if f->>'nombre' is not null and f->>'modalidad' is not null and f->>'pago' is not null and (f->>'modalidad'='retiro' or f->>'direccion' is not null and f->>'entrecalles' is not null) then
    f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('pago',f->>'pago');
    sub=gestlok_chat_private.wai_carrito_subtotal(f);
    envio=case when f->>'modalidad'='delivery' then s.envio_costo else 0 end;
    demora=case when f->>'modalidad'='delivery' then s.demora_envio else s.demora_retiro end;
    f=f||jsonb_build_object('estado','cotizacion','subtotal',sub,'envio',envio,'total',sub+envio,'demora',demora);
    if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or sub<s.pedido_minimo)) or (f->>'modalidad'='retiro' and not s.acepta_retiro) or coalesce(btrim(demora),'')='' or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio debe revisar las condiciones antes de confirmar el importe.');f=f||jsonb_build_object('estado','revision');
    else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f,true);end if;
   else
    f=f||jsonb_build_object('estado','nombre');ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! ¿A nombre de quién hacemos el pedido?');
   end if;
  elsif (voto='fc_agregar' or n='agregar otro producto') and jsonb_array_length(f->'carrito')<5 then
   f=f||jsonb_build_object('estado','carrito_carta','pagina_desde',0);
   opts=gestlok_chat_private.wai_carrito_paginas(s.id,0);
   if jsonb_array_length(opts)<2 then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'No hay categorías disponibles. Te atenderá una persona del comercio.');f=f||jsonb_build_object('estado','revision');
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué más querés agregar?',opts);end if;
  elsif (voto='fc_quitar' or n='quitar un producto') and jsonb_array_length(f->'carrito')>0 then
   select jsonb_agg(jsonb_build_object('id','cq_'||i,'label',left(i||'. '||(l->>'producto'),60)) order by i) into opts from jsonb_array_elements(f->'carrito') with ordinality as a(l,i);
   ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué producto querés quitar?',opts||'[{"id":"cq_volver","label":"Volver sin quitar"}]'::jsonb);
   f=f||jsonb_build_object('estado','carrito_quitar');
  else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);end if;
 elsif st='carrito_quitar' then
  if voto ~ '^cq_[1-5]$' then idx=substr(voto,4)::int-1;
  elsif voto is null and n ~ '^[1-5]$' then idx=n::int-1;end if;
  if idx is not null and idx<jsonb_array_length(f->'carrito') then f=jsonb_set(f,'{carrito}',(f->'carrito')-idx);end if;
  f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
 elsif st='cotizacion' then
  if voto='fc_confirmar' or (voto is null and n in ('confirmar','confirmar mi pedido','confirmo')) then
   if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo)) or (f->>'modalidad'='retiro' and not s.acepta_retiro) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Algunos precios, productos o condiciones cambiaron. El comercio revisará el pedido antes de confirmarte el importe.');f=f||jsonb_build_object('estado','revision');
   else
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Recibimos tu solicitud. '||case when f->>'programado_para' is not null then 'Pedido programado para el '||gestlok_chat_private.wai_fecha_programada((f->>'programado_para')::timestamptz)||'. Demora aproximada desde la apertura: '||coalesce(f->>'demora','a confirmar por el comercio')||'. El gerente lo confirmará cuando abra el local.' else 'Demora aproximada: '||coalesce(f->>'demora','a confirmar por el comercio')||'. Pronto el gerente confirmará el pedido y comenzará a prepararlo.' end);
    f=f||jsonb_build_object('estado','pendiente');
   end if;
  elsif voto='fc_editar' or (voto is null and n in ('modificar','modificar pedido')) then
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','carrito_revision','pago',f->>'pago');
   ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
  else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f,true);end if;
 elsif voto='f_humano' or (n ~ '\m(humano|gerente|persona)\M' and voto is null) then
  ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Te paso con una persona del comercio para ayudarte con tu pedido.');
  f=f||jsonb_build_object('estado','revision');
 elsif st in ('oferta','extra_producto') then
  extra=case when st='extra_producto' then f->>'extra_tipo' end;
  desde=coalesce((f->>'desde')::int,0);
  if voto='f_mas' then
   desde=desde+5;
   opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',extra,desde);
   ok=gestlok_chat_private.wai_agente_poll(p,e,'Más opciones',opts); f=f||jsonb_build_object('desde',desde);
  elsif voto='f_volver' and extra is not null then
   f=f||jsonb_build_object('grupo',jsonb_array_length(f->'grupos'));f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
  elsif voto='f_volver' and jsonb_array_length(coalesce(f->'carrito','[]'))>0 then
   f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
  elsif voto='f_volver' then
   opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',null,0);ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué promoción o producto de la imagen te interesó?',opts);f=f||jsonb_build_object('desde',0);
  else
   select * into x from gestlok_chat_private.wai_ofertas(s.id,f->>'carta',extra) o
    where (voto='of_'||replace(o.id::text,'-','') or (voto is null and (n=gestlok_chat_private.wai_normalizar(o.nombre) or pack_n=substring(o.nombre from '^Pack ([0-9]+)') and (n ~ '\m(lata|gaseosa|bebida)\M')=(o.nombre ~* 'lata') and (salsa_n is null or exists(select 1 from jsonb_array_elements(o.opciones) z where z->>'id'='salsas' and z->>'total'=salsa_n)))))
    order by o.orden,o.precio limit 1;
   if not found then
    opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',extra,desde);ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una opción disponible de la lista',opts);
   elsif extra is not null then
    if exists(select 1 from jsonb_array_elements(x.opciones) z where coalesce((z->>'obligatorio')::boolean,false)) or (x.reglas-'compartir')<>'{}'::jsonb then
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Este adicional necesita una configuración especial. El gerente te ayudará.');f=f||jsonb_build_object('estado','revision');
    else f=jsonb_set(f,'{extras}',f->'extras'||jsonb_build_array(jsonb_build_object('id',x.id,'nombre',x.nombre,'precio',x.precio))); f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;end if;
   elsif (x.reglas-'compartir')<>'{}'::jsonb then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El producto tiene condiciones especiales. El gerente te ayudará a completar tu pedido.');f=f||jsonb_build_object('estado','revision','producto',x.nombre);
   else
    select coalesce(jsonb_agg(z),'[]'::jsonb) into opts from jsonb_array_elements(x.opciones) z where coalesce((z->>'obligatorio')::boolean,false);
    f=f||jsonb_build_object('producto',x.nombre,'producto_id',x.id,'precio',x.precio,'grupos',opts,'grupo',0,'selecciones','[]'::jsonb);
    f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
   end if;
  end if;
 elsif st='grupo' then
  k=(f->>'grupo')::int;g=f->'grupos'->k;q=case when g->>'tipo'='cantidad' then (g->>'total')::int else 1 end;
  partes=null;
  if voto like 'g_%' then
   select z into v from jsonb_array_elements(g->'valores') z where z->>'id'=substr(voto,3);
   if v is not null then partes=jsonb_build_array(jsonb_build_object('id',v->>'id','nombre',v->>'nombre','cantidad',1,'extra',coalesce((v->>'extra')::numeric,0)));end if;
  elsif voto is null or (voto='salsas' and g->>'id'='salsas') then partes=gestlok_chat_private.wai_leer_cantidades(t,g->'valores',q);end if;
  if partes is null then
   ok=gestlok_chat_private.wai_menu_invitar(p,e,'Elegí los gustos y cantidades en la carta:');
   if not ok then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Elegí exactamente '||q||' de '||(g->>'nombre')||'. Ej.: '||q||' de '||(g->'valores'->0->>'nombre')||'.');end if;
  else
   partes=case when voto like 'g_%' then f->'parcial'||partes else partes end;
   select sum((z->>'cantidad')::int) into parcial from jsonb_array_elements(partes) z;
   if parcial=q then
    f=jsonb_set(f,'{selecciones}',f->'selecciones'||jsonb_build_array(jsonb_build_object('grupo',g->>'nombre','valores',partes)));
    f=f||jsonb_build_object('grupo',k+1,'parcial','[]'::jsonb);f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
   else
    f=jsonb_set(f,'{parcial}',partes);
    select jsonb_agg(jsonb_build_object('id','g_'||(z->>'id'),'label',left(z->>'nombre',60))) into opts from jsonb_array_elements(g->'valores') z;
    ok=gestlok_chat_private.wai_agente_poll(p,e,case when g->>'id'='salsas' then 'Salsas incluidas: elegí '||(parcial+1)||' de '||q else 'Elegí '||(g->>'nombre')||' ('||(parcial+1)||' de '||q||')' end,opts);
   end if;
  end if;
 elsif st='salsa_extra' then
  salsa_precio=gestlok_chat_private.wai_salsa_precio(p,f);
  select z into v from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,f),'[]')) z where voto='sa_'||(z->>'id') or (voto is null and n=gestlok_chat_private.wai_normalizar(z->>'nombre')) limit 1;
  if v is not null and salsa_precio is not null then
   f=jsonb_set(f,'{extras}',f->'extras'||jsonb_build_array(jsonb_build_object('id','salsa_extra:'||(v->>'id'),'nombre','Salsa adicional · '||(v->>'nombre'),'precio',salsa_precio)));
   f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
  else
   select jsonb_agg(jsonb_build_object('id','sa_'||(z->>'id'),'label',left(z->>'nombre',60))) into opts from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,f),'[]')) z;
   if salsa_precio is not null and jsonb_array_length(opts) between 2 and 6 then ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una salsa adicional · '||gestlok_chat_private.wai_importe(salsa_precio),opts);
   else f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;end if;
  end if;
 elsif st='extras' then
  if (voto='f_salsa' or n in ('salsa adicional','agregar salsa','salsa extra')) and gestlok_chat_private.wai_salsa_precio(p,f) is not null then
   salsa_precio=gestlok_chat_private.wai_salsa_precio(p,f);
   select jsonb_agg(jsonb_build_object('id','sa_'||(z->>'id'),'label',left(z->>'nombre',60))) into opts from jsonb_array_elements(gestlok_chat_private.wai_salsa_valores(p,f)) z;
   ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una salsa adicional · '||gestlok_chat_private.wai_importe(salsa_precio),opts);f=f||jsonb_build_object('estado','salsa_extra');
  elsif voto in ('f_bebidas','f_postres') then
   extra=substr(voto,3);opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',extra,0);
   if jsonb_array_length(opts)<2 then
    ok=gestlok_chat_private.wai_agente_poll(p,e,'No hay opciones de esa categoría disponibles. ¿Querés agregar algo más?', gestlok_chat_private.wai_extras_opciones(p,f));
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí qué querés agregar',opts);f=f||jsonb_build_object('estado','extra_producto','extra_tipo',extra,'desde',0);end if;
  elsif (voto='f_otro' or n='agregar otro producto') and jsonb_array_length(gestlok_chat_private.wai_carrito_lineas(f))<5 then
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','carrito_carta','pagina_desde',0);
   opts=gestlok_chat_private.wai_carrito_paginas(s.id,0);
   if jsonb_array_length(opts)<2 then f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué más querés agregar?',opts);end if;
  elsif voto='f_sin' or n in ('no','no gracias','sin adicionales','nada','terminar de elegir') then
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','nombre');
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! ¿A nombre de quién hacemos el pedido?');
  else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Querés agregar algo más?',gestlok_chat_private.wai_extras_opciones(p,f));end if;
 elsif st='nombre' then
  if voto is not null or length(t) not between 2 and 80 or t !~ '[[:alpha:]]' then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Escribí el nombre para el pedido.');
  else
   f=f||jsonb_build_object('nombre',t,'estado','modalidad');
   modo=coalesce(a.modalidad,case when s.acepta_retiro and not s.acepta_envio then 'retiro' when s.acepta_envio and not s.acepta_retiro then 'delivery' end);
   if modo='delivery' and s.acepta_envio then
    f=f||jsonb_build_object('modalidad','delivery','estado','direccion');
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Pasame la dirección de entrega (calle y altura) y entre qué calles está, en un solo mensaje.');
   elsif modo='retiro' and s.acepta_retiro then f=f||jsonb_build_object('modalidad','retiro','estado','pago');
   else
   opts='[]';if s.acepta_retiro then opts=opts||'[{"id":"f_retiro","label":"Retiro en el local"}]'::jsonb;end if;if s.acepta_envio then opts=opts||'[{"id":"f_delivery","label":"Delivery"}]'::jsonb;end if;
   opts=opts||'[{"id":"f_humano","label":"Hablar con el comercio"}]'::jsonb;
   if jsonb_array_length(opts)<2 then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El local no tiene modalidad disponible. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Cómo querés recibir tu pedido?',opts);end if;
   end if;
  end if;
 elsif st='modalidad' then
  modo=case voto when 'f_retiro' then 'retiro' when 'f_delivery' then 'delivery' else gestlok_chat_private.wai_modalidad(t) end;
  if modo='delivery' and s.acepta_envio then
   f=f||jsonb_build_object('modalidad','delivery','estado','direccion');
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Pasame la dirección de entrega (calle y altura) y entre qué calles está, en un solo mensaje.'||case when btrim(s.envio_zona)<>'' then ' Zona: '||s.envio_zona else '' end);
  elsif modo='retiro' and s.acepta_retiro then
   f=f||jsonb_build_object('modalidad','retiro','estado','pago');
  else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio te ayudará a confirmar una modalidad disponible.');f=f||jsonb_build_object('estado','revision');end if;
 elsif st='direccion' then
  if voto is not null or length(t) not between 5 and 200 or t !~ '[0-9]' then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Necesito la calle y altura, y entre qué calles está.');
  elsif t ~* ' (entre calles|entrecalles|entre)[: ]+' then
   f=f||jsonb_build_object('direccion',btrim(regexp_replace(t,' (entre calles|entrecalles|entre)[: ]+.*$','','i')),'entrecalles',btrim(regexp_replace(t,'^.*? (entre calles|entrecalles|entre)[: ]+','','i')),'estado','pago');
  else f=f||jsonb_build_object('direccion',t,'estado','entrecalles');ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¿Entre qué calles está? Si no las sabés, escribí No sé.');end if;
 elsif st='entrecalles' then
  if voto is not null or length(t) not between 2 and 160 then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Escribí las entrecalles o No sé.');
  else f=f||jsonb_build_object('entrecalles',case when n in ('no se','no las se','no') then 'No indicadas' else t end,'estado','pago');end if;
 elsif st='pago' then
  pagos=case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end;
  pago=case when voto like 'pay_%' then substr(voto,5) else replace(n,' ','_') end;
  if pago=any(pagos) then
   f=gestlok_chat_private.wai_carrito_guardar(f);
   sub=gestlok_chat_private.wai_carrito_subtotal(f);
   envio=case when f->>'modalidad'='delivery' then s.envio_costo else 0 end;
   demora=case when f->>'modalidad'='delivery' then s.demora_envio else s.demora_retiro end;
   if (f->>'modalidad'='delivery' and not s.acepta_envio) or (f->>'modalidad'='retiro' and not s.acepta_retiro) or coalesce(btrim(demora),'')='' or (f->>'modalidad'='delivery' and sub<s.pedido_minimo) then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio debe confirmar las condiciones de tu pedido antes de calcular el total. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
   else
    monto=sub+envio;
    f=f||jsonb_build_object('estado','cotizacion','pago',pago,'subtotal',sub,'envio',envio,'total',monto,'demora',demora);
    if not gestlok_chat_private.wai_carrito_vigente(p,f) then
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Un producto o precio cambió. El comercio revisará el pedido antes de confirmarte el total.');f=f||jsonb_build_object('estado','revision');
    else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f,true);end if;
   end if;
  else
   f=f||jsonb_build_object('estado','pago');ok=false;
  end if;
 end if;
 if f is not null and f->>'estado'='pago' and not ok then
  pagos=case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end;
  select coalesce(jsonb_agg(jsonb_build_object('id','pay_'||z,'label',case z when 'debito' then 'Débito' when 'credito' then 'Crédito' when 'mercado_pago' then 'Mercado Pago' else initcap(z) end)),'[]'::jsonb) into opts from unnest(pagos) z;
  if jsonb_array_length(opts)=0 then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El local debe confirmar las formas de pago. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
  else opts=opts||'[{"id":"f_humano","label":"Consultar con el comercio"}]'::jsonb;ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Cómo vas a abonar?',opts);end if;
 end if;
 if not ok or f is null then raise exception 'No se pudo encolar el paso del pedido' using errcode='P0001';end if;
 -- No incomplete draft can turn into an order merely by mentioning a flavor.
 update gestlok_chat_private.wai_atencion_hilos set ficha=case when f->>'estado'='cancelado' then null else f||jsonb_build_object('espera',e) end,modalidad=coalesce(f->>'modalidad',a.modalidad),
 pedido_solicitado_at=case when f->>'estado'='pendiente' then clock_timestamp() end,
 pedido_texto=case when f->>'estado'='pendiente' then left(coalesce((select string_agg(l->>'producto',', ') from jsonb_array_elements(gestlok_chat_private.wai_carrito_lineas(f)) l),f->>'producto'),500) end,
 pendiente=f->>'estado' in ('revision','pendiente'),manual=f->>'estado'='revision',actualizado_at=clock_timestamp() where hilo_id=h;
 return true;
end$function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_menu_recibir(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ref text; l gestlok_chat_private.wai_menu_accesos; a gestlok_chat_private.wai_atencion_hilos; s gestlok_chat_private.sucursales; f jsonb; e text:='agente:'||m.id;
begin
 ref=substring(lower(btrim(m.texto)) from '^(?:confirmo mi pedido|mi selección|mi seleccion) wai ([a-f0-9-]{36})$');
 if ref is null then return false;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 select * into l from gestlok_chat_private.wai_menu_accesos where referencia::text=ref and piloto_id=p.id and ciclo_id=a.ciclo_id for update;
 if l.id is null or l.ficha is null or m.ciclo_id is distinct from a.ciclo_id or m.jid is null or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(m.jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester) then
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'No encontramos ese pedido. Escribí CARTA para armarlo nuevamente.');
 end if;
 if l.usado_at is not null or a.ficha->>'estado'='pendiente' then return true;end if;
 if gestlok_chat_private.wai_menu_piloto(l.id) is null then return true;end if;
 f=l.ficha;
 if f->>'estado'='nombre' then
  if not gestlok_chat_private.wai_carrito_vigente(p,f) or gestlok_chat_private.wai_carrito_subtotal(f) is distinct from (f->>'subtotal')::numeric then
   return gestlok_chat_private.wai_pedido_encolar(p.id,e,'La carta cambió. Escribí CARTA para revisar tu selección.');
  end if;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! Tengo tu selección por '||gestlok_chat_private.wai_importe((f->>'subtotal')::numeric)||'. ¿A nombre de quién hacemos el pedido?') then return false;end if;
  update gestlok_chat_private.wai_menu_accesos set usado_at=clock_timestamp() where id=l.id;
  update gestlok_chat_private.wai_atencion_hilos set ficha=(f-'total')||jsonb_build_object('espera',e),modalidad=null,espera_modalidad=false,pedido_solicitado_at=null,pedido_texto=null,pendiente=false,manual=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
  return true;
 end if;
 -- An already prepared checkout from the previous version remains usable.
 f=l.ficha; if gestlok_chat_private.wai_programacion_actual(a.ciclo_id) is not null then f=f||jsonb_build_object('programado_para',gestlok_chat_private.wai_programacion_actual(a.ciclo_id));end if;select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo or s.demora_envio is distinct from f->>'demora')) or (f->>'modalidad'='retiro' and (not s.acepta_retiro or s.demora_retiro is distinct from f->>'demora')) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'La carta o las condiciones cambiaron. Pedí una carta nueva para revisar tu pedido.');
 end if;
 if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Pedido recibido por '||gestlok_chat_private.wai_importe((f->>'total')::numeric)||case when f->>'programado_para' is not null then '. Programado para el '||gestlok_chat_private.wai_fecha_programada((f->>'programado_para')::timestamptz)||'. Demora desde la apertura: ' else '. Demora aproximada: ' end||(f->>'demora')||'. Pendiente de confirmación del gerente.') then return false;end if;
 update gestlok_chat_private.wai_menu_accesos set usado_at=clock_timestamp() where id=l.id;
 update gestlok_chat_private.wai_atencion_hilos set ficha=f||jsonb_build_object('estado','pendiente','espera',e),modalidad=f->>'modalidad',pedido_solicitado_at=clock_timestamp(),pedido_texto=left((select string_agg(x->>'producto',', ') from jsonb_array_elements(f->'carrito') x),500),pendiente=true,manual=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
 return true;
end$function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_mostrar(p gestlok_chat_private.wai_pilotos, e text, f jsonb, cotizar boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare resumen text; item jsonb; k int:=0; linea text; fin text; opciones jsonb;
begin
 resumen=gestlok_chat_private.wai_carrito_resumen(f);
 if length(resumen)<=800 then
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':resumen','Tu carrito:'||chr(10)||resumen||chr(10)||'Subtotal: '||gestlok_chat_private.wai_importe(gestlok_chat_private.wai_carrito_subtotal(f))) then return false;end if;
  update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':resumen' and estado='pendiente';
 else
  -- Do not truncate order details even when the summary exceeds the transport limit.
  while length(resumen)>0 loop
   k=k+1;linea=left(resumen,850);resumen=substr(resumen,length(linea)+1);
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':linea:'||k,'Tu carrito · parte '||k||chr(10)||linea) then return false;end if;
   update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':linea:'||k and estado='pendiente';
  end loop;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':subtotal','Subtotal: '||gestlok_chat_private.wai_importe(gestlok_chat_private.wai_carrito_subtotal(f))) then return false;end if;
  update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':subtotal' and estado='pendiente';
 end if;
 if cotizar then
  fin='Total: '||gestlok_chat_private.wai_importe((f->>'total')::numeric)||case when f->>'modalidad'='delivery' then ' con envío incluido ('||gestlok_chat_private.wai_importe((f->>'envio')::numeric)||')' else ' · Retiro en el local' end||case when f->>'programado_para' is not null then '. Programado para el '||gestlok_chat_private.wai_fecha_programada((f->>'programado_para')::timestamptz)||'. Demora desde la apertura: ' else '. Demora aproximada: ' end||(f->>'demora')||'. Pago: '||replace(f->>'pago','_',' ')||'.';
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':total',fin) then return false;end if;
  update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':total' and estado='pendiente';
  opciones='[{"id":"fc_confirmar","label":"Confirmar mi pedido"},{"id":"fc_editar","label":"Modificar pedido"},{"id":"fc_cancelar","label":"Cancelar pedido"}]';
 else
  opciones=case when jsonb_array_length(gestlok_chat_private.wai_carrito_lineas(f))>0 then '[{"id":"fc_datos","label":"Continuar con el pedido"},{"id":"fc_quitar","label":"Quitar un producto"}]'::jsonb else '[]'::jsonb end
  ||case when jsonb_array_length(gestlok_chat_private.wai_carrito_lineas(f))<5 then '[{"id":"fc_agregar","label":"Agregar otro producto"}]'::jsonb else '[]'::jsonb end||'[{"id":"fc_cancelar","label":"Cancelar pedido"}]'::jsonb;
 end if;
 if not gestlok_chat_private.wai_agente_poll(p,e,case when cotizar then '¿Confirmás este pedido?' else '¿Cómo querés continuar?' end,opciones) then return false;end if;
 update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e and estado='pendiente';
 return true;
end$function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_votacion_estado(m gestlok_chat_private.wai_mensajes)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; a gestlok_chat_private.wai_atencion_hilos%rowtype; tipo text:=m.interaccion->>'tipo'; momento timestamptz;
begin
 if m.interaccion is null then return null;end if;
 -- The original confirmed decision is always displayed, even after a new cycle or authorization.
 if m.opcion_elegida is not null then return 'seleccionada';end if;
 if m.cancelada_at is not null or m.eliminado_at is not null then return 'cancelada';end if;
 if m.estado='incierto' or (m.estado='reservado' and m.reservado_at<now()-interval '45 seconds') then return 'sin_confirmar';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=m.piloto_id;
 if not found or p.cancelado or p.vence_at<=now() then return 'vencida';end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p);
 if tipo='resena' then
  -- The review invitation itself closes attention. Its own optional decision stays available
  -- until the contact returns, asks for the link by text, or the authorization expires.
  if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.evento=m.evento||':link' and x.direccion='salida' and x.cancelada_at is null) then return 'respondida';end if;
  if a.ciclo_id is distinct from m.ciclo_id then return 'reemplazada';end if;
 elsif tipo in ('agente','salsas','menu','pedido') then
  if m.ciclo_id is not null and (a.ciclo_id is distinct from m.ciclo_id or exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=m.ciclo_id and ci.cerrado_at is not null)) then return 'finalizada';end if;
  if tipo in ('agente','salsas') then
   if m.ciclo_id is null or a.manual or a.ciclo_id is null then return 'finalizada';end if;
   if exists(select 1 from gestlok_chat_private.wai_programaciones z where z.ciclo_id=a.ciclo_id and z.estado='ofrecido') then
    if not exists(select 1 from gestlok_chat_private.wai_programaciones z where z.ciclo_id=a.ciclo_id and z.estado='ofrecido' and z.pregunta_evento=m.evento) then return 'reemplazada';end if;
   elsif a.ficha is not null and a.ficha->>'espera' is distinct from m.evento then return 'reemplazada';end if;
   if tipo='salsas' and (a.ficha->>'estado' is distinct from 'grupo' or a.ficha->>'espera' is distinct from m.evento) then return 'reemplazada';end if;
  end if;
  if tipo in ('agente','salsas','menu') then
   momento=greatest(m.creado_at,coalesce(m.reservado_at,m.creado_at));
   -- A later typed answer or another question replaces an unanswered older prompt;
   -- transfer and order status messages are not questions.
   if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.ciclo_id is not distinct from m.ciclo_id and x.direccion='entrada' and x.agente_procesado_at is not null and x.creado_at>momento) then return 'respondida';end if;
   if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.ciclo_id is not distinct from m.ciclo_id and x.direccion='salida' and x.id<>m.id and x.interaccion->>'tipo' in ('agente','salsas','menu') and x.creado_at>m.creado_at) then return 'reemplazada';end if;
  end if;
 else return 'finalizada';end if;
 return case when m.estado='aceptado' then 'abierta' else 'pendiente' end;
end$function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_agente_tick(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_atencion_hilos%rowtype; s gestlok_chat_private.sucursales%rowtype; m gestlok_chat_private.wai_mensajes%rowtype;
 c jsonb; t text; n text; opciones jsonb; respuesta text; pregunta text; e text; ok boolean; modo text; handoff boolean; paginas jsonb; pagina jsonb; pedido boolean; pagina_id text; n_paginas int; reciente gestlok_chat_private.wai_pedidos%rowtype;
begin
 c=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);
 if not (c->>'agente_activo')::boolean then return;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p);
 if not found or a.manual or a.ciclo_id is null or not exists(select 1 from gestlok_chat_private.wai_ciclos where id=a.ciclo_id and cerrado_at is null) then return;end if;
 if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.hilo_id and valoracion='problema' and resuelto_at is null) then return;end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 paginas=gestlok_chat_private.wai_menu_paginas(s.id);n_paginas=jsonb_array_length(paginas);
 -- Incoming events are processed once, in order, only for the current authorized trial and cycle.
 for m in select x.* from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.ciclo_id=a.ciclo_id and x.direccion='entrada' and x.jid is not null and x.agente_procesado_at is null and x.evento not like 'pedido:%' and x.evento not like 'voto:%' order by x.creado_at,x.id for update loop
  select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.hilo_id;
  if m.evento like 'agente-voto:%:reciente_problema' then
   if gestlok_chat_private.wai_postventa_texto(p,m.id,'Tuve un problema') then perform gestlok_chat_private.wai_pedido_tick(p);exit;end if;
  end if;
  if (c->>'pedidos')::boolean then
   begin
    if gestlok_chat_private.wai_fuera_horario(p,m) or gestlok_chat_private.wai_pedido_guiado(p,m) then
     update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=m.id;
     if exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.hilo_id and manual) then exit;end if;
     continue;
    end if;
   exception when raise_exception then
    -- A quota or failed enqueue must not advance the draft.
    exit;
   end;
  end if;
  t=translate(lower(btrim(m.texto)),'áéíóúü','aeiouu'); e='agente:'||m.id; respuesta=null; pregunta=null; opciones=null; handoff=false;
  modo=gestlok_chat_private.wai_modalidad(m.texto);
  pagina=null;pedido=gestlok_chat_private.wai_pedido_texto(s.id,m.texto,a.modalidad);
  pagina_id=case when m.evento like 'agente-voto:%:carta_%' then split_part(m.evento,':',3) end;
  select * into reciente from gestlok_chat_private.wai_pedido_reciente(p);
  if reciente.id is not null and a.ficha is null and (m.evento like 'agente-voto:%:reciente_humano' or t in ('atencion al cliente','selecciono: atencion al cliente')) then
   respuesta='Claro, te paso con una persona del comercio para ayudarte.';handoff=true;
  elsif reciente.id is not null and a.ficha is null and t ~ '^(hola|buen[ao]s? (dias|tardes|noches)|buenas|hey|holaa+)[ !.]*$' and not exists(select 1 from gestlok_chat_private.wai_mensajes x where x.ciclo_id=a.ciclo_id and x.direccion='entrada' and x.id<>m.id and x.agente_procesado_at is not null) then
   pregunta='¡Hola de nuevo! ¿En qué podemos ayudarte?';
   opciones='[{"id":"pedido","label":"Hacer otro pedido"},{"id":"reciente_humano","label":"Atención al cliente"},{"id":"reciente_problema","label":"Tuve un problema"}]'::jsonb;
  elsif a.ficha is null and a.ultima_carta is null and n_paginas>0 and (m.evento like 'agente-voto:%:pedido' or t ~ '^(quiero |quisiera )?(hacer (un |otro )?pedido|pedir|otro pedido)$') then
   if n_paginas=1 then pagina=paginas->0;else pregunta='¿Qué te gustaría pedir?';select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) into opciones from (select v from jsonb_array_elements(paginas) v limit 6) q;end if;
  elsif pagina_id is not null then
   select v into pagina from jsonb_array_elements(paginas) v where v->>'id'=pagina_id;
   if pagina is null then respuesta='La carta cambió. Escribí Menú para consultar las opciones vigentes.';end if;
  elsif t ~ '\m(persona|gerente|humano|reclamo|problema|queja|operador)\M' then
   respuesta='Te paso con una persona del comercio para que pueda ayudarte.';handoff=true;
  elsif pedido and a.modalidad is not null and (c->>'pedidos')::boolean then
   respuesta=left('Anoté tu solicitud: '||m.texto||'. El local la va a revisar y confirmar. Te avisamos por acá cuando esté en preparación.',1000);
  elsif modo is not null and (c->>'pedidos')::boolean then
   if (modo='retiro' and s.acepta_retiro) or (modo='delivery' and s.acepta_envio) then
    respuesta=case modo when 'retiro' then 'Perfecto, retiro en el local.' else 'Perfecto, delivery. Enviame tu dirección.' end||case when a.pedido_solicitado_at is not null then ' Ya tenemos tu solicitud, el local la va a confirmar.' else ' Contame qué productos o servicios necesitás. El comercio confirmará tu solicitud.' end;
   else respuesta='Esa modalidad no está disponible. Te paso con una persona para ayudarte.';handoff=true;end if;
  elsif t ~ '\m(delivery|envio|domicilio)\M' then
   respuesta=case when s.acepta_envio then 'Contamos con delivery.'||case when length(btrim(s.envio_zona))>0 then ' Zona: '||s.envio_zona else '' end||' Costo configurado: $'||s.envio_costo::text||'.' else 'El comercio no tiene delivery habilitado.' end;
  elsif t ~ '\m(horario|horarios|abierto|abren|cierran|ubicacion|direccion|donde)\M' then
   respuesta=concat_ws(chr(10),nullif('Horarios: '||nullif(s.horario,''),''),nullif('Ubicación: '||nullif(s.direccion,''),''));
   if respuesta='' then respuesta='El comercio todavía no cargó este dato. Te paso con una persona.';handoff=true;end if;
  elsif n_paginas>0 and m.evento not like 'agente-voto:%:catalogo_texto' and (m.evento like 'agente-voto:%:menu_mas' or t ~ '\m(menu|carta|catalogo|productos|servicios|precios|promociones|promos|sabores)\M' or exists(select 1 from jsonb_array_elements(paginas) v where length(gestlok_chat_private.wai_normalizar(v->>'label'))>3 and strpos(t,gestlok_chat_private.wai_normalizar(v->>'label'))>0)) then
   if n_paginas=1 then pagina=paginas->0;
   else
    pregunta='Elegí qué parte de la carta querés ver';
    select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) into opciones from (select v from jsonb_array_elements(paginas) v limit 6) q;
   end if;
  elsif t ~ '\m(menu|carta|catalogo|productos|servicios|precios)\M' then
   -- Only the current business's active, available catalog; no fabricated items or prices.
   select string_agg(v,chr(10)) into respuesta from (select '• '||pr.nombre||' — $'||pr.precio::text as v from gestlok_chat_private.productos pr left join gestlok_chat_private.categorias cat on cat.id=pr.categoria_id where pr.sucursal_id=s.id and pr.activo and pr.disponible and coalesce(cat.activa,true) order by pr.orden,pr.nombre limit 12) q;
   if respuesta is null then respuesta='El catálogo todavía no tiene productos disponibles. Te paso con una persona.';handoff=true;
   else respuesta=left('Productos y servicios disponibles (selección):'||chr(10)||respuesta||chr(10)||'Contame qué buscás y el comercio te confirma disponibilidad.',1000);end if;
  elsif (c->>'pedidos')::boolean and a.modalidad is not null and (m.evento like 'agente-voto:%:pedido' or t ~ '^(quiero |quisiera )?(hacer un pedido|pedir)$') and a.pedido_solicitado_at is null then
   respuesta='¿Qué te gustaría pedir? Escribí la cantidad y los productos.';
  elsif (c->>'pedidos')::boolean and a.modalidad is not null and t ~ '\m(pedido|pedir|quiero|quisiera|comprar|encargar)\M' then
   respuesta='Ya tenemos registrada tu modalidad. El comercio confirmará tu pedido y los detalles.';handoff=true;
  elsif (c->>'pedidos')::boolean and (t ~ '\m(pedido|pedir|quiero|quisiera|comprar|encargar)\M' or a.espera_modalidad or pedido) then
   opciones='[]'::jsonb;
   if s.acepta_retiro then opciones=opciones||'[{"id":"retiro","label":"Retiro en el local"}]'::jsonb;end if;
   if s.acepta_envio then opciones=opciones||'[{"id":"delivery","label":"Delivery"}]'::jsonb;end if;
   opciones=opciones||'[{"id":"humano","label":"Hablar con una persona"}]'::jsonb;
   pregunta='¿Cómo querés recibir tu pedido?';
  elsif t ~ '^(hola|buen[ao]s? (dias|tardes|noches)|buenas|hey|holaa+)[ !.]*$' then
   pregunta='¡Hola! ¿En qué podemos ayudarte?';
   opciones='[{"id":"catalogo","label":"Ver productos o servicios"},{"id":"horario","label":"Horarios y ubicación"}]'::jsonb;
   if (c->>'pedidos')::boolean then opciones=opciones||'[{"id":"pedido","label":"Hacer un pedido"}]'::jsonb;end if;
   opciones=opciones||'[{"id":"humano","label":"Hablar con una persona"}]'::jsonb;
  elsif reciente.id is not null and a.ficha is null and not exists(select 1 from gestlok_chat_private.wai_mensajes x where x.ciclo_id=a.ciclo_id and x.direccion='entrada' and x.id<>m.id and x.agente_procesado_at is not null) then
   pregunta='¡Hola de nuevo! ¿En qué podemos ayudarte?';
   opciones='[{"id":"pedido","label":"Hacer otro pedido"},{"id":"reciente_humano","label":"Atención al cliente"},{"id":"reciente_problema","label":"Tuve un problema"}]'::jsonb;
  else
   respuesta='Gracias por escribirnos. Una persona del comercio va a revisar tu consulta para responderte correctamente.';handoff=true;
  end if;
  if pagina is not null then ok=gestlok_chat_private.wai_encolar_foto(p,e,pagina);
  elsif pregunta is not null then ok=gestlok_chat_private.wai_agente_poll(p,e,pregunta,opciones);
  else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,respuesta);end if;
  if not ok then exit;end if;
  update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=m.id;
  if pregunta='¿Cómo querés recibir tu pedido?' then update gestlok_chat_private.wai_atencion_hilos set espera_modalidad=true where hilo_id=a.hilo_id;end if;
  if handoff then update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where piloto_id=p.id and ciclo_id=a.ciclo_id and direccion='entrada' and agente_procesado_at is null;update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;exit;end if;
 end loop;
end$function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_pedido(p_sucursal uuid, p_hilo uuid, p_accion text, p_pedido uuid DEFAULT NULL::uuid, p_modalidad text DEFAULT NULL::text, p_demora integer DEFAULT 2, p_evento uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_pilotos%rowtype;p gestlok_chat_private.wai_pilotos%rowtype;o gestlok_chat_private.wai_pedidos%rowtype;s gestlok_chat_private.sucursales%rowtype;mensaje text;v_estado text;url text;f jsonb;demora text;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into a from gestlok_chat_private.wai_pilotos where id=p_hilo and sucursal_id=p_sucursal;
 if not found then raise exception 'Conversación no disponible';end if;
 -- Resolve to the stable oldest thread; prevent parallel orders via aliases.
 if a.id is distinct from (select x.id from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) order by x.creado_at,x.id limit 1) then raise exception 'Conversación no disponible';end if;
 if p_accion='resolver' then
  update gestlok_chat_private.wai_pedidos set resuelto_at=coalesce(resuelto_at,now()),actualizado_at=now()
   where id=p_pedido and hilo_id=a.id and valoracion='problema';
  if found then update gestlok_chat_private.wai_atencion_hilos set pendiente=false,actualizado_at=now() where hilo_id=a.id and not exists(select 1 from gestlok_chat_private.wai_pedidos z where z.hilo_id=a.id and z.valoracion='problema' and z.resuelto_at is null);return true;end if;return false;
 end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester)) then raise exception 'Esperá una conexión y un mensaje autorizado';end if;
 select * into s from gestlok_chat_private.sucursales where id=p_sucursal;
 if p_accion='aceptar' and exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=a.id and ci.cerrado_at is not null) then raise exception 'Conversación finalizada';end if;
 if p_accion='transferencia' then
  if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=a.id and ci.cerrado_at is not null) and not exists(select 1 from gestlok_chat_private.wai_pedido_reciente(p) r where r.ficha->>'pago'='transferencia') then raise exception 'No hay transferencia pendiente en un pedido reciente';end if;
  if p_evento is null then raise exception 'Solicitud inválida';end if;
  if length(btrim(coalesce(s.datos_transferencia,''))) not between 1 and 700 then raise exception 'Cargá los datos de transferencia en Ajustes del local';end if;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'transferencia:'||p_evento,'Datos para la transferencia:'||chr(10)||s.datos_transferencia) then raise exception 'Límite de respuestas de prueba';end if;
  return true;
 elsif p_accion='aceptar' then
  if not (gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean then raise exception 'El seguimiento de pedidos está desactivado en Ajustes WAI';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  select wh.ficha into f from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=a.id for update;
  if f->>'programado_para' is not null and clock_timestamp()<(f->>'programado_para')::timestamptz then raise exception 'Pedido programado: confirmalo cuando abra el local';end if;
  if coalesce((gestlok_chat_private.estado_atencion(s)->>'habilitado')::boolean,false) and not coalesce((gestlok_chat_private.estado_atencion(s)->>'abierto')::boolean,false) then raise exception 'El local está cerrado. Confirmá el pedido al abrir';end if;
  if f is not null and f->>'estado' is distinct from 'pendiente' then raise exception 'Esperá que el cliente complete el pedido';end if;
  if f ? 'carrito' and (not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo)) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false)) then raise exception 'El catálogo o las condiciones cambiaron. Revisá el pedido antes de confirmarlo';end if;
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=a.id and wh.pedido_solicitado_at is not null) then raise exception 'No hay un pedido nuevo pendiente de confirmación';end if;
  select wh.modalidad into p_modalidad from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=a.id;
  p_demora=(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'seguimiento_min')::integer;
  if p_evento is null or p_modalidad is null or (p_modalidad='retiro' and not s.acepta_retiro) or (p_modalidad='delivery' and not s.acepta_envio) then raise exception 'Esperá que el cliente confirme retiro o delivery';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and (estado<>'entregado' and atencion_finalizada_at is null and creado_at>clock_timestamp()-interval '4 hours' or valoracion='problema' and resuelto_at is null)) then raise exception 'Finalizá el pedido o el reclamo anterior';end if;
  insert into gestlok_chat_private.wai_pedidos(hilo_id,piloto_id,modalidad,demora_min,revision_evento,ciclo_id,ficha,resena_enlace) values(a.id,p.id,p_modalidad,p_demora,p_evento,(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.id),case when f is null then null else f||'{"estado":"confirmado"}'::jsonb end,case when gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url') then s.mensajes->>'resena_url' end) returning * into o;
  update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=null,pedido_texto=null,pendiente=false,ficha=case when f is null then null else f||'{"estado":"confirmado"}'::jsonb end,actualizado_at=clock_timestamp() where hilo_id=a.id;
  demora=case o.modalidad when 'retiro' then s.demora_retiro else s.demora_envio end;
  mensaje='¡Recibimos tu pedido! Ya está confirmado y en preparación. Modalidad: '||case o.modalidad when 'retiro' then 'retiro en el local.' else 'delivery.' end||case when nullif(btrim(demora),'') is not null then chr(10)||'Demora aproximada: '||btrim(demora)||'.' else '' end;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':preparacion',mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  return true;
 end if;
 select * into o from gestlok_chat_private.wai_pedidos where id=p_pedido and hilo_id=a.id for update;
 if not found then raise exception 'Pedido no disponible';end if;
 if p_accion='listo' then
  if o.creado_at<=now()-interval '4 hours' then raise exception 'Pedido fuera de la atención reciente';end if;
  v_estado=case o.modalidad when 'retiro' then 'listo' else 'en_camino' end;
  if o.estado=v_estado then return true;end if;
  if o.estado<>'preparacion' then raise exception 'Estado de pedido inválido';end if;
  mensaje=case o.modalidad when 'retiro' then '¡Tu pedido está listo para retirar en '||s.nombre||'!' else '¡Tu pedido está en camino!' end;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':'||v_estado,mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  update gestlok_chat_private.wai_pedidos set estado=v_estado,piloto_id=p.id,consulta_at=null,actualizado_at=now() where id=o.id;
 else raise exception 'Acción inválida';end if;
 return true;
end$function$
;
