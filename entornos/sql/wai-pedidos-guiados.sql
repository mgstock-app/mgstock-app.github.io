-- Structured orders are scoped to the current conversation and business.
alter table gestlok_chat_private.wai_atencion_hilos add column if not exists ultima_carta text;
alter table gestlok_chat_private.wai_atencion_hilos add column if not exists ficha jsonb;
alter table gestlok_chat_private.wai_pedidos add column if not exists ficha jsonb;
alter table gestlok_chat_private.wai_carta_paginas add column if not exists categorias text[] not null default '{}';
alter table gestlok_chat_private.wai_carta_paginas add column if not exists productos_nombres text[] not null default '{}';
alter table gestlok_chat_private.wai_carta_paginas add column if not exists detalle_clave text;
alter table gestlok_chat_private.wai_carta_paginas add column if not exists detalle_grupo text;
alter table gestlok_chat_private.wai_mensajes add column if not exists continuar_texto text;
create or replace function gestlok_chat_private.wai_importe(n numeric)
returns text language sql immutable set search_path='' as $$
 select '$'||replace(to_char(trunc(n),'FM999,999,999,990'),',','.')||case when n<>trunc(n) then ','||lpad((round((n-trunc(n))*100))::text,2,'0') else '' end
$$;
-- The input is scanned from left to right against complete configured names. A
-- shorter name (e.g. Pollo) cannot consume a longer name (Pollo al Champignon).
create or replace function gestlok_chat_private.wai_leer_cantidades(t text, valores jsonb, total int)
returns jsonb language plpgsql immutable set search_path='' as $$
declare n text:=gestlok_chat_private.wai_normalizar(t); v jsonb; nom text; q int; cuenta int:=0; r jsonb:='[]'; m text[]; w text;
begin
 while n<>'' loop
  n=regexp_replace(n,'^(y|mas) +','');
  if n='' then return null;end if;
  q=1;
  m=regexp_match(n,'^(\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|veinte) +');
  if m is not null then
   w=m[1]; q=case w when 'un' then 1 when 'uno' then 1 when 'una' then 1 when 'dos' then 2 when 'tres' then 3 when 'cuatro' then 4 when 'cinco' then 5 when 'seis' then 6 when 'siete' then 7 when 'ocho' then 8 when 'nueve' then 9 when 'diez' then 10 when 'once' then 11 when 'doce' then 12 when 'trece' then 13 when 'catorce' then 14 when 'quince' then 15 when 'dieciseis' then 16 when 'diecisiete' then 17 when 'dieciocho' then 18 when 'veinte' then 20 else w::int end;
   n=regexp_replace(substr(n,length(w)+2),'^de +','');
  end if;
  select x,gestlok_chat_private.wai_normalizar(x->>'nombre') into v,nom
  from jsonb_array_elements(valores) x where n=gestlok_chat_private.wai_normalizar(x->>'nombre') or starts_with(n,gestlok_chat_private.wai_normalizar(x->>'nombre')||' ')
  order by length(gestlok_chat_private.wai_normalizar(x->>'nombre')) desc limit 1;
  if v is null or q<1 or cuenta+q>total then return null;end if;
  cuenta=cuenta+q;
  r=r||jsonb_build_array(jsonb_build_object('id',v->>'id','nombre',v->>'nombre','cantidad',q,'extra',coalesce((v->>'extra')::numeric,0)));
  n=btrim(substr(n,length(nom)+1));
 end loop;
 if cuenta<>total then return null;end if;
 return r;
end$$;
-- Only named categories attached to the selected image are used. Extras come
-- from the business's catalog, never from a global hard-coded price list.
create or replace function gestlok_chat_private.wai_ofertas(s uuid, carta text, extra text default null)
returns table(id uuid,nombre text,precio numeric,opciones jsonb,reglas jsonb,orden integer)
language sql stable set search_path='' as $$
 select p.id,p.nombre,p.precio,p.opciones,p.reglas,p.orden
 from gestlok_chat_private.productos p join gestlok_chat_private.categorias c on c.id=p.categoria_id
 where p.sucursal_id=s and p.activo and p.disponible and c.activa
 and not (p.reglas ? 'cuando')
 and (case when extra is not null then gestlok_chat_private.wai_normalizar(c.nombre)=extra else
   exists(select 1 from gestlok_chat_private.wai_carta_paginas w where w.sucursal_id=s and 'carta_'||w.clave=carta
    and c.nombre=any(w.categorias) and (cardinality(w.productos_nombres)=0 or p.nombre=any(w.productos_nombres))) end)
 order by p.orden,jsonb_array_length(p.opciones),p.precio,p.nombre,p.id
