-- Test-only interactive WAI menu. A link is limited to one authorized WhatsApp
-- pilot/cycle. The web can prepare a quote, never confirm a request by itself.
create table if not exists gestlok_chat_private.wai_menu_accesos (
 id uuid primary key default gen_random_uuid(),
 piloto_id uuid not null references gestlok_chat_private.wai_pilotos(id),
 ciclo_id uuid not null references gestlok_chat_private.wai_ciclos(id),
 evento text not null,
 creado_at timestamptz not null default now(),
 referencia uuid unique,
 ficha jsonb,
 usado_at timestamptz,
 unique(piloto_id,evento)
);
alter table gestlok_chat_private.wai_menu_accesos enable row level security;
revoke all on gestlok_chat_private.wai_menu_accesos from public,anon,authenticated;

-- Preserve the existing image-specific offers; the interactive menu instead
-- reads the local's entire compatible catalog, including drinks and desserts.
create or replace function gestlok_chat_private.wai_ofertas(s uuid, carta text, extra text default null)
returns table(id uuid,nombre text,precio numeric,opciones jsonb,reglas jsonb,orden integer)
language sql stable set search_path='' as $$
 select p.id,p.nombre,p.precio,p.opciones,p.reglas,p.orden
 from gestlok_chat_private.productos p join gestlok_chat_private.categorias c on c.id=p.categoria_id
 where p.sucursal_id=s and p.activo and p.disponible and c.activa and not (p.reglas ? 'cuando')
 and (case when extra is not null then gestlok_chat_private.wai_normalizar(c.nombre)=extra
 when carta='menu_interactivo' then (p.reglas-'compartir')='{}'::jsonb
  and not exists(select 1 from jsonb_array_elements(p.opciones) g where coalesce((g->>'obligatorio')::boolean,false)
   and (g->>'tipo' not in ('cantidad','una') or (case when g->>'tipo'='cantidad' then (g->>'total')::int else 1 end) not between 1 and 30 or jsonb_array_length(g->'valores')=0))
 else exists(select 1 from gestlok_chat_private.wai_carta_paginas w where w.sucursal_id=s and 'carta_'||w.clave=carta
    and c.nombre=any(w.categorias) and (cardinality(w.productos_nombres)=0 or p.nombre=any(w.productos_nombres))) end)
 order by p.orden,jsonb_array_length(p.opciones),p.precio,p.nombre,p.id
$$;

create or replace function gestlok_chat_private.wai_menu_invitar(p gestlok_chat_private.wai_pilotos,e text, intro text default 'Armá tu pedido en nuestra carta interactiva:')
returns boolean language plpgsql set search_path='' as $$
declare a gestlok_chat_private.wai_atencion_hilos%rowtype; enlace uuid;
begin
 if not gestlok_chat_private.wai_piloto_vigente(p) or not exists(select 1 from gestlok_chat_private.wai_ofertas(p.sucursal_id,'menu_interactivo')) then return false;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 if not found or a.manual or a.pendiente or a.ciclo_id is null or not exists(select 1 from gestlok_chat_private.wai_ciclos where id=a.ciclo_id and cerrado_at is null) then return false;end if;
 insert into gestlok_chat_private.wai_menu_accesos(piloto_id,ciclo_id,evento) values(p.id,a.ciclo_id,e)
 on conflict(piloto_id,evento) do update set evento=excluded.evento returning id into enlace;
 return gestlok_chat_private.wai_pedido_encolar(p.id,e,intro||' https://gestlok-prueba.vercel.app/chat/wai/menu/#'||enlace::text);
end$$;

-- Token authorization (not a manager login). No customer details or other
-- conversation data is returned. The link expires with the authorized trial.
create or replace function gestlok_chat_private.wai_menu_piloto(token uuid)
returns gestlok_chat_private.wai_pilotos language sql stable set search_path='' as $$
 select p from gestlok_chat_private.wai_menu_accesos l
 join gestlok_chat_private.wai_pilotos p on p.id=l.piloto_id
 join gestlok_chat_private.wai_ciclos c on c.id=l.ciclo_id and c.cerrado_at is null
 join gestlok_chat_private.wai_atencion_hilos a on a.ciclo_id=c.id and a.hilo_id=c.hilo_id
 where l.id=token and l.usado_at is null and not a.manual and not a.pendiente
 and gestlok_chat_private.wai_piloto_vigente(p)
 and (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'agente_activo')::boolean
 and (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'pedidos')::boolean
