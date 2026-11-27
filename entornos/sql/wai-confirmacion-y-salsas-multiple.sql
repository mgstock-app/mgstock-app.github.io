-- Confirmed ETA + review at preparation, and a weighted native sauce poll.
alter table gestlok_chat_private.wai_sesiones add column if not exists salsas_at timestamptz;
create or replace function gestlok_chat_private.wai_resena_invitar(p gestlok_chat_private.wai_pilotos,o gestlok_chat_private.wai_pedidos)
returns boolean language plpgsql set search_path='' as $$
declare e text:='pedido:'||o.id||':resena';ok boolean;
begin
 if o.hilo_id is distinct from gestlok_chat_private.wai_hilo(p) or not gestlok_chat_private.wai_pedido_consentimiento(p) then return false;end if;
 if not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento='pedido:'||o.id||':preparacion' and m.estado='aceptado' and strpos(m.texto,o.resena_enlace)>0) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento=e) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then
  ok=gestlok_chat_private.wai_agente_poll(p,e,'Gracias por elegirnos. ¿Querés dejar una reseña en Google? También podés escribir RESEÑA.', '[{"id":"resena_si","label":"Dejar reseña en Google"},{"id":"resena_no","label":"Ahora no"}]'::jsonb);
  if ok then update gestlok_chat_private.wai_mensajes set interaccion=jsonb_set(interaccion,'{tipo}','"resena"'),ciclo_id=o.ciclo_id where piloto_id=p.id and evento=e and direccion='salida';end if;
 else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Gracias por elegirnos. Si querés, dejá tu reseña en Google: '||o.resena_enlace);end if;
 return ok;
end$$;

create or replace function gestlok_chat_private.wai_postventa_texto(p gestlok_chat_private.wai_pilotos,entrada uuid,t text)
returns boolean language plpgsql set search_path='' as $$
declare o gestlok_chat_private.wai_pedidos%rowtype; n text:=gestlok_chat_private.wai_normalizar(t); v text; msg text;
begin
 if n not in ('tuve un problema con mi pedido','tengo un problema con mi pedido','recibi bien mi pedido','pedido recibido correctamente','resena','dejar resena','dejar resena en google') then return false;end if;
 select * into o from gestlok_chat_private.wai_pedidos where hilo_id=gestlok_chat_private.wai_hilo(p) and (estado='entregado' or n in ('resena','dejar resena','dejar resena en google') and estado in ('preparacion','listo','en_camino')) order by creado_at desc,id desc limit 1 for update;
 if not found then return false;end if;
 if n in ('resena','dejar resena','dejar resena en google') then
  if not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) then select mensajes->>'resena_url' into o.resena_enlace from gestlok_chat_private.sucursales where id=p.sucursal_id;end if;
  if gestlok_chat_private.url_resena_valida(o.resena_enlace) then perform gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':resena:link','¡Gracias! Este es el enlace directo al perfil de Google del local: '||o.resena_enlace);end if;
 else
  v=case when n in ('recibi bien mi pedido','pedido recibido correctamente') then 'bien' else 'problema' end;
  if o.valoracion is distinct from v and o.valoracion is distinct from 'problema' then
   update gestlok_chat_private.wai_pedidos set valoracion=v,valorado_at=now(),actualizado_at=now(),respuesta_encolada_at=null where id=o.id returning * into o;
  end if;
  if o.piloto_id<>p.id and o.respuesta_encolada_at is null then
   msg=case when v='problema' then 'Lamentamos mucho el inconveniente. Contanos qué pasó. El gerente va a revisar tu reclamo.' else '¡Muchas gracias por elegirnos!' end;
   if gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':respuesta:'||v,msg) then update gestlok_chat_private.wai_pedidos set respuesta_encolada_at=now() where id=o.id;end if;
  end if;
  if v='problema' and o.resuelto_at is null then
   update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=now() where hilo_id=o.hilo_id;
  end if;
 end if;
 update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;
 return true;
end$$;