$$;
create or replace function gestlok_chat_private.wai_ficha_opciones(s uuid,carta text,extra text,desde int)
returns jsonb language sql stable set search_path='' as $$
 with q as (select * from gestlok_chat_private.wai_ofertas(s,carta,extra) offset desde limit 6), primeras as (select * from q limit 5)
 select coalesce((select jsonb_agg(jsonb_build_object('id','of_'||replace(id::text,'-',''),'label',left(nombre,60-length(gestlok_chat_private.wai_importe(precio))-3)||' · '||gestlok_chat_private.wai_importe(precio))) from primeras),'[]'::jsonb)
 ||case when (select count(*) from q)>5 then '[{"id":"f_mas","label":"Ver más opciones"}]'::jsonb when extra is not null then '[{"id":"f_volver","label":"No agregar"}]'::jsonb else '[{"id":"f_volver","label":"Volver a las promociones"}]'::jsonb end
$$;
create or replace function gestlok_chat_private.wai_ficha_avanzar(p gestlok_chat_private.wai_pilotos,e text,f jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare g jsonb; vs jsonb; q int; k int; foto text; pregunta text; opts jsonb; ok boolean; v jsonb;
begin
 k=coalesce((f->>'grupo')::int,0);
 g=f->'grupos'->k;
 if g is null then
  f=f||jsonb_build_object('estado','extras','grupo',k,'parcial','[]'::jsonb);
  ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Querés agregar una bebida o un postre?', '[{"id":"f_bebidas","label":"Agregar bebida"},{"id":"f_postres","label":"Agregar postre"},{"id":"f_sin","label":"No, continuar"}]'::jsonb);
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
   elsif jsonb_array_length(vs) between 2 and 6 then
    select jsonb_agg(jsonb_build_object('id','g_'||(x->>'id'),'label',left(x->>'nombre',60))) into opts from jsonb_array_elements(vs) x;
    ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí '||(g->>'nombre')||' (1 de '||q||')',opts);
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
 x record; g jsonb; v jsonb; partes jsonb; opts jsonb; q int; parcial int; k int; desde int; extra text; modo text; pago text; pagos text[]; demora text; envio numeric; sub numeric; monto numeric; ok boolean:=false; pregunta text; resumen text; ficha_nueva jsonb;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=h for update;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 f=a.ficha; st=f->>'estado';
 if m.evento like 'agente-voto:%' then
  voto=split_part(m.evento,':',3);
  select evento into de_evento from gestlok_chat_private.wai_mensajes where id::text=split_part(m.evento,':',2) and piloto_id=p.id;
 end if;
 if st='pendiente' then
  if voto is not null then return true;end if;
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'Tu pedido está pendiente de confirmación del comercio. Si necesitás cambiar algo, el gerente revisará tu mensaje.');
 end if;
 if st='revision' then return false;end if;
 if st='confirmado' then
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=h and estado<>'entregado') then return false;end if;
  if voto='pedido' or n ~ '^(quiero |quisiera )?(hacer un pedido|pedir)$' then f=null;st=null;else return false;end if;
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
 elsif voto='f_humano' or (n ~ '\m(humano|gerente|persona|cancelar)\M' and voto is null) then
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
  elsif voto='f_volver' then
   opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',null,0);ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué promoción o producto de la imagen te interesó?',opts);f=f||jsonb_build_object('desde',0);
  else
   select * into x from gestlok_chat_private.wai_ofertas(s.id,f->>'carta',extra) o
    where (voto='of_'||replace(o.id::text,'-','') or (voto is null and (n=gestlok_chat_private.wai_normalizar(o.nombre) or n=gestlok_chat_private.wai_normalizar('pack '||substring(o.nombre from '^Pack ([0-9]+)') ) and o.nombre !~* 'lata')))
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
  elsif voto is null then partes=gestlok_chat_private.wai_leer_cantidades(t,g->'valores',q);end if;
  if partes is null then
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,left('Necesito exactamente '||q||' de '||(g->>'nombre')||'. Escribí todas las cantidades y nombres de la carta. Opciones: '||(select string_agg(z->>'nombre',', ') from jsonb_array_elements(g->'valores') z),1000));
  else
   partes=case when voto is not null then f->'parcial'||partes else partes end;
   select sum((z->>'cantidad')::int) into parcial from jsonb_array_elements(partes) z;
   if parcial>=q then
    f=jsonb_set(f,'{selecciones}',f->'selecciones'||jsonb_build_array(jsonb_build_object('grupo',g->>'nombre','valores',partes)));
    f=f||jsonb_build_object('grupo',k+1,'parcial','[]'::jsonb);f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
   else
    f=jsonb_set(f,'{parcial}',partes);
    select jsonb_agg(jsonb_build_object('id','g_'||(z->>'id'),'label',left(z->>'nombre',60))) into opts from jsonb_array_elements(g->'valores') z;
    ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí '||(g->>'nombre')||' ('||(parcial+1)||' de '||q||')',opts);
   end if;
  end if;
 elsif st='extras' then
  if voto in ('f_bebidas','f_postres') then
   extra=substr(voto,3);opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',extra,0);
   if jsonb_array_length(opts)<2 then
    ok=gestlok_chat_private.wai_agente_poll(p,e,'No hay opciones de esa categoría disponibles. ¿Querés agregar algo más?', '[{"id":"f_bebidas","label":"Agregar bebida"},{"id":"f_postres","label":"Agregar postre"},{"id":"f_sin","label":"Continuar sin agregar"}]'::jsonb);
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí qué querés agregar',opts);f=f||jsonb_build_object('estado','extra_producto','extra_tipo',extra,'desde',0);end if;
  elsif voto='f_sin' or n in ('no','no gracias','sin adicionales','nada') then
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! ¿A nombre de quién hacemos el pedido?');f=f||jsonb_build_object('estado','nombre');
  else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Querés agregar una bebida o un postre?', '[{"id":"f_bebidas","label":"Agregar bebida"},{"id":"f_postres","label":"Agregar postre"},{"id":"f_sin","label":"No, continuar"}]'::jsonb);end if;
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
   sub=(f->>'precio')::numeric+coalesce((select sum((z->>'cantidad')::int*(z->>'extra')::numeric) from jsonb_array_elements(f->'selecciones') g1 cross join lateral jsonb_array_elements(g1->'valores') z),0)+coalesce((select sum((z->>'precio')::numeric) from jsonb_array_elements(f->'extras') z),0);
   envio=case when f->>'modalidad'='delivery' then s.envio_costo else 0 end;
   demora=case when f->>'modalidad'='delivery' then s.demora_envio else s.demora_retiro end;
   if (f->>'modalidad'='delivery' and not s.acepta_envio) or (f->>'modalidad'='retiro' and not s.acepta_retiro) or coalesce(btrim(demora),'')='' or (f->>'modalidad'='delivery' and sub<s.pedido_minimo) then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio debe confirmar las condiciones de tu pedido antes de calcular el total. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
   else
    monto=sub+envio;
    f=f||jsonb_build_object('estado','pendiente','pago',pago,'subtotal',sub,'envio',envio,'total',monto,'demora',demora);
    resumen=(f->>'producto')||chr(10)||coalesce((select string_agg((g1->>'grupo')||': '||(select string_agg((z->>'cantidad')||' × '||(z->>'nombre'),', ') from jsonb_array_elements(g1->'valores') z),chr(10)) from jsonb_array_elements(f->'selecciones') g1),'')||case when jsonb_array_length(f->'extras')>0 then chr(10)||'Adicionales: '||(select string_agg(z->>'nombre',', ') from jsonb_array_elements(f->'extras') z) else '' end;
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,left('¡Gracias, '||(f->>'nombre')||'! Tu pedido:'||chr(10)||left(resumen,580)||chr(10)||'Total: '||gestlok_chat_private.wai_importe(monto)||case when f->>'modalidad'='delivery' then ' con envío incluido ('||gestlok_chat_private.wai_importe(envio)||')' else ' · Retiro en el local' end||'. Demora aproximada: '||demora||'. Pago: '||replace(pago,'_',' ')||'. Pronto el gerente confirmará tu pedido; por ahora está pendiente de confirmación.',1000));
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
 update gestlok_chat_private.wai_atencion_hilos set ficha=f||jsonb_build_object('espera',e),modalidad=f->>'modalidad',
 pedido_solicitado_at=case when f->>'estado'='pendiente' then clock_timestamp() end,
 pedido_texto=case when f->>'estado'='pendiente' then left(f->>'producto',500) end,
 pendiente=f->>'estado' in ('revision','pendiente'),manual=f->>'estado'='revision',actualizado_at=clock_timestamp() where hilo_id=h;
 return true;
