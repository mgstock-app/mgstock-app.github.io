-- Controlled acceptance of incoming conversations on specially enabled TEST
-- lines. No prospecting, no mass send, no group or contact-book import.
-- No automatic commercial traffic: explicitly enable a consenting test line.
create table if not exists gestlok_chat_private.wai_recepcion_prueba (
 habilitacion_id uuid primary key references gestlok_chat_private.whatsapp_premium_habilitaciones(id),
 activo boolean not null default false,
 desde timestamptz not null default clock_timestamp(),
 actualizado_por uuid not null
);
alter table gestlok_chat_private.wai_recepcion_prueba enable row level security;
revoke all on gestlok_chat_private.wai_recepcion_prueba from public,anon,authenticated;
alter table gestlok_chat_private.wai_pilotos add column if not exists entrada_automatica boolean not null default false;

create or replace function gestlok_chat_private.wai_recepcion_activa(p_id uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce((select activo from gestlok_chat_private.wai_recepcion_prueba r where r.habilitacion_id=p_id),false)
 and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 and exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id)
 and exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.wai_servidor_central c on c.id and c.instancia=w.central_instancia
 where w.habilitacion_id=p_id and c.vence_at>now())
$$;
revoke all on function gestlok_chat_private.wai_recepcion_activa(uuid) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_recepcion_admin(p_id uuid,p_activo boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();
 if p_activo is null or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 or not exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id) then raise exception 'Número de ensayo no habilitado';end if;
 if p_activo and not exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.wai_servidor_central c on c.id and c.instancia=w.central_instancia
 where w.habilitacion_id=p_id and c.vence_at>now() and w.estado='conectado' and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds') then raise exception 'Primero vinculá la línea de ensayo al servidor central y verificá señal.';end if;
 insert into gestlok_chat_private.wai_recepcion_prueba(habilitacion_id,activo,actualizado_por) values(p_id,p_activo,u)
 on conflict(habilitacion_id) do update set activo=excluded.activo,desde=clock_timestamp(),actualizado_por=u where wai_recepcion_prueba.activo is distinct from excluded.activo;
 if not p_activo then update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=p_id and entrada_automatica and not cancelado and vence_at>now();end if;
 return true;
end$$;
revoke all on function public.gestlok_chat_wai_recepcion_admin(uuid,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_recepcion_admin(uuid,boolean) to authenticated;

create or replace function public.gestlok_chat_wai_admitir_entrada(p_id uuid,p_clave text,p_revision uuid,p_jid text,p_evento text,p_fecha bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  if (select count(*) from gestlok_chat_private.wai_pilotos q where q.habilitacion_id=p_id and not q.cancelado and q.vence_at>now())>=30
   or (select count(*) from gestlok_chat_private.wai_pilotos q where q.habilitacion_id=p_id and q.entrada_automatica and q.creado_at>now()-interval '1 day')>=100 then return null;end if;
  insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_at,vence_at,creado_por,entrada_automatica)
  values(p_id,s_id,t,fecha,fecha+interval '6 hours',r.actualizado_por,true) returning * into p;
 end if;
 return jsonb_build_object('id',p.id,'tester',p.tester,'creado_at',p.creado_at,'vence_at',p.vence_at,'hora_servidor',clock_timestamp());
end$$;
revoke all on function public.gestlok_chat_wai_admitir_entrada(uuid,text,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_admitir_entrada(uuid,text,uuid,text,text,bigint) to anon,authenticated;

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
  and (not p.entrada_automatica or gestlok_chat_private.wai_recepcion_activa(p.habilitacion_id))
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$function$
;

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
  and (not p.entrada_automatica or gestlok_chat_private.wai_recepcion_activa(p.habilitacion_id))
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$function$
;


create or replace function public.gestlok_chat_wai_ensayos_autorizados(p_id uuid,p_clave text,p_revision uuid,p_activo boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w gestlok_chat_private.wai_sesiones; grants jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then return null;end if;
 select x.* into w from gestlok_chat_private.wai_sesiones x join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=x.habilitacion_id and h.habilitada
 where x.habilitacion_id=p_id and x.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and x.revision=p_revision and (not coalesce(p_activo,false) or x.senal_at>=h.actualizada_at);
 if not found then return null;end if;
 if w.central_instancia is not null and not exists(select 1 from gestlok_chat_private.wai_servidor_central c where c.id and c.instancia=w.central_instancia and c.vence_at>now() and exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id)) then return null;end if;
 if p_activo then
  if w.estado<>'conectado' or w.senal_at<=now()-interval '30 seconds' or w.wa_verificada_at<=now()-interval '35 seconds' or w.senal_at is null or w.wa_verificada_at is null then return null;end if;
  update gestlok_chat_private.wai_sesiones set multi_at=now(),multi_revision=p_revision where habilitacion_id=p_id and revision=p_revision;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp()) order by p.creado_at,p.id),'[]'::jsonb)
 into grants from gestlok_chat_private.wai_pilotos p where p.habilitacion_id=p_id and gestlok_chat_private.wai_pedido_consentimiento(p) and (not p_activo or gestlok_chat_private.wai_piloto_vigente(p));
 return jsonb_build_object('hora_servidor',clock_timestamp(),'ensayos',grants,'recepcion_entrante',gestlok_chat_private.wai_recepcion_activa(p_id));