create or replace function gestlok_chat_private.wai_ficha_avanzar(p gestlok_chat_private.wai_pilotos,e text,f jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare g jsonb; vs jsonb; q int; k int; foto text; pregunta text; opts jsonb; ok boolean; v jsonb;
begin
 k=coalesce((f->>'grupo')::int,0);
 g=f->'grupos'->k;
 if g is null then
  f=f||jsonb_build_object('estado','extras','grupo',k,'parcial','[]'::jsonb);
  ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Querés agregar algo más?',gestlok_chat_private.wai_extras_opciones(p,f));
 else
  q=case when g->>'tipo'='cantidad' then (g->>'total')::int when g->>'tipo'='una' then 1 else null end;
  vs=g->'valores';
  if q is null or q<1 or q>30 or jsonb_array_length(vs)<1 then
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Una persona del comercio te ayudará a completar las opciones de este producto.');
   f=f||jsonb_build_object('estado','revision');
  else
   f=f||jsonb_build_object('estado','grupo','parcial','[]'::jsonb);
   pregunta='Elegiste '||(f->>'producto')||'. Elegí '||q||' de '||(g->>'nombre')||'. Escribí los gustos y cantidades, por ejemplo: 2 de '||(vs->0->>'nombre')||'.';
   select d.imagen_url into foto from gestlok_chat_private.wai_carta_paginas c join gestlok_chat_private.wai_carta_paginas d on d.sucursal_id=c.sucursal_id and d.clave=c.detalle_clave where c.sucursal_id=p.sucursal_id and 'carta_'||c.clave=f->>'carta' and c.detalle_grupo=g->>'id';
   if foto is not null and gestlok_chat_private.wai_imagen_permitida(p.sucursal_id,foto) and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.imagenes_at>now()-interval '30 seconds' and w.imagenes_at>=w.solicitada_at) then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Carta de '||(g->>'nombre'));
    if ok then update gestlok_chat_private.wai_mensajes set imagen_url=foto,continuar_texto=left(pregunta,1000) where piloto_id=p.id and evento=e and estado='pendiente';end if;
   elsif g->>'id'='salsas' and q>1 then
    -- WhatsApp supports at most 12 distinct choices. Each flavor has a 1×
    -- and 2× entry. Combine both for 3×; exact written quantities also work
    -- for all quantities, including 4×/5× of the same sauce.
    if jsonb_array_length(vs) between 2 and 6 and q<=5 and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.salsas_at>now()-interval '30 seconds' and w.salsas_at>=w.solicitada_at) then
     select jsonb_agg(jsonb_build_object('id','sm_'||cnt||'_'||i,'label',left(cnt||' × '||(x->>'nombre'),60),'cantidad',cnt,'sabor',x->>'id','nombre',x->>'nombre') order by cnt,i) into opts from jsonb_array_elements(vs) with ordinality as a(x,i) cross join generate_series(1,2) cnt;
     pregunta='Elegí exactamente '||q||' salsas. Marcá las cantidades en esta encuesta; también podés escribirlas en el chat.';
     ok=gestlok_chat_private.wai_agente_poll(p,e,pregunta,opts);
     if ok then update gestlok_chat_private.wai_mensajes set interaccion=interaccion||jsonb_build_object('tipo','salsas','multiple',true,'cantidad',q,'opciones',opts) where piloto_id=p.id and evento=e and estado='pendiente';end if;
    else
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,left('Elegí exactamente '||q||' salsas. Escribí los gustos y cantidades en un solo mensaje (por ejemplo: '||q||' de '||(vs->0->>'nombre')||'). Opciones: '||(select string_agg(x->>'nombre',', ') from jsonb_array_elements(vs) x),1000));
    end if;
   elsif jsonb_array_length(vs) between 2 and 6 then
    select jsonb_agg(jsonb_build_object('id','g_'||(x->>'id'),'label',left(x->>'nombre',60))) into opts from jsonb_array_elements(vs) x;
    ok=gestlok_chat_private.wai_agente_poll(p,e,case when g->>'id'='salsas' then 'Salsas incluidas en el pack: elegí 1 de '||q else 'Elegí '||(g->>'nombre')||' (1 de '||q||')' end,opts);
   else
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,left(pregunta||chr(10)||(select string_agg(x->>'nombre',', ') from jsonb_array_elements(vs) x),1000));
   end if;
  end if;
 end if;
 if not ok then return null;end if;
 return f||jsonb_build_object('espera',e);
