-- Carry only public menu items into the authorized WhatsApp checkout; no personal data requested in web menu.
create or replace function gestlok_chat_private.wai_menu_armar(p gestlok_chat_private.wai_pilotos,d jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare item jsonb; g jsonb; v jsonb; elig jsonb; gsel jsonb; seleccion jsonb; grupos jsonb; extras jsonb; linea jsonb; carrito jsonb:='[]'; o record; s gestlok_chat_private.sucursales; q int; necesario int; suma int; extra numeric; sub numeric; modo text; pago text; demora text; envio numeric; f jsonb;
begin
 if jsonb_typeof(d)<>'object' or octet_length(d::text)>20000 or jsonb_typeof(d->'lineas') is distinct from 'array' or jsonb_array_length(d->'lineas') not between 1 and 5 then return null;end if;
 for item in select value from jsonb_array_elements(d->'lineas') loop
  select * into o from gestlok_chat_private.wai_ofertas(p.sucursal_id,'menu_interactivo') x where x.id::text=item->>'id';
  if not found then return null;end if;
  select coalesce(jsonb_agg(z),'[]'::jsonb) into grupos from jsonb_array_elements(o.opciones) z where coalesce((z->>'obligatorio')::boolean,false);
  if jsonb_typeof(item->'grupos') is distinct from 'object' or (select count(*) from jsonb_object_keys(item->'grupos'))<>jsonb_array_length(grupos) then return null;end if;
  seleccion='[]';extras='[]';
  for g in select value from jsonb_array_elements(grupos) loop
   elig=item->'grupos'->(g->>'id'); if jsonb_typeof(elig) is distinct from 'object' then return null;end if;
   necesario=case when g->>'tipo'='cantidad' then (g->>'total')::int else 1 end;suma=0;gsel='[]';
   for v in select value from jsonb_array_elements(g->'valores') loop
    if elig ? (v->>'id') then
     if coalesce(elig->>(v->>'id'),'') !~ '^[1-9][0-9]?$' then return null;end if;
     q=(elig->>(v->>'id'))::int;suma=suma+q;
     gsel=gsel||jsonb_build_array(jsonb_build_object('id',v->>'id','nombre',v->>'nombre','cantidad',q,'extra',coalesce((v->>'extra')::numeric,0)));
    end if;
   end loop;
   if suma<>necesario or jsonb_array_length(gsel)<>(select count(*) from jsonb_object_keys(elig)) then return null;end if;
   seleccion=seleccion||jsonb_build_array(jsonb_build_object('grupo',g->>'nombre','valores',gsel));
  end loop;
  linea=jsonb_build_object('producto',o.nombre,'producto_id',o.id,'precio',o.precio,'grupos',grupos,'selecciones',seleccion,'extras','[]'::jsonb,'carta','menu_interactivo');
  elig=coalesce(item->'salsas_extra','{}');
  if jsonb_typeof(elig)<>'object' then return null;end if;
  extra=gestlok_chat_private.wai_salsa_precio(p,linea);suma=0;
  for v in select value from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,linea),'[]')) loop
   if elig ? (v->>'id') then
    if extra is null or coalesce(elig->>(v->>'id'),'') !~ '^[1-9]$' then return null;end if;
    q=(elig->>(v->>'id'))::int;suma=suma+q;if suma>10 then return null;end if;
    for necesario in 1..q loop extras=extras||jsonb_build_array(jsonb_build_object('id','salsa_extra:'||(v->>'id'),'nombre',(v->>'nombre')||' (adicional)','precio',extra));end loop;
   end if;
  end loop;
  if exists(select 1 from jsonb_each_text(elig) z where z.value !~ '^[1-9]$' or not exists(select 1 from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,linea),'[]')) valor where valor->>'id'=z.key)) then return null;end if;
  carrito=carrito||jsonb_build_array(linea||jsonb_build_object('extras',extras));
 end loop;
 -- The menu only builds the product selection. Contact data and checkout stay on WhatsApp.
 f=jsonb_build_object('carrito',carrito,'estado','nombre');
 if not gestlok_chat_private.wai_carrito_vigente(p,f) then return null;end if;
 sub=gestlok_chat_private.wai_carrito_subtotal(f);
 return f||jsonb_build_object('subtotal',sub,'total',sub);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return null;
end$$;