end$$;
revoke all on function gestlok_chat_private.wai_importe(numeric),gestlok_chat_private.wai_leer_cantidades(text,jsonb,int),gestlok_chat_private.wai_ofertas(uuid,text,text),gestlok_chat_private.wai_ficha_opciones(uuid,text,text,int),gestlok_chat_private.wai_ficha_avanzar(gestlok_chat_private.wai_pilotos,text,jsonb),gestlok_chat_private.wai_pedido_guiado(gestlok_chat_private.wai_pilotos,gestlok_chat_private.wai_mensajes) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_pedido_encolar(p_piloto uuid,p_evento text,p_texto text)
returns boolean language plpgsql set search_path='' as $$
begin
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p_piloto and m.direccion='salida' and m.evento=p_evento) then return true;end if;
 if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p_piloto and m.direccion='salida' and m.origen is distinct from 'telefono') >=40 then return false;end if;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,origen)
 values(p_piloto,'salida',p_texto,'pendiente',p_evento,'wai') on conflict(piloto_id,direccion,evento) do nothing;
 return true;
end$$;
create or replace function gestlok_chat_private.wai_ciclo_entrada(p gestlok_chat_private.wai_pilotos,m uuid,modo text default null)
returns void language plpgsql set search_path='' as $$
declare h uuid; c uuid; t text; s gestlok_chat_private.sucursales%rowtype;
begin
 h=gestlok_chat_private.wai_hilo(p);
 select a.ciclo_id into c from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and ci.cerrado_at is null;
 if c is null then
  insert into gestlok_chat_private.wai_ciclos(hilo_id) values(h) returning id into c;
  insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,ciclo_id,manual,pendiente,modalidad,espera_modalidad,actualizado_at) values(h,c,false,false,null,false,clock_timestamp())
  on conflict(hilo_id) do update set ciclo_id=excluded.ciclo_id,manual=false,pendiente=false,modalidad=null,espera_modalidad=false,pedido_solicitado_at=null,pedido_texto=null,ficha=null,ultima_carta=null,actualizado_at=clock_timestamp();
 end if;
 select texto into t from gestlok_chat_private.wai_mensajes where id=m;
 if modo is null then modo=gestlok_chat_private.wai_modalidad(t);end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 update gestlok_chat_private.wai_mensajes set ciclo_id=c where id=m;
 if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=h and ficha is not null) and ((modo='retiro' and s.acepta_retiro) or (modo='delivery' and s.acepta_envio)) then
  update gestlok_chat_private.wai_atencion_hilos set modalidad=modo,espera_modalidad=false,actualizado_at=clock_timestamp() where hilo_id=h;
 end if;
 -- Persist a draft even when a manager has manually taken the conversation.
 if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=h and ficha is not null) and (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'pedidos')::boolean and gestlok_chat_private.wai_pedido_texto(p.sucursal_id,t,coalesce(modo,(select a.modalidad from gestlok_chat_private.wai_atencion_hilos a where a.hilo_id=h))) then
  update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=clock_timestamp(),pedido_texto=left(concat_ws(' · ',nullif(pedido_texto,''),t),500),actualizado_at=clock_timestamp() where hilo_id=h;
 end if;