end$$;

create or replace function gestlok_chat_private.wai_pedido_guiado(p gestlok_chat_private.wai_pilotos,m gestlok_chat_private.wai_mensajes)
returns boolean language plpgsql set search_path='' as $$
declare h uuid:=gestlok_chat_private.wai_hilo(p); a gestlok_chat_private.wai_atencion_hilos%rowtype; s gestlok_chat_private.sucursales%rowtype;
 f jsonb; st text; voto text; de_evento text; e text:='agente:'||m.id; t text:=btrim(m.texto); n text:=gestlok_chat_private.wai_normalizar(m.texto);
 x record; g jsonb; v jsonb; partes jsonb; opts jsonb; q int; parcial int; k int; desde int; extra text; modo text; pago text; pagos text[]; demora text; envio numeric; sub numeric; monto numeric; ok boolean:=false; pregunta text; resumen text; ficha_nueva jsonb; salsa_precio numeric; pack_n text; salsa_n text; pagina text; idx int;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=h for update;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 f=a.ficha; st=f->>'estado';
 if st='cancelado' then f=null;st=null;end if;
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
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=h and estado<>'entregado') then return false;end if;
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
   f=f||jsonb_build_object('estado','nombre');
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! ¿A nombre de quién hacemos el pedido?');
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
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Recibimos tu solicitud. Demora aproximada: '||coalesce(f->>'demora','a confirmar por el comercio')||'. Pronto el gerente confirmará el pedido y comenzará a prepararlo.');
    f=f||jsonb_build_object('estado','pendiente');
   end if;
  elsif voto='fc_editar' or (voto is null and n in ('modificar','modificar pedido')) then
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','carrito_revision');
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
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,left('Necesito exactamente '||q||' de '||(g->>'nombre')||'. Escribí todas las cantidades y nombres de la carta. Opciones: '||(select string_agg(z->>'nombre',', ') from jsonb_array_elements(g->'valores') z),1000));
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
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','carrito_revision');
   ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
  else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Querés agregar algo más?',gestlok_chat_private.wai_extras_opciones(p,f));end if;
 elsif st='nombre' then
  if voto is not null or length(t) not between 2 and 80 or t !~ '[[:alpha:]]' then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Escribí el nombre para el pedido.');
  else
   f=f||jsonb_build_object('nombre',t,'estado','modalidad');
   opts='[]';if s.acepta_retiro then opts=opts||'[{"id":"f_retiro","label":"Retiro en el local"}]'::jsonb;end if;if s.acepta_envio then opts=opts||'[{"id":"f_delivery","label":"Delivery"}]'::jsonb;end if;
   opts=opts||'[{"id":"f_humano","label":"Hablar con el comercio"}]'::jsonb;
   if jsonb_array_length(opts)<2 then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El local no tiene modalidad disponible. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Cómo querés recibir tu pedido?',opts);end if;
  end if;
 elsif st='modalidad' then
  modo=case voto when 'f_retiro' then 'retiro' when 'f_delivery' then 'delivery' else gestlok_chat_private.wai_modalidad(t) end;
  if modo='delivery' and s.acepta_envio then
   f=f||jsonb_build_object('modalidad','delivery','estado','direccion');
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Escribí la dirección completa de entrega (calle, número y localidad).'||case when btrim(s.envio_zona)<>'' then ' Zona: '||s.envio_zona else '' end);
  elsif modo='retiro' and s.acepta_retiro then
   f=f||jsonb_build_object('modalidad','retiro','estado','pago');
  else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio te ayudará a confirmar una modalidad disponible.');f=f||jsonb_build_object('estado','revision');end if;
 elsif st='direccion' then
  if voto is not null or length(t) not between 5 and 200 or t !~ '[0-9]' then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Necesito la dirección completa, incluida la altura y localidad.');
  else f=f||jsonb_build_object('direccion',t,'estado','pago');end if;
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
 update gestlok_chat_private.wai_atencion_hilos set ficha=case when f->>'estado'='cancelado' then null else f||jsonb_build_object('espera',e) end,modalidad=f->>'modalidad',
 pedido_solicitado_at=case when f->>'estado'='pendiente' then clock_timestamp() end,
 pedido_texto=case when f->>'estado'='pendiente' then left(coalesce((select string_agg(l->>'producto',', ') from jsonb_array_elements(gestlok_chat_private.wai_carrito_lineas(f)) l),f->>'producto'),500) end,
 pendiente=f->>'estado' in ('revision','pendiente'),manual=f->>'estado'='revision',actualizado_at=clock_timestamp() where hilo_id=h;
 return true;
