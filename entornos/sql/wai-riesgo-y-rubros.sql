-- GESTLOK WAI · aceptación del riesgo por el dueño + motor para todos los rubros.
-- Se aplica igual en Prueba y en Producción (después de wai-rubros-preparacion.sql).
-- Es idempotente: se puede volver a ejecutar. No borra datos, no registra números ni envía mensajes.

-- 1) Aceptación del riesgo de la conexión no oficial (WhatsApp Web / Baileys).
-- Sin aceptación del dueño del local (o de la administradora) el servidor central
-- no abre la sesión de ese número: no hay QR ni respuestas automáticas.
create table if not exists gestlok_chat_private.wai_riesgo_aceptado(
 sucursal_id uuid primary key references gestlok_chat_private.sucursales(id) on delete cascade,
 aceptado_por uuid not null,
 aceptado_at timestamptz not null default clock_timestamp(),
 version text not null
);
alter table gestlok_chat_private.wai_riesgo_aceptado enable row level security;
revoke all on gestlok_chat_private.wai_riesgo_aceptado from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_riesgo_ok(p_sucursal uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from gestlok_chat_private.wai_riesgo_aceptado where sucursal_id=p_sucursal)
$$;
revoke all on function gestlok_chat_private.wai_riesgo_ok(uuid) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_riesgo(p_sucursal uuid,p_accion text default 'estado')
returns jsonb language plpgsql security definer set search_path='' as $$
declare n text; puede boolean; r gestlok_chat_private.wai_riesgo_aceptado;
begin
 if auth.uid() is null then raise exception 'Iniciá sesión en GESTLOK' using errcode='42501';end if;
 n=gestlok_chat_private.wai_portal_nivel(p_sucursal);
 if n is null then raise exception 'Sin acceso a este local' using errcode='42501';end if;
 -- Solo el dueño del local o la administradora. El gerente ve el estado pero no acepta.
 puede=n='configurar' and (gestlok_chat_private.es_creadora_chat() or coalesce(public.mi_rol(),'')='dueno');
 if p_accion='aceptar' then
  if not puede then raise exception 'Solo el dueño del local o la administradora pueden aceptar' using errcode='42501';end if;
  insert into gestlok_chat_private.wai_riesgo_aceptado(sucursal_id,aceptado_por,version)
  values(p_sucursal,auth.uid(),'2026-11-28') on conflict(sucursal_id) do nothing;
 elsif p_accion is distinct from 'estado' then raise exception 'Acción inválida' using errcode='22023';
 end if;
 select * into r from gestlok_chat_private.wai_riesgo_aceptado where sucursal_id=p_sucursal;
 return jsonb_build_object('aceptado',r.sucursal_id is not null,'aceptado_at',r.aceptado_at,'puede_aceptar',puede,'version','2026-11-28');
end$$;
revoke all on function public.gestlok_chat_wai_riesgo(uuid,text) from public,anon;
grant execute on function public.gestlok_chat_wai_riesgo(uuid,text) to authenticated;

-- El servidor central solo incorpora líneas de locales con el riesgo aceptado.
do $$
declare d text;
begin
 d=pg_get_functiondef('gestlok_chat_private.wai_central_lineas()'::regprocedure);
 if position('wai_riesgo_ok' in d)=0 then
  d=replace(d,'and gestlok_chat_private.wai_rubro_activo(s.id)','and gestlok_chat_private.wai_rubro_activo(s.id) and gestlok_chat_private.wai_riesgo_ok(s.id)');
  if position('wai_riesgo_ok' in d)=0 then raise exception 'wai_central_lineas: no se encontró el punto de control';end if;
  execute d;
 end if;
end$$;

-- 2) Rubros: el motor de atención, pedidos y carta/catálogo es el mismo para todos.
-- Cada local tiene su rubro declarado; cambia la atención inicial y las palabras.
alter table gestlok_chat_private.wai_comercios drop constraint if exists wai_comercios_rubro_check;
alter table gestlok_chat_private.wai_comercios add constraint wai_comercios_rubro_check
 check (rubro in ('gastronomia','cafeteria','almacen','perfumeria','ferreteria','mascotas','servicios','otro'));

create or replace function gestlok_chat_private.wai_rubro_activo(p_sucursal uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from gestlok_chat_private.wai_comercios where sucursal_id=p_sucursal and activo
  and rubro in ('gastronomia','cafeteria','almacen','perfumeria','ferreteria','mascotas','servicios','otro'))
$$;
revoke all on function gestlok_chat_private.wai_rubro_activo(uuid) from public,anon,authenticated;