$$;

create or replace function public.gestlok_chat_wai_menu(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p gestlok_chat_private.wai_pilotos; s gestlok_chat_private.sucursales; productos jsonb; numero text;
begin
 p=gestlok_chat_private.wai_menu_piloto(p_token);
 if p.id is null then return jsonb_build_object('ok',false,'error','El acceso venció. Pedí otra carta por WhatsApp.');end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 select h.numero into numero from gestlok_chat_private.whatsapp_premium_habilitaciones h where h.id=p.habilitacion_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'nombre',o.nombre,'precio',o.precio,'categoria',c.nombre,
 'grupos',g.grupos,'salsa_precio',gestlok_chat_private.wai_salsa_precio(p,jsonb_build_object('grupos',g.grupos)))
 order by c.orden,o.orden,o.nombre),'[]') into productos
 from gestlok_chat_private.wai_ofertas(s.id,'menu_interactivo') o
 join gestlok_chat_private.productos pr on pr.id=o.id join gestlok_chat_private.categorias c on c.id=pr.categoria_id
 cross join lateral (select coalesce(jsonb_agg(z),'[]'::jsonb) grupos from jsonb_array_elements(o.opciones) z where coalesce((z->>'obligatorio')::boolean,false)) g;
 return jsonb_build_object('ok',true,'local',s.nombre,'productos',productos,
 'retiro',s.acepta_retiro,'delivery',s.acepta_envio,'envio',s.envio_costo,'minimo',s.pedido_minimo,
 'demora_retiro',s.demora_retiro,'demora_envio',s.demora_envio,'pagos_retiro',s.medios_pago_retiro,
 'pagos_envio',s.medios_pago_envio,'zona',s.envio_zona,'whatsapp',regexp_replace(numero,'[^0-9]','','g'));
end$$;

-- Rebuild every price, name and selection from the live catalog. The browser
-- supplies IDs and quantities only; never accept a client-calculated amount.
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
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 modo=d->>'modalidad';pago=d->>'pago';
 if modo not in ('retiro','delivery') or modo is null or pago is null or length(btrim(coalesce(d->>'nombre',''))) not between 2 and 80 or coalesce(d->>'nombre','') !~ '[[:alpha:]]' then return null;end if;
 if modo='delivery' then
  if not s.acepta_envio or length(btrim(coalesce(d->>'direccion',''))) not between 5 and 200 or d->>'direccion' !~ '[0-9]' or length(btrim(coalesce(d->>'entrecalles',''))) not between 2 and 120 or not coalesce(pago=any(s.medios_pago_envio),false) then return null;end if;
  demora=s.demora_envio;envio=s.envio_costo;
 else
  if not s.acepta_retiro or not coalesce(pago=any(s.medios_pago_retiro),false) then return null;end if;
  demora=s.demora_retiro;envio=0;
 end if;
 f=jsonb_build_object('carrito',carrito,'nombre',btrim(d->>'nombre'),'modalidad',modo,'pago',pago,
 'direccion',case when modo='delivery' then btrim(d->>'direccion') end,'entrecalles',case when modo='delivery' then btrim(d->>'entrecalles') end);
 sub=gestlok_chat_private.wai_carrito_subtotal(f);
 if coalesce(btrim(demora),'')='' or envio is null or (modo='delivery' and sub<s.pedido_minimo) or not gestlok_chat_private.wai_carrito_vigente(p,f) then return null;end if;
 return f||jsonb_build_object('estado','cotizacion','subtotal',sub,'envio',envio,'total',sub+envio,'demora',demora);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return null;
end$$;