end$$;
create or replace function gestlok_chat_private.wai_encolar_foto(p gestlok_chat_private.wai_pilotos,e text,pagina jsonb)
returns boolean language plpgsql set search_path='' as $$
declare u text; t text; ok boolean; paginas jsonb; opciones jsonb; cfg jsonb;
begin
 u=pagina->>'url';if not gestlok_chat_private.wai_imagen_permitida(p.sucursal_id,u) then return false;end if;
 update gestlok_chat_private.wai_atencion_hilos set ultima_carta=pagina->>'id' where hilo_id=gestlok_chat_private.wai_hilo(p);
 t=left('Carta: '||(pagina->>'label'),1000);
 paginas=gestlok_chat_private.wai_menu_paginas(p.sucursal_id);
 cfg=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);
 opciones=case when jsonb_array_length(paginas)>1 then jsonb_build_array(jsonb_build_object('id','menu_mas','label',case when exists(select 1 from jsonb_array_elements(paginas) v where lower(v->>'label') like '%promo%') then 'Ver otras promociones' else 'Ver otras opciones de la carta' end)) else '[{"id":"catalogo_texto","label":"Ver productos y precios"}]'::jsonb end;
 if (cfg->>'pedidos')::boolean then opciones=opciones||'[{"id":"pedido","label":"Hacer un pedido"}]'::jsonb;else opciones=opciones||'[{"id":"humano","label":"Hablar con una persona"}]'::jsonb;end if;
 if not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.imagenes_at>now()-interval '30 seconds' and w.imagenes_at>=w.solicitada_at) then
  ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,t||chr(10)||u);
  if ok then update gestlok_chat_private.wai_mensajes set continuar_carta=opciones where piloto_id=p.id and direccion='salida' and evento=e and estado='pendiente';end if;
  return ok;
 end if;
 ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,t);
 if ok then update gestlok_chat_private.wai_mensajes set imagen_url=u,continuar_carta=opciones where piloto_id=p.id and direccion='salida' and evento=e and estado='pendiente' and imagen_url is null;end if;
 return ok;
