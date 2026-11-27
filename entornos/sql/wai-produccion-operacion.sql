-- Production-only controls. WAI activation is independent of the online chat.
-- Applied after wai-produccion-base.sql. No line is registered implicitly.

create or replace function gestlok_chat_private.wai_central_lineas()
returns table(id uuid,numero text,sucursal uuid) language sql stable set search_path='' as $$
 select h.id,h.numero,s.id from gestlok_chat_private.whatsapp_premium_habilitaciones h
 join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
 join public.docs d on d.tenant_id=h.tenant_id and d.id=h.local_id and d.col='locales'
 join gestlok_chat_private.wai_recepcion_prueba r on r.habilitacion_id=h.id and r.activo
 where h.habilitada and gestlok_chat_private.wai_rubro_activo(s.id)
$$;
revoke all on function gestlok_chat_private.wai_central_lineas() from public,anon,authenticated;

-- Admin only. The same WAI line registry doubles as the opt-in for incoming
-- customer-initiated conversations. No existing Premium line is enrolled.
create or replace function public.gestlok_chat_wai_admin_comercial(
 p_accion text default 'listar', p_tenant uuid default null,p_local text default null,
 p_numero text default null,p_id uuid default null,p_activo boolean default null,p_rubro text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare u uuid; s gestlok_chat_private.sucursales; e gestlok_chat_private.empresas; h gestlok_chat_private.whatsapp_premium_habilitaciones; tel text; nom text;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();
 if p_accion in ('local','registrar','numero') then
  if p_activo is null then raise exception 'Estado inválido';end if;
  select coalesce(nullif(btrim(d.data->>'nombre'),''),d.id) into nom from public.docs d where d.tenant_id=p_tenant and d.col='locales' and d.id=p_local;
  if not found then raise exception 'Local inexistente';end if;
  select * into s from gestlok_chat_private.sucursales x where x.tenant_id=p_tenant and x.local_id=p_local;
  if p_accion='local' and p_activo and s.id is null then
   select * into e from gestlok_chat_private.empresas where tenant_id=p_tenant;
   if e.tenant_id is not null and not e.habilitada then raise exception 'Esta empresa tiene deshabilitada la configuración compartida de Chat';end if;
   -- Only create missing configuration. The new public web chat remains closed.
   perform public.gestlok_chat_admin_habilitar(p_tenant,coalesce(e.nombre_publico,(select left(t.code,80) from gestlok_tenancy.tenants t where t.id=p_tenant)),jsonb_build_array(jsonb_build_object('local_id',p_local,'nombre',nom)));
   select * into s from gestlok_chat_private.sucursales x where x.tenant_id=p_tenant and x.local_id=p_local;
  end if;
  if s.id is null then raise exception 'Primero activá el comercio gastronómico';end if;
  if p_accion='local' then
   if p_rubro is distinct from 'gastronomia' then raise exception 'Esta versión admite únicamente gastronomía';end if;
   if p_activo and not exists(select 1 from gestlok_chat_private.empresas x where x.tenant_id=p_tenant and x.habilitada) then raise exception 'Configuración compartida de la empresa no disponible';end if;
   insert into gestlok_chat_private.wai_comercios(sucursal_id,rubro,activo,actualizado_por) values(s.id,p_rubro,p_activo,u)
   on conflict(sucursal_id) do update set activo=excluded.activo,actualizado_at=clock_timestamp(),actualizado_por=u;
   if p_activo then
    -- New WAI activation enables the incoming assistant; settings remain editable.
    insert into gestlok_chat_private.wai_atencion_config(sucursal_id,pregunta,opciones,agente_activo)
    values(s.id,'¿En qué podemos ayudarte?','[{"id":"op1","label":"Consultar productos y precios","respuesta":"","humano":true},{"id":"op2","label":"Hablar con una persona","respuesta":"","humano":true}]',true) on conflict(sucursal_id) do nothing;
   else
    update gestlok_chat_private.wai_pilotos set cancelado=true where sucursal_id=s.id and not cancelado and vence_at>now();
   end if;
  elsif p_accion='registrar' then
   if not p_activo or not gestlok_chat_private.wai_rubro_activo(s.id) then raise exception 'Activá el local primero';end if;
   tel=regexp_replace(btrim(coalesce(p_numero,'')),'[ ()-]','','g');
   if tel !~ '^\+[1-9][0-9]{7,14}$' or (tel like '+54%' and tel !~ '^\+54(9)?[0-9]{10}$') then raise exception 'Ingresá el número internacional completo';end if;
   select * into h from gestlok_chat_private.whatsapp_premium_habilitaciones where gestlok_chat_private.whatsapp_exclusion_key(numero)=gestlok_chat_private.whatsapp_exclusion_key(tel);
   if h.id is null then
    perform public.gestlok_chat_admin_whatsapp_premium('agregar',p_tenant,p_local,array[tel]);
    select * into h from gestlok_chat_private.whatsapp_premium_habilitaciones where gestlok_chat_private.whatsapp_exclusion_key(numero)=gestlok_chat_private.whatsapp_exclusion_key(tel);
   end if;
   if h.id is null or h.tenant_id<>p_tenant or h.local_id<>p_local then raise exception 'Ese número está asignado a otro local';end if;
   if not h.habilitada then raise exception 'Ese número está deshabilitado globalmente. Verificá su habilitación anterior.';end if;
   insert into gestlok_chat_private.wai_recepcion_prueba(habilitacion_id,activo,actualizado_por) values(h.id,true,u)
   on conflict(habilitacion_id) do update set activo=true,desde=clock_timestamp(),actualizado_por=u where not wai_recepcion_prueba.activo;
  elsif p_accion='numero' then
   select * into h from gestlok_chat_private.whatsapp_premium_habilitaciones where id=p_id and tenant_id=p_tenant and local_id=p_local for update;
   if h.id is null then raise exception 'Número no asignado a este local';end if;
   if not exists(select 1 from gestlok_chat_private.wai_recepcion_prueba where habilitacion_id=h.id) then raise exception 'Número no registrado en WAI';end if;
   if p_activo and (not h.habilitada or not gestlok_chat_private.wai_rubro_activo(s.id)) then raise exception 'Activá el local y verificá el estado del número';end if;
   update gestlok_chat_private.wai_recepcion_prueba set activo=p_activo,desde=clock_timestamp(),actualizado_por=u where habilitacion_id=h.id and activo is distinct from p_activo;
   if not p_activo then update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=h.id and not cancelado and vence_at>now();end if;
  end if;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('tenant',d.tenant_id,'local_id',d.id,'id',s.id,'slug',s.slug,'empresa',coalesce(e.nombre_publico,t.code),'nombre',coalesce(s.nombre,nullif(btrim(d.data->>'nombre'),''),d.id),
  'rubro',c.rubro,'activo',coalesce(c.activo,false) and coalesce(e.habilitada,false),
  'numeros',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'numero',h.numero,'registrado',r.habilitacion_id is not null,'activo',coalesce(r.activo,false) and h.habilitada,'global_activo',h.habilitada,
    'estado',case when r.habilitacion_id is null then 'no_registrado' when not r.activo or not h.habilitada or not coalesce(c.activo,false) then 'pausado'
     when w.habilitacion_id is null then 'sin_conector'
     when w.senal_at is null or w.senal_at< h.actualizada_at or w.senal_at<=now()-interval '90 seconds' then 'sin_senal'
     when w.estado='conectado' and (w.wa_verificada_at is null or w.wa_verificada_at<=now()-interval '35 seconds') then 'verificando'
     when w.estado='qr' and coalesce(w.qr_vence<=now(),true) then 'qr_vencido' else w.estado end)
    order by h.numero) from gestlok_chat_private.whatsapp_premium_habilitaciones h left join gestlok_chat_private.wai_recepcion_prueba r on r.habilitacion_id=h.id left join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=h.id
    where h.tenant_id=d.tenant_id and h.local_id=d.id),'[]'::jsonb))
  order by coalesce(e.nombre_publico,t.code),d.data->>'nombre') from public.docs d join gestlok_tenancy.tenants t on t.id=d.tenant_id
  left join gestlok_chat_private.empresas e on e.tenant_id=d.tenant_id left join gestlok_chat_private.sucursales s on s.tenant_id=d.tenant_id and s.local_id=d.id
  left join gestlok_chat_private.wai_comercios c on c.sucursal_id=s.id where d.col='locales'),'[]'::jsonb);