-- Prepare an immutable draft. Only the authorized WhatsApp contact can turn
-- this reference into a pending manager request (see wai_menu_recibir).
create or replace function public.gestlok_chat_wai_menu_preparar(p_token uuid,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l gestlok_chat_private.wai_menu_accesos; p gestlok_chat_private.wai_pilotos; f jsonb; ref uuid;
begin
 select * into l from gestlok_chat_private.wai_menu_accesos where id=p_token for update;
 p=gestlok_chat_private.wai_menu_piloto(p_token);
 if p.id is null then return jsonb_build_object('ok',false,'error','El acceso venció. Pedí otra carta por WhatsApp.');end if;
 f=gestlok_chat_private.wai_menu_armar(p,p_datos);
 if f is null then return jsonb_build_object('ok',false,'error','Revisá los gustos, cantidades, modalidad y pago. Algún producto o condición pudo cambiar.');end if;
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
 return jsonb_build_object('ok',true,'referencia',ref,'total',f->'total','demora',f->'demora');
end$$;

create or replace function gestlok_chat_private.wai_menu_recibir(p gestlok_chat_private.wai_pilotos,m gestlok_chat_private.wai_mensajes)
returns boolean language plpgsql set search_path='' as $$
declare ref text; l gestlok_chat_private.wai_menu_accesos; a gestlok_chat_private.wai_atencion_hilos; s gestlok_chat_private.sucursales; f jsonb; e text:='agente:'||m.id;
begin
 ref=substring(lower(btrim(m.texto)) from '^confirmo mi pedido wai ([a-f0-9-]{36})$');
 if ref is null then return false;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 select * into l from gestlok_chat_private.wai_menu_accesos where referencia::text=ref and piloto_id=p.id and ciclo_id=a.ciclo_id for update;
 if l.id is null or l.ficha is null or m.ciclo_id is distinct from a.ciclo_id or m.jid is null or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(m.jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester) then
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'No encontramos ese pedido. Escribí CARTA para armarlo nuevamente.');
 end if;
 if l.usado_at is not null or a.ficha->>'estado'='pendiente' then return true;end if;
 if gestlok_chat_private.wai_menu_piloto(l.id) is null then return true;end if;
 f=l.ficha;select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo or s.demora_envio is distinct from f->>'demora')) or (f->>'modalidad'='retiro' and (not s.acepta_retiro or s.demora_retiro is distinct from f->>'demora')) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'La carta o las condiciones cambiaron. Pedí una carta nueva para revisar tu pedido.');
 end if;
 if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Pedido recibido por '||gestlok_chat_private.wai_importe((f->>'total')::numeric)||'. Demora aproximada: '||(f->>'demora')||'. Pendiente de confirmación del gerente.') then return false;end if;
 update gestlok_chat_private.wai_menu_accesos set usado_at=clock_timestamp() where id=l.id;
 update gestlok_chat_private.wai_atencion_hilos set ficha=f||jsonb_build_object('estado','pendiente','espera',e),modalidad=f->>'modalidad',pedido_solicitado_at=clock_timestamp(),pedido_texto=left((select string_agg(x->>'producto',', ') from jsonb_array_elements(f->'carrito') x),500),pendiente=true,manual=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
 return true;
end$$;
revoke all on function gestlok_chat_private.wai_menu_invitar(gestlok_chat_private.wai_pilotos,text,text),gestlok_chat_private.wai_menu_piloto(uuid),gestlok_chat_private.wai_menu_armar(gestlok_chat_private.wai_pilotos,jsonb),gestlok_chat_private.wai_menu_recibir(gestlok_chat_private.wai_pilotos,gestlok_chat_private.wai_mensajes) from public,anon,authenticated;
revoke all on function public.gestlok_chat_wai_menu(uuid),public.gestlok_chat_wai_menu_preparar(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_menu(uuid),public.gestlok_chat_wai_menu_preparar(uuid,jsonb) to anon,authenticated;

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
 if m.evento not like 'agente-voto:%' and lower(btrim(m.texto)) ~ '^confirmo mi pedido wai [a-f0-9-]{36}$' then
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
   pregunta='Elegí '||q||' de '||(g->>'nombre')||'. Ej.: '||q||' de '||(vs->0->>'nombre')||'. También podés escribir CARTA.';
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
    ok=gestlok_chat_private.wai_menu_invitar(p,e,'Elegí los gustos y cantidades en la carta:');
    if not ok then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,pregunta);end if;
   end if;
  end if;
 end if;
 if not ok then return null;end if;
 return f||jsonb_build_object('espera',e);
end$$;