end$$;
revoke all on function public.gestlok_chat_wai_ensayos_autorizados(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_ensayos_autorizados(uuid,text,uuid,boolean) to anon,authenticated;


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
 elsif p_sucursal is not null then perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 else raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_accion is null or p_accion not in ('listar','preparar','rotar_clave','reconectar','qr','revalidar') then raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion<>'listar' then
   select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
    join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
    where x.id=p_id and x.habilitada and gestlok_chat_private.wai_rubro_activo(s.id) and (p_sucursal is null or s.id=p_sucursal)
    for update of x;
   if not found then raise exception 'Número no habilitado en este local' using errcode='42501'; end if;
   if p_accion in ('preparar','rotar_clave') then
     if exists(select 1 from gestlok_chat_private.wai_servidor_central where id) then raise exception 'El servidor central administra automáticamente las líneas. No descargues otra configuración.';end if;
     if not a then raise exception 'Solo administradora' using errcode='42501'; end if;
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
  'habilitada',x.habilitada and coalesce(e.habilitada,false) and s.id is not null and d.id is not null and gestlok_chat_private.wai_rubro_activo(s.id),'preparada',w.habilitacion_id is not null,
  'centralizada',exists(select 1 from gestlok_chat_private.wai_servidor_central where id),
  'recepcion_prueba',coalesce((select r.activo from gestlok_chat_private.wai_recepcion_prueba r where r.habilitacion_id=x.id),false),
  'multi_ensayos',coalesce(w.multi_at>now()-interval '30 seconds' and w.multi_revision=w.revision,false),'ensayos_activos',(select count(*) from gestlok_chat_private.wai_pilotos p where p.habilitacion_id=x.id and not p.cancelado and p.vence_at>now()),'senal_at',w.senal_at,'wa_verificada_at',w.wa_verificada_at,'estado',case when not x.habilitada or not coalesce(e.habilitada,false) or s.id is null or d.id is null or not gestlok_chat_private.wai_rubro_activo(s.id) then 'pausado'
    when w.habilitacion_id is null then 'sin_conector'
    when w.senal_at is null or w.senal_at<x.actualizada_at then 'sin_senal'
    when w.senal_at<=now()-interval '90 seconds' then 'sin_senal'
    when w.estado='qr' and coalesce(w.qr_vence<=now(),true) then 'qr_vencido'
    when w.estado='conectado' and (w.wa_verificada_at is null or w.wa_verificada_at<=now()-interval '35 seconds') then 'verificando'
    else w.estado end,
  'qr',case when x.habilitada and e.habilitada and s.id is not null and d.id is not null and gestlok_chat_private.wai_rubro_activo(s.id) and w.estado='qr' and w.senal_at>=x.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.qr_vence>now() then w.qr end,
  'qr_vence',case when w.estado='qr' then w.qr_vence end
 ) order by e.nombre_publico,x.local_id,x.numero),'[]'::jsonb) into resultado
 from gestlok_chat_private.whatsapp_premium_habilitaciones x
 left join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id
 left join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 left join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
 left join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=x.id
 where (p_sucursal is null and a) or s.id=p_sucursal;
 return resultado;
end$function$
;