end$$;
revoke all on function public.gestlok_chat_wai_admin_comercial(text,uuid,text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_admin_comercial(text,uuid,text,text,uuid,boolean,text) to authenticated;

-- Private production line activation is never a contact-by-contact pilot.
create or replace function public.gestlok_chat_wai_piloto_autorizar(p_sucursal uuid,p_id uuid,p_tester text default null,p_accion text default 'autorizar')
returns uuid language plpgsql security definer set search_path='' as $$
begin raise exception 'La versión comercial recibe únicamente mensajes entrantes, sin ensayos manuales' using errcode='42501';end$$;
revoke all on function public.gestlok_chat_wai_piloto_autorizar(uuid,uuid,text,text) from public,anon,authenticated;

-- Do not expose the old test activation endpoints on the commercial project.
revoke all on function public.gestlok_chat_wai_comercios(text,uuid,text,boolean,text) from public,anon,authenticated;
revoke all on function public.gestlok_chat_wai_recepcion_admin(uuid,boolean) from public,anon,authenticated;
revoke all on function public.gestlok_chat_wai_senal(uuid,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.gestlok_chat_wai_ensayo_autorizado(uuid,text,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_central_admin(p_accion text DEFAULT 'estado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.wai_servidor_central; k text; u uuid;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();

 if p_accion='preparar' then
  k=encode(extensions.gen_random_bytes(32),'hex');
  insert into gestlok_chat_private.wai_servidor_central(id,clave_hash,creado_por)
  values(true,encode(sha256(convert_to(k,'UTF8')),'hex'),u) on conflict(id) do nothing;
  if not found then raise exception 'El servidor central ya está preparado. No se sustituye su configuración.';end if;
  update gestlok_chat_private.wai_piloto_entorno set habilitado=true where id;
  return jsonb_build_object('clave',k,'preparado',true);
 elsif p_accion='rotar' then
  select * into c from gestlok_chat_private.wai_servidor_central where id for update;
  if not found then raise exception 'No hay configuración central para recuperar';end if;
  if c.vence_at>clock_timestamp() then raise exception 'Detené primero la instancia activa y esperá a que desaparezca su señal.';end if;
  k=encode(extensions.gen_random_bytes(32),'hex');
  update gestlok_chat_private.wai_servidor_central set clave_hash=encode(sha256(convert_to(k,'UTF8')),'hex'),instancia=null,vence_at=null,senal_at=null,creado_por=u,creado_at=clock_timestamp() where id;
  update gestlok_chat_private.wai_sesiones set clave_hash=encode(extensions.gen_random_bytes(32),'hex'),revision=gen_random_uuid(),estado='sin_senal',senal_at=null,wa_verificada_at=null,qr=null,qr_vence=null,opciones_at=null,multi_at=null
  where central_instancia is not null;
  return jsonb_build_object('clave',k,'preparado',true);
 elsif p_accion is distinct from 'estado' then raise exception 'Acción inválida';end if;
 select * into c from gestlok_chat_private.wai_servidor_central where id;
 return jsonb_build_object('preparado',c.id is not null,'activo',coalesce(c.vence_at>clock_timestamp(),false),
  'senal_at',c.senal_at,'lineas',(select count(*) from gestlok_chat_private.wai_central_lineas()));
end$function$;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_portal_nivel(p_sucursal uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n text;
begin
 if auth.uid() is null or not gestlok_chat_private.wai_rubro_activo(p_sucursal) then return null; end if;
 if not exists(select 1 from gestlok_chat_private.sucursales s
   join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.habilitada
   join public.docs d on d.tenant_id=s.tenant_id and d.col='locales' and d.id=s.local_id
   where s.id=p_sucursal) then return null; end if;
 if gestlok_chat_private.es_creadora_chat() then
   perform gestlok_platform.require_admin(); return 'configurar';
 end if;
 if coalesce(public.mi_rol(),'') not in ('dueno','gerente') then return null; end if;
 n:=gestlok_chat_private.nivel(p_sucursal);
 if n in ('gestionar','configurar') then return n; end if;
 return null;
end$function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_conexiones(p_sucursal uuid DEFAULT NULL::uuid, p_accion text DEFAULT 'listar'::text, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
 a boolean := gestlok_chat_private.es_creadora_chat();
 clave text; resultado jsonb;
begin
 if auth.uid() is null then raise exception 'Sin permiso' using errcode='42501'; end if;
 if a then perform gestlok_platform.require_admin();
 elsif p_sucursal is not null and gestlok_chat_private.wai_portal_nivel(p_sucursal) is not null then null;
 else raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_accion is null or p_accion not in ('listar','preparar','rotar_clave','reconectar','qr','revalidar') then raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion<>'listar' then
   select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
    join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
    where x.id=p_id and x.habilitada and exists(select 1 from gestlok_chat_private.wai_recepcion_prueba r where r.habilitacion_id=x.id and r.activo) and gestlok_chat_private.wai_rubro_activo(s.id) and (p_sucursal is null or s.id=p_sucursal)
    for update of x;
   if not found then raise exception 'Número no habilitado en este local' using errcode='42501'; end if;
   if p_accion in ('preparar','rotar_clave') then
     if exists(select 1 from gestlok_chat_private.wai_servidor_central where id) then raise exception 'El servidor central administra automáticamente las líneas. No descargues otra configuración.';end if;
     raise exception 'La configuración de líneas es centralizada' using errcode='42501';
     if p_accion='preparar' and exists(select 1 from gestlok_chat_private.wai_sesiones where habilitacion_id=h.id) then
       raise exception 'Conector ya preparado; no se reemplaza su clave' using errcode='22023';
     end if;
     clave:=encode(extensions.gen_random_bytes(32),'hex');
     insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash)
      values(h.id,encode(sha256(convert_to(clave,'UTF8')),'hex'))
      on conflict(habilitacion_id) do update set clave_hash=excluded.clave_hash,revision=gen_random_uuid(),orden='reconectar',solicitada_at=now(),senal_at=null,estado='sin_senal',qr=null,qr_vence=null,wa_verificada_at=null;
     return jsonb_build_object('id',h.id,'clave',clave);
   elsif p_accion='revalidar' then
     if p_sucursal is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501'; end if;
     update gestlok_chat_private.wai_sesiones w set revision=gen_random_uuid(),orden='qr_forzado',solicitada_at=now(),estado='reconectando',qr=null,qr_vence=null,wa_verificada_at=null
      where w.habilitacion_id=h.id and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.solicitada_at<=now()-interval '10 seconds';
     if not found then raise exception 'Conector sin señal o solicitud reciente. Actualizá el estado.' using errcode='22023'; end if;
     update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=h.id and not cancelado and vence_at>now();
   else
     -- No desconectar una sesión sana para regenerar un QR; no duplicar solicitudes.
     update gestlok_chat_private.wai_sesiones w set revision=gen_random_uuid(),
      orden=p_accion,solicitada_at=now(),estado='reconectando',qr=null,qr_vence=null,wa_verificada_at=null
     where w.habilitacion_id=h.id and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '90 seconds'
       and (w.estado<>'conectado' or p_accion='reconectar' and w.senal_at<=now()-interval '45 seconds')
       and w.solicitada_at<=now()-interval '10 seconds';
     if not found then raise exception 'Conector sin señal, recuperándose o ya conectado. Actualizá el estado.' using errcode='22023'; end if;
   end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'numero',x.numero,'empresa',e.nombre_publico,'local',coalesce(d.data->>'nombre',x.local_id),
  'habilitada',rp.activo and x.habilitada and coalesce(e.habilitada,false) and s.id is not null and d.id is not null and gestlok_chat_private.wai_rubro_activo(s.id),'preparada',w.habilitacion_id is not null,
  'centralizada',true,
  'recepcion_prueba',coalesce((select r.activo from gestlok_chat_private.wai_recepcion_prueba r where r.habilitacion_id=x.id),false),
  'multi_ensayos',coalesce(w.multi_at>now()-interval '30 seconds' and w.multi_revision=w.revision,false),'ensayos_activos',(select count(*) from gestlok_chat_private.wai_pilotos p where p.habilitacion_id=x.id and not p.cancelado and p.vence_at>now()),'senal_at',w.senal_at,'wa_verificada_at',w.wa_verificada_at,'estado',case when not rp.activo or not x.habilitada or not coalesce(e.habilitada,false) or s.id is null or d.id is null or not gestlok_chat_private.wai_rubro_activo(s.id) then 'pausado'
    when w.habilitacion_id is null then 'sin_conector'
    when w.senal_at is null or w.senal_at<x.actualizada_at then 'sin_senal'
    when w.senal_at<=now()-interval '90 seconds' then 'sin_senal'
    when w.estado='qr' and coalesce(w.qr_vence<=now(),true) then 'qr_vencido'
    when w.estado='conectado' and (w.wa_verificada_at is null or w.wa_verificada_at<=now()-interval '35 seconds') then 'verificando'
    else w.estado end,
  'qr',case when rp.activo and x.habilitada and e.habilitada and s.id is not null and d.id is not null and gestlok_chat_private.wai_rubro_activo(s.id) and w.estado='qr' and w.senal_at>=x.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.qr_vence>now() then w.qr end,
  'qr_vence',case when w.estado='qr' then w.qr_vence end
 ) order by e.nombre_publico,x.local_id,x.numero),'[]'::jsonb) into resultado
 from gestlok_chat_private.whatsapp_premium_habilitaciones x
 join gestlok_chat_private.wai_recepcion_prueba rp on rp.habilitacion_id=x.id
 left join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id
 left join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 left join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
 left join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=x.id
 where (p_sucursal is null and a) or s.id=p_sucursal;
 return resultado;
end$function$;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_piloto_vigente(p gestlok_chat_private.wai_pilotos)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (select habilitado from gestlok_chat_private.wai_piloto_entorno where id)
  and gestlok_chat_private.wai_rubro_activo(p.sucursal_id) and p.vence_at>now() and not p.cancelado
  and exists(select 1 from gestlok_chat_private.whatsapp_premium_habilitaciones h
    join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
    where h.id=p.habilitacion_id and s.id=p.sucursal_id and h.habilitada)
  and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.wa_verificada_at>now()-interval '35 seconds'
    and (w.central_instancia is null or exists(select 1 from gestlok_chat_private.wai_servidor_central c where c.id and c.instancia=w.central_instancia and c.vence_at>now())))
  and p.entrada_automatica and gestlok_chat_private.wai_recepcion_activa(p.habilitacion_id)
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$function$;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_consentimiento(p gestlok_chat_private.wai_pilotos)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select gestlok_chat_private.wai_rubro_activo(p.sucursal_id) and p.vence_at>now() and not p.cancelado
  and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
  and exists(select 1 from gestlok_chat_private.whatsapp_premium_habilitaciones h
    join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
    where h.id=p.habilitacion_id and s.id=p.sucursal_id and h.habilitada)
  and p.entrada_automatica and gestlok_chat_private.wai_recepcion_activa(p.habilitacion_id)
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_admitir_entrada(p_id uuid, p_clave text, p_revision uuid, p_jid text, p_evento text, p_fecha bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w gestlok_chat_private.wai_sesiones; h gestlok_chat_private.whatsapp_premium_habilitaciones;
 s_id uuid; t text; fecha timestamptz; r gestlok_chat_private.wai_recepcion_prueba; p gestlok_chat_private.wai_pilotos; canon text;
begin
 -- This endpoint accepts only authentic line credentials and recent direct events.
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$'
 or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_fecha is null or p_fecha not between extract(epoch from clock_timestamp()-interval '60 seconds')::bigint and extract(epoch from clock_timestamp()+interval '10 seconds')::bigint then return null;end if;
 fecha=to_timestamp(p_fecha);
 select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x where x.id=p_id and x.habilitada for update;
 if not found then return null;end if;
 select a.sucursal into s_id from gestlok_chat_private.wai_central_lineas() a where a.id=p_id;
 if s_id is null or not gestlok_chat_private.wai_recepcion_activa(p_id) then return null;end if;
 select * into w from gestlok_chat_private.wai_sesiones where habilitacion_id=p_id and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and revision=p_revision and estado='conectado' and senal_at>=h.actualizada_at and senal_at>now()-interval '30 seconds' and wa_verificada_at>now()-interval '35 seconds';
 if not found then return null;end if;
 select * into r from gestlok_chat_private.wai_recepcion_prueba where habilitacion_id=p_id and activo;
 if not found or fecha<date_trunc('second',r.desde) then return null;end if;
 t='+'||split_part(p_jid,'@',1);canon=gestlok_chat_private.whatsapp_exclusion_key(t);
 if canon=gestlok_chat_private.whatsapp_exclusion_key(h.numero) or public.gestlok_chat_srv_whatsapp_excluido(s_id,t) then return null;end if;
 select q.* into p from gestlok_chat_private.wai_pilotos q where q.habilitacion_id=p_id and q.sucursal_id=s_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=canon and gestlok_chat_private.wai_piloto_vigente(q)
 order by q.creado_at desc,q.id desc limit 1;
 if p.id is null then
  if exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where q.habilitacion_id=p_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=canon and m.direccion='entrada' and m.evento=p_evento) then return null;end if;
  -- Capacity ceiling is a lab guardrail, not a commercial customer limit.
  if (select count(*) from gestlok_chat_private.wai_pilotos q where q.habilitacion_id=p_id and not q.cancelado and q.vence_at>now())>=200 then return null;end if;
  insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_at,vence_at,creado_por,entrada_automatica)
  values(p_id,s_id,t,fecha,fecha+interval '6 hours',r.actualizado_por,true) returning * into p;
 end if;
 return jsonb_build_object('id',p.id,'tester',p.tester,'creado_at',p.creado_at,'vence_at',p.vence_at,'hora_servidor',clock_timestamp());