end$$;
create or replace function gestlok_chat_private.wai_agente_tick(p gestlok_chat_private.wai_pilotos)
returns void language plpgsql set search_path='' as $$
declare a gestlok_chat_private.wai_atencion_hilos%rowtype; s gestlok_chat_private.sucursales%rowtype; m gestlok_chat_private.wai_mensajes%rowtype;
 c jsonb; t text; n text; opciones jsonb; respuesta text; pregunta text; e text; ok boolean; modo text; handoff boolean; paginas jsonb; pagina jsonb; pedido boolean; pagina_id text; n_paginas int;
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
  if (c->>'pedidos')::boolean then
   begin
    if gestlok_chat_private.wai_pedido_guiado(p,m) then
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
  if pagina_id is not null then
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
end$$;
create or replace function public.gestlok_chat_wai_pedido(p_sucursal uuid,p_hilo uuid,p_accion text,p_pedido uuid default null,p_modalidad text default null,p_demora integer default 2,p_evento uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare a gestlok_chat_private.wai_pilotos%rowtype;p gestlok_chat_private.wai_pilotos%rowtype;o gestlok_chat_private.wai_pedidos%rowtype;s gestlok_chat_private.sucursales%rowtype;mensaje text;v_estado text;url text;f jsonb;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into a from gestlok_chat_private.wai_pilotos where id=p_hilo and sucursal_id=p_sucursal;
 if not found then raise exception 'Conversación no disponible';end if;
 -- Resolve to the stable oldest thread; prevent parallel orders via aliases.
 if a.id is distinct from (select x.id from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) order by x.creado_at,x.id limit 1) then raise exception 'Conversación no disponible';end if;
 if p_accion='resolver' then
  update gestlok_chat_private.wai_pedidos set resuelto_at=coalesce(resuelto_at,now()),actualizado_at=now()
   where id=p_pedido and hilo_id=a.id and valoracion='problema';
  return found;
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
  select wh.modalidad into p_modalidad from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=a.id;
  p_demora=(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'seguimiento_min')::integer;
  if p_evento is null or p_modalidad is null or (p_modalidad='retiro' and not s.acepta_retiro) or (p_modalidad='delivery' and not s.acepta_envio) then raise exception 'Esperá que el cliente confirme retiro o delivery';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and (estado<>'entregado' or valoracion='problema' and resuelto_at is null)) then raise exception 'Finalizá el pedido o el reclamo anterior';end if;
  insert into gestlok_chat_private.wai_pedidos(hilo_id,piloto_id,modalidad,demora_min,revision_evento,ciclo_id,ficha) values(a.id,p.id,p_modalidad,p_demora,p_evento,(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.id),case when f is null then null else f||'{"estado":"confirmado"}'::jsonb end) returning * into o;
  update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=null,pedido_texto=null,pendiente=false,ficha=case when f is null then null else f||'{"estado":"confirmado"}'::jsonb end,actualizado_at=clock_timestamp() where hilo_id=a.id;
  mensaje='¡Recibimos tu pedido! Ya está confirmado y en preparación. Modalidad: '||case o.modalidad when 'retiro' then 'retiro en el local.' else 'delivery.' end;
  url=s.mensajes->>'resena_url';
  if gestlok_chat_private.url_resena_valida(url) then
   mensaje=mensaje||chr(10)||'Nos gustaría conocer tu experiencia. Podés dejarnos una reseña aquí: '||url;
  end if;
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
  update gestlok_chat_private.wai_pedidos set estado='entregado',actualizado_at=now(),
   piloto_id=case when consulta_enviada_at is null then p.id else piloto_id end,
   consulta_at=case when consulta_enviada_at is null then now()+make_interval(mins=>o.demora_min) else consulta_at end
   where id=o.id;
 else raise exception 'Acción inválida';end if;
 return true;