end$$;

create or replace function public.gestlok_chat_wai_pedido(p_sucursal uuid,p_hilo uuid,p_accion text,p_pedido uuid default null,p_modalidad text default null,p_demora integer default 2,p_evento uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
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
 if p_accion in ('transferencia','aceptar') and exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=a.id and ci.cerrado_at is not null) then raise exception 'Conversación finalizada';end if;
 if p_accion='transferencia' then
  if p_evento is null then raise exception 'Solicitud inválida';end if;
  if length(btrim(coalesce(s.datos_transferencia,''))) not between 1 and 700 then raise exception 'Cargá los datos de transferencia en Ajustes del local';end if;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'transferencia:'||p_evento,'Datos para la transferencia:'||chr(10)||s.datos_transferencia) then raise exception 'Límite de respuestas de prueba';end if;
  return true;
 elsif p_accion='aceptar' then
  if not (gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean then raise exception 'El seguimiento de pedidos está desactivado en Ajustes WAI';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  select wh.ficha into f from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=a.id;
  if f is not null and f->>'estado' is distinct from 'pendiente' then raise exception 'Esperá que el cliente complete el pedido';end if;
  if f ? 'carrito' and (not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo)) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false)) then raise exception 'El catálogo o las condiciones cambiaron. Revisá el pedido antes de confirmarlo';end if;
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=a.id and wh.pedido_solicitado_at is not null) then raise exception 'No hay un pedido nuevo pendiente de confirmación';end if;
  select wh.modalidad into p_modalidad from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=a.id;
  p_demora=(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'seguimiento_min')::integer;
  if p_evento is null or p_modalidad is null or (p_modalidad='retiro' and not s.acepta_retiro) or (p_modalidad='delivery' and not s.acepta_envio) then raise exception 'Esperá que el cliente confirme retiro o delivery';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and (estado<>'entregado' or valoracion='problema' and resuelto_at is null)) then raise exception 'Finalizá el pedido o el reclamo anterior';end if;
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
  v_estado=case o.modalidad when 'retiro' then 'listo' else 'en_camino' end;
  if o.estado=v_estado then return true;end if;
  if o.estado<>'preparacion' then raise exception 'Estado de pedido inválido';end if;
  mensaje=case o.modalidad when 'retiro' then '¡Tu pedido está listo para retirar en '||s.nombre||'!' else '¡Tu pedido está en camino!' end;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':'||v_estado,mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  update gestlok_chat_private.wai_pedidos set estado=v_estado,piloto_id=p.id,consulta_at=null,actualizado_at=now() where id=o.id;
 elsif p_accion='entregado' then
  if o.estado='entregado' then return true;end if;
  if o.estado not in ('listo','en_camino') then raise exception 'Primero marcá listo para retirar o en camino';end if;
  mensaje='Tu pedido figura como entregado. ¡Gracias por elegirnos!';
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':entregado',mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  update gestlok_chat_private.wai_pedidos set estado='entregado',actualizado_at=now(),resena_enlace=coalesce(o.resena_enlace,case when gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url') then s.mensajes->>'resena_url' end),
   piloto_id=case when consulta_enviada_at is null then p.id else piloto_id end,
   consulta_at=case when consulta_enviada_at is null then now()+make_interval(mins=>o.demora_min) else consulta_at end
   where id=o.id;
 else raise exception 'Acción inválida';end if;
 return true;
end$$;

create or replace function gestlok_chat_private.wai_recibir_voto(p gestlok_chat_private.wai_pilotos,p_jid text,p_evento text,p_opcion text)
returns jsonb language plpgsql set search_path='' as $$
declare m gestlok_chat_private.wai_mensajes%rowtype;o jsonb;pedido gestlok_chat_private.wai_pedidos%rowtype;h uuid;entrada uuid; ids text[]; elegidas jsonb; cantidad int; esperado int; detalle text;
begin
 if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester) or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' then return null;end if;
 select x.* into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.wa_id=p_evento and x.direccion='salida' and x.estado='aceptado' and x.interaccion is not null for update;
 if not found then return null;end if;
 if m.interaccion->>'tipo'='salsas' then
  h=gestlok_chat_private.wai_hilo(p);
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and not a.manual and ci.cerrado_at is null and ci.id=m.ciclo_id and a.ficha->>'estado'='grupo' and a.ficha->>'espera'=m.evento) then return jsonb_build_object('ok',true);end if;
  if m.opcion_elegida is not null then return jsonb_build_object('ok',true);end if;
  if p_opcion is null or p_opcion !~ '^sm_[12]_[1-6](,sm_[12]_[1-6]){0,11}$' then return null;end if;
  ids=string_to_array(p_opcion,',');
  if cardinality(ids)<>(select count(distinct i) from unnest(ids) i) then return null;end if;
  select jsonb_agg(v),sum((v->>'cantidad')::int) into elegidas,cantidad from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=any(ids);
  if coalesce(jsonb_array_length(elegidas),0)<>cardinality(ids) then return null;end if;
  esperado=(m.interaccion->>'cantidad')::int;
  -- Partial or excessive snapshots do not change the order or send another poll.
  if cantidad<>esperado then return jsonb_build_object('ok',true,'completo',false);end if;
  select string_agg(q::text||' '||nombre,', ' order by nombre) into detalle from (select v->>'nombre' as nombre,sum((v->>'cantidad')::int) q from jsonb_array_elements(elegidas) v group by v->>'nombre') a;
  if detalle is null or length(detalle)>1000 then return null;end if;
  update gestlok_chat_private.wai_mensajes set opcion_elegida=array_to_string(ids,','),opcion_at=now(),opcion_respuesta_at=now() where id=m.id;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada',detalle,'recibido','agente-voto:'||m.id||':salsas',p_jid) on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);end if;
  return jsonb_build_object('ok',true,'completo',true);
 end if;
 select v into o from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=p_opcion;
 if o is null then return null;end if;
 if m.interaccion->>'tipo'='resena' then
  select x.* into pedido from gestlok_chat_private.wai_pedidos x where x.piloto_id=p.id and m.evento='pedido:'||x.id||':resena' and x.estado in ('preparacion','listo','en_camino','entregado') for update;
  if not found or p_opcion not in ('resena_si','resena_no') then return null;end if;
  if p_opcion='resena_si' and gestlok_chat_private.url_resena_valida(pedido.resena_enlace) then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||pedido.id||':resena:link','¡Gracias! Este es el enlace directo al perfil de Google del local: '||pedido.resena_enlace) then return null;end if;
  end if;
 elsif m.interaccion->>'tipo'='pedido' then
  select x.* into pedido from gestlok_chat_private.wai_pedidos x where x.piloto_id=p.id and m.evento='pedido:'||x.id||':consulta' for update;
  if not found then return null;end if;
  -- A subsequent complaint is never ignored, even after a positive vote.
  if p_opcion not in ('bien','problema') then return null;end if;
  if pedido.valoracion='problema' and p_opcion<>'problema' then return jsonb_build_object('ok',true);end if;
  if p_opcion is distinct from pedido.valoracion then
  update gestlok_chat_private.wai_pedidos set valoracion=p_opcion,valorado_at=now(),actualizado_at=now(),respuesta_encolada_at=null where id=pedido.id;
  if p_opcion='problema' then update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=now() where hilo_id=pedido.hilo_id;end if;
  end if;
 elsif m.interaccion->>'tipo'='agente' then
  h=gestlok_chat_private.wai_hilo(p);
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and ci.cerrado_at is null and ci.id=m.ciclo_id) then return null;end if;
  if m.opcion_elegida is not null then return jsonb_build_object('ok',true);end if;
  update gestlok_chat_private.wai_mensajes set opcion_elegida=p_opcion,opcion_at=now(),opcion_respuesta_at=now() where id=m.id;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada','Seleccionó: '||(o->>'label'),'recibido','agente-voto:'||m.id||':'||p_opcion,p_jid) on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then
   perform gestlok_chat_private.wai_ciclo_entrada(p,entrada,case when p_opcion in ('retiro','delivery') then p_opcion end);
   if coalesce((select manual from gestlok_chat_private.wai_atencion_hilos where hilo_id=h),false) then
    update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;
   end if;
  end if;
  return jsonb_build_object('ok',true);
 elsif m.interaccion->>'tipo'='menu' then
  if m.ciclo_id is not null and not exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=m.ciclo_id and ci.cerrado_at is null) then return null;end if;
  if m.opcion_elegida is not null and (m.opcion_elegida=p_opcion or not (o->>'humano')::boolean or exists(select 1 from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=m.opcion_elegida and (v->>'humano')::boolean)) then return jsonb_build_object('ok',true);end if;
  -- Immediately mark a request for a person, even if no reply quota remains.
  if (o->>'humano')::boolean then
   h=gestlok_chat_private.wai_hilo(p);
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual,pendiente) values(h,true,true)
   on conflict(hilo_id) do update set manual=true,pendiente=true,actualizado_at=now();
   update gestlok_chat_private.wai_mensajes set cancelada_at=now() where piloto_id=p.id and estado='pendiente' and cancelada_at is null and (evento like 'menu:auto:%' or evento like 'menu:respuesta:%');
  end if;
 else return null;end if;
 update gestlok_chat_private.wai_mensajes set opcion_elegida=p_opcion,opcion_at=now(),opcion_respuesta_at=null where id=m.id;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada','Seleccionó: '||(o->>'label'),'recibido',case when m.interaccion->>'tipo'='pedido' then 'pedido:'||pedido.id||':voto:'||p_opcion else 'voto:'||m.id||':'||p_opcion end,p_jid) on conflict(piloto_id,direccion,evento) do nothing;
 return jsonb_build_object('ok',true);