create or replace function public.gestlok_chat_wai_menu_preparar(p_token uuid,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l gestlok_chat_private.wai_menu_accesos; p gestlok_chat_private.wai_pilotos; f jsonb; ref uuid;
begin
 select * into l from gestlok_chat_private.wai_menu_accesos where id=p_token for update;
 p=gestlok_chat_private.wai_menu_piloto(p_token);
 if p.id is null then return jsonb_build_object('ok',false,'error','El acceso venció. Pedí otra carta por WhatsApp.');end if;
 f=gestlok_chat_private.wai_menu_armar(p,p_datos);
 if f is null then return jsonb_build_object('ok',false,'error','Revisá los gustos y cantidades. Algún producto o condición pudo cambiar.');end if;
 -- Do not accept altered totals displayed in the web. Customer can refresh
 -- and review current price if price changed while the menu was open.
 if coalesce(p_datos->>'total','') !~ '^[0-9]+(\.[0-9]{1,2})?$' or (p_datos->>'total')::numeric is distinct from (f->>'total')::numeric then
  return jsonb_build_object('ok',false,'error','El total cambió. Volvé a cargar la carta para revisar los precios.');end if;
 if l.referencia is not null then
  if l.ficha is distinct from f then return jsonb_build_object('ok',false,'error','Ya preparaste un pedido con este acceso. Pedí una carta nueva para cambiarlo.');end if;
  ref=l.referencia;
 else
  ref=gen_random_uuid();update gestlok_chat_private.wai_menu_accesos set referencia=ref,ficha=f where id=l.id;
 end if;
 return jsonb_build_object('ok',true,'referencia',ref,'total',f->'total');
end$$;

create or replace function gestlok_chat_private.wai_menu_recibir(p gestlok_chat_private.wai_pilotos,m gestlok_chat_private.wai_mensajes)
returns boolean language plpgsql set search_path='' as $$
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
 f=l.ficha;select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo or s.demora_envio is distinct from f->>'demora')) or (f->>'modalidad'='retiro' and (not s.acepta_retiro or s.demora_retiro is distinct from f->>'demora')) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'La carta o las condiciones cambiaron. Pedí una carta nueva para revisar tu pedido.');
 end if;
 if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Pedido recibido por '||gestlok_chat_private.wai_importe((f->>'total')::numeric)||'. Demora aproximada: '||(f->>'demora')||'. Pendiente de confirmación del gerente.') then return false;end if;
 update gestlok_chat_private.wai_menu_accesos set usado_at=clock_timestamp() where id=l.id;
 update gestlok_chat_private.wai_atencion_hilos set ficha=f||jsonb_build_object('estado','pendiente','espera',e),modalidad=f->>'modalidad',pedido_solicitado_at=clock_timestamp(),pedido_texto=left((select string_agg(x->>'producto',', ') from jsonb_array_elements(f->'carrito') x),500),pendiente=true,manual=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
 return true;
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
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Recibimos tu solicitud. Demora aproximada: '||coalesce(f->>'demora','a confirmar por el comercio')||'. Pronto el gerente confirmará el pedido y comenzará a prepararlo.');
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
end$$;


-- Incoming photos are PRIVATE. They are not stored in the public menu-image
-- field, and the polling endpoint never includes image bytes.
alter table gestlok_chat_private.wai_mensajes add column if not exists adjunto_estado text check(adjunto_estado in ('imagen','no_disponible'));
create table if not exists gestlok_chat_private.wai_adjuntos_imagen (
 mensaje_id uuid primary key references gestlok_chat_private.wai_mensajes(id) on delete cascade,
 mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 contenido bytea not null check(octet_length(contenido) between 12 and 2097152),
 creado_at timestamptz not null default now()
);
alter table gestlok_chat_private.wai_adjuntos_imagen enable row level security;
revoke all on gestlok_chat_private.wai_adjuntos_imagen from public,anon,authenticated;

