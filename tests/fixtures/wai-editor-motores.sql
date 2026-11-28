CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_ofertas(s uuid, carta text, extra text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nombre text, precio numeric, opciones jsonb, reglas jsonb, orden integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_menu_paginas(p_sucursal uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(
  (select case when gestlok_chat_private.wai_imagen_permitida(s.id,s.carta_imagen_url) then jsonb_build_array(jsonb_build_object('id','carta_general','label','Carta del comercio','url',s.carta_imagen_url)) end from gestlok_chat_private.sucursales s where s.id=p_sucursal),
  (select jsonb_agg(jsonb_build_object('id','carta_'||p.clave,'label',p.titulo,'url',p.imagen_url) order by p.orden,p.clave) from gestlok_chat_private.wai_carta_paginas p where p.sucursal_id=p_sucursal and gestlok_chat_private.wai_imagen_permitida(p_sucursal,p.imagen_url)),
  '[]'::jsonb)
$function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_atencion_config(p_sucursal uuid, p_config jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare opciones jsonb;v jsonb;k int:=0;pregunta text; anterior jsonb; seguimiento int; cierre int;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_config is null then return gestlok_chat_private.wai_atencion_ajustes(p_sucursal);end if;
 if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(p_config->'pregunta') is distinct from 'string' or jsonb_typeof(p_config->'opciones') is distinct from 'array' or jsonb_typeof(p_config->'bienvenida_auto') is distinct from 'boolean' or jsonb_typeof(p_config->'pedidos') is distinct from 'boolean' then raise exception 'Configuración inválida';end if;
 anterior=gestlok_chat_private.wai_atencion_ajustes(p_sucursal);
 if (p_config ? 'agente_activo' and jsonb_typeof(p_config->'agente_activo') is distinct from 'boolean') or (p_config ? 'cierre_auto' and jsonb_typeof(p_config->'cierre_auto') is distinct from 'boolean') then raise exception 'Configuración inválida';end if;
 if (p_config ? 'seguimiento_min' and (p_config->>'seguimiento_min' is null or p_config->>'seguimiento_min' !~ '^[0-9]{1,4}$')) or (p_config ? 'cierre_min' and (p_config->>'cierre_min' is null or p_config->>'cierre_min' !~ '^[0-9]{1,4}$')) then raise exception 'Tiempo inválido';end if;
 seguimiento=coalesce((p_config->>'seguimiento_min')::int,(anterior->>'seguimiento_min')::int);
 cierre=coalesce((p_config->>'cierre_min')::int,(anterior->>'cierre_min')::int);
 if seguimiento not between 1 and 20 or cierre not between 1 and 1440 then raise exception 'Tiempo fuera del rango permitido';end if;
 pregunta=btrim(p_config->>'pregunta');
 if length(pregunta) not between 2 and 120 or jsonb_array_length(p_config->'opciones') not between 2 and 6 then raise exception 'Completá una pregunta y entre 2 y 6 opciones';end if;
 opciones='[]'::jsonb;
 for v in select value from jsonb_array_elements(p_config->'opciones') loop
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'label') is distinct from 'string' or length(btrim(v->>'label')) not between 1 and 60 or jsonb_typeof(v->'respuesta') is distinct from 'string' or length(v->>'respuesta')>400 or jsonb_typeof(v->'humano') is distinct from 'boolean' then raise exception 'Opción inválida';end if;
  if not (v->>'humano')::boolean and nullif(btrim(v->>'respuesta'),'') is null then raise exception 'Completá la respuesta automática o elegí atención humana';end if;
  if exists(select 1 from jsonb_array_elements(opciones) x where lower(x->>'label')=lower(btrim(v->>'label'))) then raise exception 'Las opciones deben ser diferentes';end if;
  k=k+1;opciones=opciones||jsonb_build_array(jsonb_build_object('id','op'||k,'label',btrim(v->>'label'),'respuesta',btrim(v->>'respuesta'),'humano',(v->>'humano')::boolean));
 end loop;
 insert into gestlok_chat_private.wai_atencion_config(sucursal_id,pregunta,opciones,bienvenida_auto,pedidos,agente_activo,seguimiento_min,cierre_auto,cierre_min) values(p_sucursal,pregunta,opciones,(p_config->>'bienvenida_auto')::boolean,(p_config->>'pedidos')::boolean,coalesce((p_config->>'agente_activo')::boolean,(anterior->>'agente_activo')::boolean),seguimiento,coalesce((p_config->>'cierre_auto')::boolean,(anterior->>'cierre_auto')::boolean),cierre)
 on conflict(sucursal_id) do update set pregunta=excluded.pregunta,opciones=excluded.opciones,bienvenida_auto=excluded.bienvenida_auto,pedidos=excluded.pedidos,agente_activo=excluded.agente_activo,seguimiento_min=excluded.seguimiento_min,cierre_auto=excluded.cierre_auto,cierre_min=excluded.cierre_min,actualizado_at=now();
 return gestlok_chat_private.wai_atencion_ajustes(p_sucursal);
end$function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_aplicar_plantilla_nueva()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t gestlok_chat_private.wai_plantillas_empresa; c gestlok_chat_private.sucursales; a gestlok_chat_private.wai_atencion_config;
 v jsonb; mapa jsonb:='{}'; nuevo uuid; k text; val text; opts text; rules text;
begin
 select * into t from gestlok_chat_private.wai_plantillas_empresa where tenant_id=new.tenant_id;
 if not found then return new;end if;
 c=jsonb_populate_record(null::gestlok_chat_private.sucursales,t.config);
 update gestlok_chat_private.sucursales set
 horario=c.horario,acepta_retiro=c.acepta_retiro,acepta_envio=c.acepta_envio,envio_costo=c.envio_costo,pedido_minimo=c.pedido_minimo,
 medios_pago=c.medios_pago,medios_pago_retiro=c.medios_pago_retiro,medios_pago_envio=c.medios_pago_envio,demora_retiro=c.demora_retiro,demora_envio=c.demora_envio,
 turnos_chat=c.turnos_chat,descuento_efectivo_pct=c.descuento_efectivo_pct,menu_interactivo=c.menu_interactivo,descuento_efectivo_entrega=c.descuento_efectivo_entrega,precio_efectivo_en_carta=c.precio_efectivo_en_carta,dias_apertura=c.dias_apertura,carta_texto=c.carta_texto,carta_imagen_url=c.carta_imagen_url,ia_activa=c.ia_activa
 where id=new.id;
 for v in select value from jsonb_array_elements(t.categorias) loop
  nuevo=gen_random_uuid();mapa=mapa||jsonb_build_object(v->>'id',nuevo);
  insert into gestlok_chat_private.categorias(id,tenant_id,sucursal_id,nombre,orden,activa) values(nuevo,new.tenant_id,new.id,v->>'nombre',(v->>'orden')::integer,(v->>'activa')::boolean);
 end loop;
 for v in select value from jsonb_array_elements(t.productos) loop
  mapa=mapa||jsonb_build_object(v->>'id',gen_random_uuid());
 end loop;
 for v in select value from jsonb_array_elements(t.productos) loop
  opts=(v->'opciones')::text;rules=(v->'reglas')::text;
  for k,val in select key,value from jsonb_each_text(mapa) loop
   opts=replace(opts,k,val);rules=replace(rules,k,val);
  end loop;
  insert into gestlok_chat_private.productos(id,tenant_id,sucursal_id,categoria_id,nombre,descripcion,precio,activo,disponible,orden,opciones,reglas)
  values((mapa->>(v->>'id'))::uuid,new.tenant_id,new.id,(mapa->>(v->>'categoria_id'))::uuid,v->>'nombre',v->>'descripcion',(v->>'precio')::numeric,(v->>'activo')::boolean,(v->>'disponible')::boolean,(v->>'orden')::integer,opts::jsonb,rules::jsonb);
 end loop;
 insert into gestlok_chat_private.wai_carta_paginas(sucursal_id,clave,titulo,imagen_url,orden,categorias,detalle_clave,detalle_grupo,productos_nombres)
 select new.id,p.clave,p.titulo,p.imagen_url,p.orden,p.categorias,p.detalle_clave,p.detalle_grupo,p.productos_nombres from jsonb_populate_recordset(null::gestlok_chat_private.wai_carta_paginas,t.paginas) p;
 if t.atencion is not null then
  a=jsonb_populate_record(null::gestlok_chat_private.wai_atencion_config,t.atencion);
  insert into gestlok_chat_private.wai_atencion_config(sucursal_id,pregunta,opciones,bienvenida_auto,pedidos,agente_activo,seguimiento_min,cierre_auto,cierre_min)
  values(new.id,a.pregunta,a.opciones,a.bienvenida_auto,a.pedidos,a.agente_activo,a.seguimiento_min,a.cierre_auto,a.cierre_min);
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_atencion_tick(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c jsonb;h uuid;manual boolean;m gestlok_chat_private.wai_mensajes%rowtype;o jsonb;
begin
 h=gestlok_chat_private.wai_hilo(p);
 manual=coalesce((select a.manual from gestlok_chat_private.wai_atencion_hilos a where a.hilo_id=h),false);
 c=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);
 if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=h and ci.cerrado_at is not null) then return;end if;
 -- Explicit opt-in only, once per authorized trial. Never a broadcast.
 if not manual and not (c->>'agente_activo')::boolean and (c->>'bienvenida_auto')::boolean and exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='entrada' and x.jid is not null and x.interaccion is null)
  and not exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.interaccion->>'tipo'='menu') then
  perform gestlok_chat_private.wai_encolar_menu(p,'menu:auto:'||p.id,c);
 end if;
 for m in select x.* from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.interaccion->>'tipo'='menu' and x.opcion_elegida is not null and x.opcion_respuesta_at is null and (x.ciclo_id is null or exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=x.ciclo_id and ci.cerrado_at is null)) for update loop
  select v into o from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=m.opcion_elegida;
  if manual or (o->>'humano')::boolean then
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual,pendiente) values(h,true,true)
    on conflict(hilo_id) do update set manual=true,pendiente=true,actualizado_at=now();
   update gestlok_chat_private.wai_mensajes set opcion_respuesta_at=now() where id=m.id;
   manual=true;
  elsif gestlok_chat_private.wai_pedido_encolar(p.id,'menu:respuesta:'||m.id,o->>'respuesta') then
   update gestlok_chat_private.wai_mensajes set opcion_respuesta_at=now() where id=m.id;
  end if;
 end loop;
end$function$
;