end$$;

create or replace function public.gestlok_chat_wai_piloto_motor(p_id uuid,p_clave text,p_revision uuid,p_accion text,p_piloto uuid default null,p_jid text default null,p_evento text default null,p_texto text default null,p_mensaje uuid default null,p_estado text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text; entrada uuid; voto jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and (p_piloto is null or x.id=p_piloto) and gestlok_chat_private.wai_piloto_vigente(x) order by x.creado_at desc limit 1 for update;
 if not found then return null;end if;
 if p_accion='control' then
  update gestlok_chat_private.wai_sesiones set opciones_at=case when p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2') then now() else null end,imagenes_at=case when p_estado in ('opciones_imagen_v1','opciones_imagen_v2') then now() else null end,salsas_at=case when p_estado='opciones_imagen_v2' then now() else null end where habilitacion_id=p_id;
  perform gestlok_chat_private.wai_pedido_tick(p);
  perform gestlok_chat_private.wai_cierre_tick(p);
  if p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2') then perform gestlok_chat_private.wai_atencion_tick(p);perform gestlok_chat_private.wai_agente_tick(p);end if; return jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp(),'salientes',coalesce((select jsonb_agg(jsonb_build_object('wa_id',sm.wa_id,'ruta',sm.wa_ruta,'accion_id',sm.wa_accion_id)) from gestlok_chat_private.wai_mensajes sm where sm.piloto_id=p.id and sm.direccion='salida' and sm.wa_id is not null),'[]'::jsonb));end if;
 if p_piloto is distinct from p.id then return null;end if;
 if p_accion='alerta' then
  if p_estado not in ('voto_no_descifrado','voto_no_registrado','entrada_no_registrada','cola_llena','sincronizacion_pendiente') or p_estado is null then return null;end if;
  update gestlok_chat_private.wai_pilotos set alerta_sync=p_estado,alerta_sync_at=clock_timestamp() where id=p.id;
  return jsonb_build_object('ok',true);
 elsif p_accion='voto' then
  voto=gestlok_chat_private.wai_recibir_voto(p,p_jid,p_evento,p_texto);
  if coalesce((voto->>'ok')::boolean,false) then
   if not exists(select 1 from gestlok_chat_private.wai_mensajes z where z.piloto_id=p.id and z.wa_id=p_evento and z.interaccion->>'tipo' in ('pedido','resena')) then
    perform gestlok_chat_private.wai_atencion_tick(p);
    perform gestlok_chat_private.wai_agente_tick(p);
   end if;
   begin
    perform gestlok_chat_private.wai_pedido_tick(p);
   exception when others then
    update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;
   end;
  end if;
  return voto;
 elsif p_accion='agenda' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_texto is null or length(btrim(p_texto)) not between 1 and 100 or p_texto ~ '[[:cntrl:]]' then return null;end if;
  insert into gestlok_chat_private.wai_nombres_agenda(habilitacion_id,numero_clave,nombre,sincronizado_at)
  values(p.habilitacion_id,gestlok_chat_private.whatsapp_exclusion_key(p.tester),btrim(p_texto),now())
  on conflict(habilitacion_id,numero_clave) do update set nombre=excluded.nombre,sincronizado_at=excluded.sincronizado_at;
  return jsonb_build_object('ok',true);
 elsif p_accion='recibir' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or length(p_evento) not between 1 and 200 or p_texto is null or length(btrim(p_texto)) not between 1 and 1000
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and direccion='entrada')>=40 then return null;end if;
  perform gestlok_chat_private.wai_cierre_tick(p);
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado) values(p.id,'entrada',p_texto,p_evento,p_jid,'recibido') on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then
   if gestlok_chat_private.wai_postventa_texto(p,entrada,p_texto) then
    update gestlok_chat_private.wai_mensajes set ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p)) where id=entrada;
    perform gestlok_chat_private.wai_pedido_tick(p);
    return jsonb_build_object('ok',true);
   end if;
   perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
   if not (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'agente_activo')::boolean or coalesce((select wh.manual from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=gestlok_chat_private.wai_hilo(p)),false) then update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;end if;
   if exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then
    perform gestlok_chat_private.wai_atencion_tick(p);
    perform gestlok_chat_private.wai_agente_tick(p);
   end if;
   perform gestlok_chat_private.wai_pedido_tick(p);
  end if;
  return jsonb_build_object('ok',true);
 elsif p_accion='recibir_salida' then
  -- Authenticated fromMe event, mirrored from the linked phone; never enqueue a send.
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_estado is null or p_estado not in ('enviado','entregado')
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and origen='telefono')>=20 then return null;end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado,wa_id,wa_ruta,origen,entregado_at)
  values(p.id,'salida',p_texto,p_evento,p_jid,'aceptado',p_evento,p_jid,'telefono',case when p_estado='entregado' then now() end)
  on conflict do nothing;
  return jsonb_build_object('ok',true);
 elsif p_accion='tomar' then
  perform gestlok_chat_private.wai_pedido_tick(p);
  select x.jid into jid from gestlok_chat_private.wai_mensajes x join gestlok_chat_private.wai_pilotos q on q.id=x.piloto_id where x.direccion='entrada' and x.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester) order by x.creado_at desc,x.id desc limit 1;
  if jid is null then return null;end if;
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and (x.interaccion is null or p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2')) and (x.imagen_url is null or p_estado in ('opciones_imagen_v1','opciones_imagen_v2')) and (x.interaccion->>'tipo' is distinct from 'salsas' or p_estado='opciones_imagen_v2') order by x.creado_at,x.id limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'jid',jid,'texto',case when m.imagen_url is not null then '' else m.texto end,'imagen_url',m.imagen_url,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','multiple',coalesce((m.interaccion->>'multiple')::boolean,false),'opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v)) end);
 elsif p_accion='entrega' then
  if p_evento is null then return null; end if;
  update gestlok_chat_private.wai_mensajes set entregado_at=coalesce(entregado_at,now()) where piloto_id=p.id and direccion='salida' and wa_id=p_evento and estado='aceptado';
  if found then return jsonb_build_object('ok',true); end if;
  update gestlok_chat_private.wai_mensajes set accion_entregada_at=coalesce(accion_entregada_at,now()) where piloto_id=p.id and direccion='salida' and wa_accion_id=p_evento and accion_estado='enviado';
  return jsonb_build_object('ok',found);
 elsif p_accion='tomar_accion' then
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.accion_estado='pendiente' and x.wa_id is not null order by x.accion_solicitada_at,x.id limit 1 for update;
  if not found then return null;end if;
  -- No reintentar una corrección vencida ni una acción ya reservada.
  if (m.accion_tipo='editar' and m.creado_at<=now()-interval '15 minutes') or m.accion_solicitada_at<=now()-interval '60 seconds' then
    update gestlok_chat_private.wai_mensajes set accion_estado='incierto' where id=m.id;return null;
  end if;
  update gestlok_chat_private.wai_mensajes set accion_estado='reservado',accion_reservada_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'wa_id',m.wa_id,'ruta',m.wa_ruta,'tipo',m.accion_tipo,'texto',m.accion_texto);
 elsif p_accion='resultado_accion' then
  if p_estado not in ('aceptado','incierto') or p_estado is null or (p_estado='aceptado' and (p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$')) then return null; end if;
  update gestlok_chat_private.wai_mensajes
   set texto=case when p_estado='aceptado' then case when accion_tipo='editar' then accion_texto else 'Mensaje eliminado' end else texto end,
       editado_at=case when p_estado='aceptado' and accion_tipo='editar' then now() else editado_at end,
       eliminado_at=case when p_estado='aceptado' and accion_tipo='eliminar' then now() else eliminado_at end,
       accion_estado=case when p_estado='aceptado' then 'enviado' else 'incierto' end,
       wa_accion_id=case when p_estado='aceptado' then p_evento else null end,accion_texto=null
   where id=p_mensaje and piloto_id=p.id and direccion='salida' and accion_estado='reservado';
  return jsonb_build_object('ok',found);
 elsif p_accion='resultado' then
  if p_estado is null or p_estado not in ('aceptado','incierto') then return null;end if;
  if p_estado='aceptado' and (p_evento is not null or p_jid is not null) then
    if p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_jid is null
      or not (p_jid ~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or p_jid ~ '^[0-9]{1,20}@lid$')
      or (p_jid like '%@s.whatsapp.net' and gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester))
    then return null;end if;
  end if;
  update gestlok_chat_private.wai_mensajes set estado=p_estado,wa_id=case when p_estado='aceptado' then p_evento end,wa_ruta=case when p_estado='aceptado' then p_jid end where id=p_mensaje and piloto_id=p.id and direccion='salida' and estado='reservado' returning * into m;
  if not found then return jsonb_build_object('ok',false);end if;
  if p_estado='aceptado' and m.continuar_texto is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_pedido_encolar(p.id,'agente:continuar:'||m.id,m.continuar_texto);
  end if;
  if p_estado='aceptado' and (m.evento like 'pedido:%:preparacion' or m.evento like 'pedido:%:entregado') then
   perform gestlok_chat_private.wai_resena_invitar(p,o) from gestlok_chat_private.wai_pedidos o where o.hilo_id=gestlok_chat_private.wai_hilo(p) and m.evento in ('pedido:'||o.id||':preparacion','pedido:'||o.id||':entregado') and o.estado in ('preparacion','listo','en_camino','entregado');
  end if;
  -- Only append the next choices when the photo/link was accepted. No caption and no poll after an uncertain send.
  if p_estado='aceptado' and m.continuar_carta is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_agente_poll(p,'agente:continuar:'||m.id,'¿Qué te gustaría hacer ahora?',jsonb_build_object('opciones',m.continuar_carta)->'opciones');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 return null;
end$$;