end$function$;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_piloto_motor(p_id uuid, p_clave text, p_revision uuid, p_accion text, p_piloto uuid DEFAULT NULL::uuid, p_jid text DEFAULT NULL::text, p_evento text DEFAULT NULL::text, p_texto text DEFAULT NULL::text, p_mensaje uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text; entrada uuid; voto jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 -- Legacy connector must not choose an arbitrary customer if more than one is authorized.
 if p_piloto is null and (select count(*) from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and gestlok_chat_private.wai_piloto_vigente(x))>1 then return null;end if;
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
  if coalesce((voto->>'ok')::boolean,false) and not coalesce((voto->>'ignorada')::boolean,false) and coalesce((voto->>'completo')::boolean,true) then
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
   or p_evento is null or length(p_evento) not between 1 and 200 or p_texto is null or length(btrim(p_texto)) not between 1 and 1000 then return null;end if;
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
   or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_estado is null or p_estado not in ('enviado','entregado') then return null;end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado,wa_id,wa_ruta,origen,entregado_at)
  values(p.id,'salida',p_texto,p_evento,p_jid,'aceptado',p_evento,p_jid,'telefono',case when p_estado='entregado' then now() end)
  on conflict do nothing;
  return jsonb_build_object('ok',true);
 elsif p_accion='tomar' then
  perform gestlok_chat_private.wai_pedido_tick(p);
  select x.jid into jid from gestlok_chat_private.wai_mensajes x join gestlok_chat_private.wai_pilotos q on q.id=x.piloto_id where x.direccion='entrada' and x.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester) order by x.creado_at desc,x.id desc limit 1;
  if jid is null then return null;end if;
  update gestlok_chat_private.wai_mensajes x set cancelada_at=clock_timestamp() where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and x.interaccion is not null and gestlok_chat_private.wai_votacion_estado(x) not in ('pendiente','abierta');
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and x.evento not like 'pedido:%:consulta' and (x.interaccion is null or p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2')) and (x.imagen_url is null or p_estado in ('opciones_imagen_v1','opciones_imagen_v2')) and (x.interaccion->>'tipo' is distinct from 'salsas' or p_estado='opciones_imagen_v2') order by x.creado_at,x.id limit 1 for update;
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
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.accion_estado='pendiente' and x.interaccion is null and x.wa_id is not null order by x.accion_solicitada_at,x.id limit 1 for update;
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
  if p_estado='aceptado' and m.evento like 'pedido:%:preparacion' then
   perform gestlok_chat_private.wai_resena_invitar(p,o) from gestlok_chat_private.wai_pedidos o where o.hilo_id=gestlok_chat_private.wai_hilo(p) and m.evento in ('pedido:'||o.id||':preparacion','pedido:'||o.id||':entregado') and o.estado in ('preparacion','listo','en_camino','entregado');
  end if;
  if p_estado='aceptado' and (m.evento like 'pedido:%:preparacion' or m.evento like 'pedido:%:resena') then perform gestlok_chat_private.wai_cerrar_tras_resena(p);end if;
  if p_estado='incierto' and m.evento like 'pedido:%:resena' then update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;end if;
  -- Only append the next choices when the photo/link was accepted. No caption and no poll after an uncertain send.
  if p_estado='aceptado' and m.continuar_carta is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_agente_poll(p,'agente:continuar:'||m.id,'¿Qué te gustaría hacer ahora?',jsonb_build_object('opciones',m.continuar_carta)->'opciones');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 return null;
end$function$;