-- El registro de WAI siempre usa el rubro declarado del local (nunca uno inventado por la llamada).
create or replace function gestlok_chat_private.wai_validar_rubro_activacion()
returns trigger language plpgsql set search_path='' as $$
declare s gestlok_chat_private.sucursales; r text;
begin
 select * into s from gestlok_chat_private.sucursales where id=new.sucursal_id;
 perform pg_advisory_xact_lock(hashtextextended(s.tenant_id::text||':'||s.local_id,0));
 select rubro into r from gestlok_chat_private.wai_rubros_locales where tenant_id=s.tenant_id and local_id=s.local_id;
 if r is not null then new.rubro=r;end if;
 if new.rubro is null or new.rubro not in ('gastronomia','cafeteria','almacen','perfumeria','ferreteria','mascotas','servicios','otro') then
  raise exception 'Rubro inválido' using errcode='22023';
 end if;
 return new;
end$$;
revoke all on function gestlok_chat_private.wai_validar_rubro_activacion() from public,anon,authenticated;
create or replace trigger wai_validar_rubro_activacion before insert or update of activo,rubro on gestlok_chat_private.wai_comercios
 for each row execute function gestlok_chat_private.wai_validar_rubro_activacion();

-- Atención inicial sugerida por rubro (el local la edita después en Configuración WAI).
create or replace function gestlok_chat_private.wai_config_rubro(p_rubro text)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('pregunta','¿En qué podemos ayudarte?','pedidos',coalesce(p_rubro,'')<>'servicios','opciones',
  (select jsonb_agg(jsonb_build_object('id','op'||o.n,'label',o.label,'respuesta','','humano',true) order by o.n)
   from unnest(case p_rubro
    when 'gastronomia' then array['Consultar la carta y promociones','Consultar horarios y envíos','Hablar con una persona']
    when 'cafeteria' then array['Consultar la carta y promociones','Consultar horarios y envíos','Hablar con una persona']
    when 'almacen' then array['Consultar productos y precios','Consultar horarios y envíos','Hablar con una persona']
    when 'perfumeria' then array['Consultar productos y precios','Consultar disponibilidad','Hablar con una persona']
    when 'ferreteria' then array['Consultar productos y precios','Pedir un presupuesto','Hablar con una persona']
    when 'mascotas' then array['Consultar alimentos y accesorios','Consultar horarios y envíos','Hablar con una persona']
    when 'servicios' then array['Consultar un servicio','Pedir un turno','Hablar con una persona']
    else array['Consultar productos o servicios','Hablar con una persona'] end) with ordinality as o(label,n)))
$$;
revoke all on function gestlok_chat_private.wai_config_rubro(text) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_config_inicial_rubro()
returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 if new.activo then
  c=gestlok_chat_private.wai_config_rubro(new.rubro);
  insert into gestlok_chat_private.wai_atencion_config(sucursal_id,pregunta,opciones,pedidos,agente_activo)
  values(new.sucursal_id,c->>'pregunta',c->'opciones',(c->>'pedidos')::boolean,true)
  on conflict(sucursal_id) do nothing;
 end if;
 return new;
end$$;
revoke all on function gestlok_chat_private.wai_config_inicial_rubro() from public,anon,authenticated;
create or replace trigger wai_config_inicial_rubro after insert or update of activo on gestlok_chat_private.wai_comercios
 for each row execute function gestlok_chat_private.wai_config_inicial_rubro();

-- Palabras según el rubro: fuera de gastronomía y cafetería se habla de «catálogo», no de «carta».
-- Solo cambia el texto visible de mensajes salientes; no toca opciones de votación ni pedidos.
create or replace function gestlok_chat_private.wai_texto_rubro(t text,r text)
returns text language sql immutable set search_path='' as $$
 select case when t is null or r is null or r in ('gastronomia','cafeteria') then t else
  regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t,
   '\mcarta interactiva\M','catálogo interactivo','g'),
   '\mDe la carta\M','Del catálogo','g'),'\mde la carta\M','del catálogo','g'),
   '\mLa carta\M','El catálogo','g'),'\mla carta\M','el catálogo','g'),
   '\mnuestra carta\M','nuestro catálogo','g'),
   '\mCarta\M','Catálogo','g'),'\mcarta\M','catálogo','g') end
$$;
revoke all on function gestlok_chat_private.wai_texto_rubro(text,text) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_mensaje_rubro()
returns trigger language plpgsql set search_path='' as $$
declare r text;
begin
 if new.direccion='salida' and new.texto is not null and position('arta' in new.texto)>0 then
  select c.rubro into r from gestlok_chat_private.wai_pilotos p join gestlok_chat_private.wai_comercios c on c.sucursal_id=p.sucursal_id where p.id=new.piloto_id;
  new.texto=gestlok_chat_private.wai_texto_rubro(new.texto,r);
 end if;
 return new;
