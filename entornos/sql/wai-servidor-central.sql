-- Central connector enrollment, isolated in the authorized test environment.
-- No credentials are printed in inventory UI. A singleton lease prevents
-- multiple active runners and each runner receives only per-line derived keys.
create table if not exists gestlok_chat_private.wai_servidor_central (
 id boolean primary key default true check(id),
 clave_hash text not null check(clave_hash ~ '^[a-f0-9]{64}$'),
 creado_por uuid not null,
 creado_at timestamptz not null default clock_timestamp(),
 instancia uuid,
 senal_at timestamptz,
 vence_at timestamptz,
 check((instancia is null and vence_at is null) or (instancia is not null and vence_at is not null))
);
alter table gestlok_chat_private.wai_servidor_central enable row level security;
revoke all on gestlok_chat_private.wai_servidor_central from public,anon,authenticated;
alter table gestlok_chat_private.wai_sesiones add column if not exists central_instancia uuid;

create or replace function gestlok_chat_private.wai_central_lineas()
returns table(id uuid,numero text,sucursal uuid) language sql stable set search_path='' as $$
 select h.id,h.numero,s.id from gestlok_chat_private.whatsapp_premium_habilitaciones h
 join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
 join public.docs d on d.tenant_id=h.tenant_id and d.id=h.local_id and d.col='locales'
 where h.habilitada and e.nombre_publico ilike '%(prueba)%'
 and gestlok_chat_private.wai_rubro_activo(s.id)
$$;
revoke all on function gestlok_chat_private.wai_central_lineas() from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_central_admin(p_accion text default 'estado')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_chat_private.wai_servidor_central; k text; u uuid;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();
 if not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then raise exception 'Servidor central disponible solo en Prueba' using errcode='42501';end if;
 if p_accion='preparar' then
  k=encode(extensions.gen_random_bytes(32),'hex');
  insert into gestlok_chat_private.wai_servidor_central(id,clave_hash,creado_por)
  values(true,encode(sha256(convert_to(k,'UTF8')),'hex'),u) on conflict(id) do nothing;
  if not found then raise exception 'El servidor central ya está preparado. No se sustituye su configuración.';end if;
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
end$$;
revoke all on function public.gestlok_chat_wai_central_admin(text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_central_admin(text) to authenticated;

create or replace function public.gestlok_chat_wai_central_sync(p_clave text,p_instancia uuid,p_accion text default 'sincronizar')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c gestlok_chat_private.wai_servidor_central; l record; k text; k_hash text; resultado jsonb:='[]'::jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or p_instancia is null
 or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then return null;end if;
 select * into c from gestlok_chat_private.wai_servidor_central where id and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') for update;
 if not found then return null;end if;
 if c.instancia is distinct from p_instancia and c.vence_at>clock_timestamp() then return jsonb_build_object('ok',false,'ocupado',true);end if;
 if p_accion='liberar' then
  if c.instancia=p_instancia then
   update gestlok_chat_private.wai_servidor_central set instancia=null,vence_at=null where id;
   update gestlok_chat_private.wai_sesiones set estado='sin_senal',senal_at=null,wa_verificada_at=null,qr=null,qr_vence=null,opciones_at=null,multi_at=null
   where central_instancia=p_instancia;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_accion is distinct from 'sincronizar' then return null;end if;
 update gestlok_chat_private.wai_servidor_central set instancia=p_instancia,senal_at=clock_timestamp(),vence_at=clock_timestamp()+interval '45 seconds' where id;
 -- Paused / removed lines stop receiving and no longer have a live signal.
 update gestlok_chat_private.wai_sesiones w set estado='sin_senal',senal_at=null,wa_verificada_at=null,qr=null,qr_vence=null,opciones_at=null,multi_at=null
 where w.central_instancia is not null and not exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=w.habilitacion_id) and w.senal_at is not null;
 for l in select * from gestlok_chat_private.wai_central_lineas() order by id loop
  k=encode(extensions.hmac(convert_to('wai-central-v1:'||p_instancia::text||':'||l.id::text,'UTF8'),decode(p_clave,'hex'),'sha256'),'hex');
  k_hash=encode(sha256(convert_to(k,'UTF8')),'hex');
  -- First enrollment transfers control from the manually configured connector.
  -- Same line ID keeps the private WhatsApp credentials on the same machine.
  insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash,central_instancia)
  values(l.id,k_hash,p_instancia)
  on conflict(habilitacion_id) do update set clave_hash=excluded.clave_hash,central_instancia=excluded.central_instancia,
  revision=gen_random_uuid(),orden='reconectar',solicitada_at=clock_timestamp(),estado='sin_senal',senal_at=null,wa_verificada_at=null,
  qr=null,qr_vence=null,opciones_at=null,imagenes_at=null,salsas_at=null,multi_at=null,multi_revision=null
  where wai_sesiones.clave_hash is distinct from excluded.clave_hash or wai_sesiones.central_instancia is distinct from excluded.central_instancia;
  resultado=resultado||jsonb_build_array(jsonb_build_object('id',l.id,'number',l.numero,'key',k));
 end loop;
 return jsonb_build_object('ok',true,'sessions',resultado,'lease_seconds',45);
end$$;
revoke all on function public.gestlok_chat_wai_central_sync(text,uuid,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_central_sync(text,uuid,text) to anon,authenticated;

create or replace function public.gestlok_chat_wai_senal_v2(
 p_id uuid,p_clave text,p_revision uuid default null,p_estado text default null,
 p_numero text default null,p_qr text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w gestlok_chat_private.wai_sesiones%rowtype;
 h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from gestlok_chat_private.wai_sesiones where habilitacion_id=p_id
  and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') for update;
 if not found then return null; end if;
 if w.central_instancia is not null and not exists(select 1 from gestlok_chat_private.wai_servidor_central c where c.id and c.instancia=w.central_instancia and c.vence_at>clock_timestamp() and exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id)) then return jsonb_build_object('habilitada',false);end if;
 select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
 join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
 join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 join public.docs d on d.tenant_id=x.tenant_id and d.id=x.local_id and d.col='locales'
 where x.id=p_id and x.habilitada;
 if not found then return jsonb_build_object('habilitada',false); end if;
 if p_revision=w.revision and p_estado in ('conectado','reconectando','qr','desconectado') then
   if p_estado='conectado' and (p_numero is null or regexp_replace(p_numero,'^\+549([0-9]{10})$','+54\1')<>h.numero_clave) then
     p_estado:='desconectado';
   end if;
   if p_estado='qr' and (p_qr is null or length(p_qr) not between 16 and 2048) then p_estado:='desconectado'; end if;
   update gestlok_chat_private.wai_sesiones set estado=p_estado,senal_at=now(),wa_verificada_at=case when p_estado='conectado' then now() end,
    orden=case when p_estado='conectado' then 'reconectar' else w.orden end,
    qr=case when p_estado='qr' then p_qr end,
    qr_vence=case when p_estado='qr' then case when w.qr=p_qr then w.qr_vence else now()+interval '45 seconds' end end
   where habilitacion_id=p_id;
 end if;
 return jsonb_build_object('habilitada',true,'revision',w.revision,'orden',w.orden,'numero',h.numero);
end$$;
revoke all on function public.gestlok_chat_wai_senal_v2(uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_senal_v2(uuid,text,uuid,text,text,text) to anon,authenticated;


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