-- Dedicated connector capability, using exactly the same verified line,
-- revision, sender and active trial requirements as text reception.
create or replace function public.gestlok_chat_wai_recibir_imagen(p_id uuid,p_clave text,p_revision uuid,p_piloto uuid,p_jid text,p_evento text,p_texto text default null,p_mime text default null,p_base64 text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos; entrada uuid; bytes bytea; formato text; estado_foto text:='no_disponible'; pie text;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 select * into p from gestlok_chat_private.wai_pilotos x where x.id=p_piloto and x.habilitacion_id=p_id and gestlok_chat_private.wai_piloto_vigente(x) for update;
 if not found or p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
 or p_evento is null or length(p_evento) not between 1 and 200 or length(coalesce(p_texto,''))>500 then return null;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='entrada' and m.evento=p_evento) then return jsonb_build_object('ok',true);end if;
 if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='entrada')>=40 then return null;end if;
 if p_base64 is not null then
  -- Fail closed on oversized or non-image payloads; keep a visible notice
  -- of the event so a manager can ask for a resend without guessing.
  if length(p_base64)<=2796204 and p_mime in ('image/jpeg','image/png','image/webp') then
   begin
    bytes=decode(p_base64,'base64');
    if octet_length(bytes) between 12 and 2097152 then
     formato=case when substring(bytes from 1 for 3)=decode('ffd8ff','hex') then 'image/jpeg'
      when substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex') then 'image/png'
      when substring(bytes from 1 for 4)=convert_to('RIFF','UTF8') and substring(bytes from 9 for 4)=convert_to('WEBP','UTF8') then 'image/webp' end;
     if formato=p_mime then estado_foto='imagen';end if;
    end if;
   exception when invalid_parameter_value or invalid_text_representation then bytes=null;end;
  end if;
 end if;
 perform gestlok_chat_private.wai_cierre_tick(p);
 -- Pass neutral text to ciclo_entrada so that a photo or a caption cannot
 -- accidentally declare a cash payment, create a draft, or confirm an order.
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado,agente_procesado_at,adjunto_estado)
 values(p.id,'entrada','Imagen recibida',p_evento,p_jid,'recibido',clock_timestamp(),estado_foto) returning id into entrada;
 perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
 pie=nullif(btrim(coalesce(p_texto,'')),'');
 update gestlok_chat_private.wai_mensajes set texto=case when estado_foto='imagen' then coalesce(pie,'Imagen recibida') else concat_ws(' · ','Imagen recibida, no disponible. Pedí reenviarla.',pie) end where id=entrada;
 if estado_foto='imagen' then insert into gestlok_chat_private.wai_adjuntos_imagen(mensaje_id,mime,contenido) values(entrada,formato,bytes);end if;
 return jsonb_build_object('ok',true,'adjunto_estado',estado_foto);