end$$;
revoke all on function gestlok_chat_private.wai_mensaje_rubro() from public,anon,authenticated;
create or replace trigger wai_mensaje_rubro before insert on gestlok_chat_private.wai_mensajes
 for each row execute function gestlok_chat_private.wai_mensaje_rubro();

-- 3) Las RPC de alta aceptan todos los rubros (antes: solo gastronomía).
do $$
declare d text; f regprocedure;
begin
 -- Cambiar el rubro exige pausar WAI del local; al cambiarlo se sincroniza el registro WAI.
 f=to_regprocedure('public.gestlok_chat_wai_admin_rubro(uuid,text,text)');
 if f is not null then
  d=pg_get_functiondef(f);
  if position('wai_rubro_declarado(p_tenant,p_local) and exists' in d)=0 then
   d=replace(d,'if p_rubro<>''gastronomia'' and exists(','if p_rubro is distinct from gestlok_chat_private.wai_rubro_declarado(p_tenant,p_local) and exists(');
   d=replace(d,'Pausá WAI antes de cambiar a un rubro en preparación','Pausá WAI del local antes de cambiar el rubro');
   d=replace(d,'on conflict(tenant_id,local_id) do update set rubro=excluded.rubro,actualizado_at=now();',
    'on conflict(tenant_id,local_id) do update set rubro=excluded.rubro,actualizado_at=now();
 update gestlok_chat_private.wai_comercios c set rubro=p_rubro,actualizado_at=clock_timestamp() from gestlok_chat_private.sucursales s where s.id=c.sucursal_id and s.tenant_id=p_tenant and s.local_id=p_local and c.rubro is distinct from p_rubro;');
   if position('wai_rubro_declarado(p_tenant,p_local) and exists' in d)=0 or position('update gestlok_chat_private.wai_comercios c set rubro=p_rubro' in d)=0 then raise exception 'gestlok_chat_wai_admin_rubro: no se pudo actualizar';end if;
   execute d;
  end if;
 end if;
 -- Panel de Prueba.
 f=to_regprocedure('public.gestlok_chat_wai_comercios(text,uuid,text,boolean,text)');
 if f is not null then
  d=pg_get_functiondef(f);
  if position('únicamente gastronomía' in d)>0 then
   d=replace(d,'if p_rubro is distinct from ''gastronomia'' or p_activo is null then raise exception ''Por el momento WAI admite únicamente gastronomía''',
    'if p_rubro is null or p_rubro not in (''gastronomia'',''cafeteria'',''almacen'',''perfumeria'',''ferreteria'',''mascotas'',''servicios'',''otro'') or p_activo is null then raise exception ''Rubro o estado inválido''');
   if position('únicamente gastronomía' in d)>0 then raise exception 'gestlok_chat_wai_comercios: no se pudo actualizar';end if;
   execute d;
  end if;
 end if;
 -- Panel de producción (Comercios → WAI).
 f=to_regprocedure('public.gestlok_chat_wai_admin_comercial(text,uuid,text,text,uuid,boolean,text)');
 if f is not null then
  d=pg_get_functiondef(f);
  if position('admite únicamente gastronomía' in d)>0 then
   d=replace(d,'if p_rubro is distinct from ''gastronomia'' then raise exception ''Esta versión admite únicamente gastronomía'';end if;',
    'if p_rubro is null or p_rubro not in (''gastronomia'',''cafeteria'',''almacen'',''perfumeria'',''ferreteria'',''mascotas'',''servicios'',''otro'') then raise exception ''Rubro inválido'';end if;');
   d=replace(d,'Primero activá el comercio gastronómico','Primero activá el local en WAI');
   if position('admite únicamente gastronomía' in d)>0 then raise exception 'gestlok_chat_wai_admin_comercial: no se pudo actualizar';end if;
   execute d;
  end if;
 end if;
 -- El portal informa el rubro real de cada local.
 f=to_regprocedure('public.gestlok_chat_wai_portal_inicio(text)');
 if f is not null then
  d=pg_get_functiondef(f);
  if position('''rubro'',''gastronomia'',' in d)>0 then
   d=replace(d,'''rubro'',''gastronomia'',','''rubro'',coalesce(gestlok_chat_private.wai_rubro_declarado(s.tenant_id,s.local_id),''gastronomia''),');
   execute d;
  end if;
 end if;
end$$;