end$$;
create or replace function public.gestlok_chat_wai_atencion_accion(p_sucursal uuid,p_hilo uuid,p_accion text,p_evento uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare a gestlok_chat_private.wai_pilotos%rowtype;p gestlok_chat_private.wai_pilotos%rowtype;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into a from gestlok_chat_private.wai_pilotos where id=p_hilo and sucursal_id=p_sucursal;
 if not found or a.id is distinct from gestlok_chat_private.wai_hilo(a) then raise exception 'Conversación no disponible';end if;
 if p_accion='descartar_pedido' then
  perform 1 from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() for update;
  update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=null,pedido_texto=null,ficha=null,ultima_carta=null,pendiente=false,actualizado_at=clock_timestamp() where hilo_id=a.id;
  return found;
 end if;
 if p_accion='finalizar' then
  perform 1 from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() for update;
  if not gestlok_chat_private.wai_cerrar_hilo(a.id,'manual') then raise exception 'No hay una conversación abierta o quedan pedidos, reclamos o solicitudes pendientes';end if;
  return true;
 end if;
 if p_accion in ('manual','asistido','atendido') then
  -- Serialize takeover with the connector's claims. A message already in flight
  -- cannot be recalled, but pending non-order automatic replies are canceled.
  perform 1 from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() for update;
  if p_accion='atendido' then update gestlok_chat_private.wai_atencion_hilos set pendiente=false,actualizado_at=now() where hilo_id=a.id;return true;end if;
  insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual) values(a.id,p_accion='manual')
  on conflict(hilo_id) do update set manual=excluded.manual,actualizado_at=now();
  if p_accion='manual' then
   update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.id) and direccion='entrada' and agente_procesado_at is null;
   update gestlok_chat_private.wai_mensajes m set cancelada_at=now() from gestlok_chat_private.wai_pilotos q
    where m.piloto_id=q.id and q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester)
      and m.estado='pendiente' and m.cancelada_at is null and (m.evento like 'menu:auto:%' or m.evento like 'menu:respuesta:%' or m.evento like 'agente:%');
  end if;
  return true;
 end if;
 if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=a.id and ci.cerrado_at is not null) then raise exception 'Conversación finalizada. Esperá un nuevo mensaje';end if;
 if p_accion is distinct from 'enviar' or p_evento is null then raise exception 'Acción inválida';end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester)) then raise exception 'Esperá una conexión y un mensaje autorizado';end if;
 if not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then raise exception 'Actualizá el conector para enviar opciones de WhatsApp';end if;
 if not gestlok_chat_private.wai_encolar_menu(p,'menu:'||p_evento,gestlok_chat_private.wai_atencion_ajustes(p_sucursal)) then raise exception 'Límite de respuestas de prueba';end if;
 return true;
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
  update gestlok_chat_private.wai_sesiones set opciones_at=case when p_estado in ('opciones_v1','opciones_imagen_v1') then now() else null end,imagenes_at=case when p_estado='opciones_imagen_v1' then now() else null end where habilitacion_id=p_id;
  perform gestlok_chat_private.wai_pedido_tick(p);
  perform gestlok_chat_private.wai_cierre_tick(p);
  if p_estado in ('opciones_v1','opciones_imagen_v1') then perform gestlok_chat_private.wai_atencion_tick(p);perform gestlok_chat_private.wai_agente_tick(p);end if; return jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp(),'salientes',coalesce((select jsonb_agg(jsonb_build_object('wa_id',sm.wa_id,'ruta',sm.wa_ruta,'accion_id',sm.wa_accion_id)) from gestlok_chat_private.wai_mensajes sm where sm.piloto_id=p.id and sm.direccion='salida' and sm.wa_id is not null),'[]'::jsonb));end if;
 if p_piloto is distinct from p.id then return null;end if;
 if p_accion='voto' then
  voto=gestlok_chat_private.wai_recibir_voto(p,p_jid,p_evento,p_texto);
  if coalesce((voto->>'ok')::boolean,false) then
   perform gestlok_chat_private.wai_atencion_tick(p);
   perform gestlok_chat_private.wai_agente_tick(p);
   perform gestlok_chat_private.wai_pedido_tick(p);
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
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and (x.interaccion is null or p_estado in ('opciones_v1','opciones_imagen_v1')) and (x.imagen_url is null or p_estado='opciones_imagen_v1') order by x.creado_at,x.id limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'jid',jid,'texto',case when m.imagen_url is not null then '' else m.texto end,'imagen_url',m.imagen_url,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v)) end);
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
  -- Only append the next choices when the photo/link was accepted. No caption and no poll after an uncertain send.
  if p_estado='aceptado' and m.continuar_carta is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_agente_poll(p,'agente:continuar:'||m.id,'¿Qué te gustaría hacer ahora?',jsonb_build_object('opciones',m.continuar_carta)->'opciones');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 return null;