end$$;
revoke all on function public.gestlok_chat_wai_recibir_imagen(uuid,text,uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_recibir_imagen(uuid,text,uuid,uuid,text,text,text,text,text) to anon,authenticated;

-- Only logged-in staff authorized to manage this specific local may retrieve
-- an original photo, including archived chats. No public URLs or tokens.
create or replace function public.gestlok_chat_wai_adjunto_imagen(p_sucursal uuid,p_mensaje uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if auth.uid() is null or not coalesce(gestlok_chat_private.wai_portal_nivel(p_sucursal) in ('gestionar','configurar'),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 select jsonb_build_object('mime',a.mime,'base64',replace(encode(a.contenido,'base64'),chr(10),''))
 into r from gestlok_chat_private.wai_adjuntos_imagen a join gestlok_chat_private.wai_mensajes m on m.id=a.mensaje_id
 join gestlok_chat_private.wai_pilotos p on p.id=m.piloto_id where m.id=p_mensaje and p.sucursal_id=p_sucursal and m.direccion='entrada' and m.adjunto_estado='imagen';
 return r;
end$$;
revoke all on function public.gestlok_chat_wai_adjunto_imagen(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_adjunto_imagen(uuid,uuid) to authenticated;
create or replace function public.gestlok_chat_wai_bandeja(p_sucursal uuid,p_accion text default 'listar',p_piloto uuid default null,p_texto text default null,p_evento text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos%rowtype; a gestlok_chat_private.wai_pilotos%rowtype; resultado jsonb;
begin
 if gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_accion='listar' then
  -- Also evaluate inactive cycles when the manager visits while the connector is offline.
  for p in select q.* from gestlok_chat_private.wai_pilotos q where q.sucursal_id=p_sucursal and not exists(select 1 from gestlok_chat_private.wai_pilotos pv where pv.sucursal_id=q.sucursal_id and pv.habilitacion_id=q.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(pv.tester)=gestlok_chat_private.whatsapp_exclusion_key(q.tester) and gestlok_chat_private.wai_piloto_vigente(pv)) and q.id=gestlok_chat_private.wai_hilo(q) and exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=gestlok_chat_private.wai_hilo(q)) order by q.id for update skip locked loop
   perform gestlok_chat_private.wai_cierre_tick(p);
  end loop;
 end if;
 if p_accion='responder' then
  select * into a from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal;
  if not found then raise exception 'Conversación no disponible' using errcode='22023';end if;
  select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
  if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
  if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.cerrado_at is not null) then raise exception 'Conversación finalizada. Esperá un mensaje nuevo';end if;
  if p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_evento is null or p_evento !~ '^[a-f0-9-]{36}$' then raise exception 'Respuesta inválida' using errcode='22023';end if;
  if not exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds')
    or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester))
    then raise exception 'Esperá un mensaje de prueba y una conexión activa' using errcode='22023';end if;
  if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='salida' and m.origen is distinct from 'telefono') >=40 then raise exception 'Límite de respuestas de prueba' using errcode='22023';end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,creado_por,origen) values(p.id,'salida',btrim(p_texto),'pendiente',p_evento,auth.uid(),'wai') on conflict(piloto_id,direccion,evento) do nothing;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida' using errcode='22023';end if;
 with candidatos as (
   select x.*,gestlok_chat_private.whatsapp_exclusion_key(x.tester) as numero_clave
   from gestlok_chat_private.wai_pilotos x where x.sucursal_id=p_sucursal
 ), hilos as (
   select x.habilitacion_id,x.numero_clave,(array_agg(x.id order by x.creado_at,x.id))[1] as id,
     (array_agg(x.tester order by x.creado_at desc,x.id desc))[1] as cliente,
     max(x.creado_at) as fecha
   from candidatos x group by x.habilitacion_id,x.numero_clave
   having bool_or(exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=x.id)
       or (not x.cancelado and x.vence_at>now() and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)))
 ), datos as (
   select h.id,h.habilitacion_id,h.numero_clave,h.cliente,h.fecha,cur.id as piloto_activo,cur.vence_at,
       coalesce(cur.vigente,false) as conexion_activa,
       coalesce(cur.vigente,false)
        and exists(select 1 from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id where q.habilitacion_id=h.habilitacion_id and q.numero_clave=h.numero_clave and m.direccion='entrada')
        and (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=cur.id and m.direccion='salida' and m.origen is distinct from 'telefono')<40 as puede_responder
   from hilos h left join lateral (
    select q.id,q.vence_at,gestlok_chat_private.wai_piloto_vigente(x) as vigente from candidatos q join gestlok_chat_private.wai_pilotos x on x.id=q.id
    where q.habilitacion_id=h.habilitacion_id and q.numero_clave=h.numero_clave and not q.cancelado and q.vence_at>now()
    order by q.creado_at desc,q.id desc limit 1
   ) cur on true
 )
 select jsonb_build_object('chats',coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'linea',d.habilitacion_id,'cliente',d.cliente,'piloto_activo',d.piloto_activo,'vence_at',d.vence_at,
   'conexion_activa',d.conexion_activa,
   'alerta_sync',(select q.alerta_sync from candidatos q where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave and q.alerta_sync_at is not null order by q.alerta_sync_at desc limit 1),
   'alerta_sync_at',(select max(q.alerta_sync_at) from candidatos q where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave),
   'aviso_cierre',(select ci.aviso_cierre from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id),
   'aviso_cierre_estado',(select case when m.estado='aceptado' and m.entregado_at is not null then 'entregado' when m.estado='pendiente' and (q.cancelado or q.vence_at<=now()) then 'incierto' when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' else m.estado end from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id join gestlok_chat_private.wai_atencion_hilos wh on wh.hilo_id=d.id and m.evento='cierre:'||wh.ciclo_id where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave order by m.creado_at desc limit 1),'archivado',d.piloto_activo is null,'puede_operar_pedido',d.puede_responder,'puede_responder',d.puede_responder and not exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id and ci.cerrado_at is not null),
   'agente_activo',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'agente_activo')::boolean,
   'seguimiento_min',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'seguimiento_min')::int,
   'pedido_pendiente',exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id and wh.pedido_solicitado_at is not null),
   'ficha',(select wh.ficha from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),
   'pedido_texto',(select wh.pedido_texto from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),
   'imagenes_activas',d.conexion_activa and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=d.habilitacion_id and w.imagenes_at>now()-interval '30 seconds' and w.imagenes_at>=w.solicitada_at),
   'modalidad_detectada',(select wh.modalidad from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=d.id),
   'ciclo_activo',(select wh.ciclo_id from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=d.id),
   'cerrado_at',(select ci.cerrado_at from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id),
   'ciclos',coalesce((select jsonb_agg(jsonb_build_object('id',ci.id,'inicio_at',ci.inicio_at,'cerrado_at',ci.cerrado_at,'motivo',ci.motivo) order by ci.inicio_at) from gestlok_chat_private.wai_ciclos ci where ci.hilo_id=d.id),'[]'::jsonb),
   'alias',(select ac.alias from gestlok_chat_private.wai_alias_contactos ac where ac.sucursal_id=p_sucursal and ac.numero_clave=d.numero_clave),
   'nombre_agenda',(select ac.nombre from gestlok_chat_private.wai_nombres_agenda ac where ac.habilitacion_id=d.habilitacion_id and ac.numero_clave=d.numero_clave),
   'opciones_activas',d.conexion_activa and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=d.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at),
   'atencion_manual',coalesce((select wh.manual from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'atencion_pendiente',coalesce((select wh.pendiente from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'pedidos_habilitados',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean,
   'resena_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url')),
   'transferencia_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and length(btrim(s.datos_transferencia))>0),
   'reclamo_pendiente',exists(select 1 from gestlok_chat_private.wai_pedidos o where o.hilo_id=d.id and o.valoracion='problema' and o.resuelto_at is null),
   'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'ficha',o.ficha,'estado',o.estado,'modalidad',o.modalidad,'demora_min',o.demora_min,'creado_at',o.creado_at,'atencion_finalizada_at',o.atencion_finalizada_at,'consulta_at',o.consulta_at,'consulta_encolada',o.consulta_enviada_at is not null and o.consulta_cancelada_at is null,'consulta_cancelada',o.consulta_cancelada_at is not null,'consulta_vencida',not gestlok_chat_private.wai_pedido_consentimiento(pv),'valoracion',o.valoracion,'resuelto',o.resuelto_at is not null,'detalle',o.detalle,'tiene_foto',o.foto is not null) order by o.creado_at desc,o.id) from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos pv on pv.id=o.piloto_id where o.hilo_id=d.id),'[]'::jsonb),
   'mensajes',hist.mensajes
 ) order by coalesce(hist.ultima_fecha,d.fecha) desc,d.id),'[]'::jsonb)) into resultado
 from datos d cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'piloto',m.piloto_id,'ciclo_id',m.ciclo_id,'imagen_url',m.imagen_url,'adjunto_estado',m.adjunto_estado,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v),'seleccion',m.opcion_elegida,'estado_votacion',gestlok_chat_private.wai_votacion_estado(m),'multiple',coalesce((m.interaccion->>'multiple')::boolean,false),'cantidad',m.interaccion->'cantidad') end,'origen',case when m.direccion='entrada' and m.evento like 'pedido:%' then 'valoracion' when m.direccion='entrada' and (m.evento like 'voto:%' or m.evento like 'agente-voto:%') then 'opcion' else m.origen end,'direccion',m.direccion,'texto',m.texto,'entregado',m.entregado_at is not null,'editado',m.editado_at is not null,'eliminado',m.eliminado_at is not null,
     'accion_tipo',m.accion_tipo,'accion_estado',case when m.accion_estado='reservado' and m.accion_reservada_at<now()-interval '45 seconds' then 'incierto' when m.accion_estado='pendiente' and m.accion_solicitada_at<now()-interval '60 seconds' then 'incierto' else m.accion_estado end,'accion_entregada',m.accion_entregada_at is not null,
     'puede_editar',m.interaccion is null and m.imagen_url is null and d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and m.creado_at>now()-interval '15 minutes' and (m.accion_estado is null or m.accion_estado='enviado'),
     'puede_eliminar',m.interaccion is null and d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and (m.accion_estado is null or m.accion_estado='enviado'),
     'leido',case when m.direccion='entrada' then exists(select 1 from gestlok_chat_private.wai_lecturas l where l.mensaje_id=m.id and l.usuario_id=auth.uid()) else true end,
     'evento',case when m.direccion='salida' then m.evento end,
     'estado',case when m.cancelada_at is not null then 'cancelado' when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' when m.estado='pendiente' and (q.cancelado or q.vence_at<=now()) then 'incierto' else m.estado end,
     'fecha',m.creado_at
   ) order by m.creado_at,m.id),'[]'::jsonb) as mensajes,max(m.creado_at) as ultima_fecha
   from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id
   where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave
 ) hist;
 return resultado;
end$$;