end$$;
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
   'conexion_activa',d.conexion_activa,'archivado',d.piloto_activo is null,'puede_responder',d.puede_responder and not exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id and ci.cerrado_at is not null),
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
   'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'ficha',o.ficha,'estado',o.estado,'modalidad',o.modalidad,'demora_min',o.demora_min,'creado_at',o.creado_at,'consulta_at',o.consulta_at,'consulta_encolada',o.consulta_enviada_at is not null and o.consulta_cancelada_at is null,'consulta_cancelada',o.consulta_cancelada_at is not null,'consulta_vencida',not gestlok_chat_private.wai_pedido_consentimiento(pv),'valoracion',o.valoracion,'resuelto',o.resuelto_at is not null,'detalle',o.detalle,'tiene_foto',o.foto is not null) order by o.creado_at desc,o.id) from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos pv on pv.id=o.piloto_id where o.hilo_id=d.id),'[]'::jsonb),
   'mensajes',hist.mensajes
 ) order by coalesce(hist.ultima_fecha,d.fecha) desc,d.id),'[]'::jsonb)) into resultado
 from datos d cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'piloto',m.piloto_id,'ciclo_id',m.ciclo_id,'imagen_url',m.imagen_url,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v),'seleccion',m.opcion_elegida) end,'origen',case when m.direccion='entrada' and m.evento like 'pedido:%' then 'valoracion' when m.direccion='entrada' and (m.evento like 'voto:%' or m.evento like 'agente-voto:%') then 'opcion' else m.origen end,'direccion',m.direccion,'texto',m.texto,'entregado',m.entregado_at is not null,'editado',m.editado_at is not null,'eliminado',m.eliminado_at is not null,
     'accion_tipo',m.accion_tipo,'accion_estado',case when m.accion_estado='reservado' and m.accion_reservada_at<now()-interval '45 seconds' then 'incierto' when m.accion_estado='pendiente' and m.accion_solicitada_at<now()-interval '60 seconds' then 'incierto' else m.accion_estado end,'accion_entregada',m.accion_entregada_at is not null,
     'puede_editar',m.imagen_url is null and d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and m.creado_at>now()-interval '15 minutes' and (m.accion_estado is null or m.accion_estado='enviado'),
     'puede_eliminar',d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and (m.accion_estado is null or m.accion_estado='enviado'),
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
