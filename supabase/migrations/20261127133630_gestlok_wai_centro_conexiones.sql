-- Control de sesiones externas. No autoriza mensajes, no cambia WABA y no activa cobros.
create table if not exists gestlok_chat_private.wai_sesiones (
  habilitacion_id uuid primary key references gestlok_chat_private.whatsapp_premium_habilitaciones(id) on delete restrict,
  clave_hash text not null,
  revision uuid not null default gen_random_uuid(),
  orden text not null default 'reconectar' check(orden in ('reconectar','qr')),
  solicitada_at timestamptz not null default now(),
  senal_at timestamptz,
  estado text not null default 'sin_senal' check(estado in ('sin_senal','conectado','reconectando','qr','desconectado')),
  qr text check(length(qr)<=2048),
  qr_vence timestamptz
);
alter table gestlok_chat_private.wai_sesiones enable row level security;
revoke all on gestlok_chat_private.wai_sesiones from public,anon,authenticated;

-- Un único punto de control, con autorización por sucursal para el autoservicio.
create or replace function public.gestlok_chat_wai_conexiones(
 p_sucursal uuid default null,p_accion text default 'listar',p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
 a boolean := gestlok_chat_private.es_creadora_chat();
 clave text; resultado jsonb;
begin
 if auth.uid() is null then raise exception 'Sin permiso' using errcode='42501'; end if;
 if a then perform gestlok_platform.require_admin();
 elsif p_sucursal is not null then perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 else raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_accion is null or p_accion not in ('listar','preparar','rotar_clave','reconectar','qr') then raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion<>'listar' then
   select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
    join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
    where x.id=p_id and x.habilitada and (p_sucursal is null or s.id=p_sucursal)
    for update of x;
   if not found then raise exception 'Número no habilitado en este local' using errcode='42501'; end if;
   if p_accion in ('preparar','rotar_clave') then
     if not a then raise exception 'Solo administradora' using errcode='42501'; end if;
     if p_accion='preparar' and exists(select 1 from gestlok_chat_private.wai_sesiones where habilitacion_id=h.id) then
       raise exception 'Conector ya preparado; no se reemplaza su clave' using errcode='22023';
     end if;
     clave:=encode(extensions.gen_random_bytes(32),'hex');
     insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash)
      values(h.id,encode(sha256(convert_to(clave,'UTF8')),'hex'))
      on conflict(habilitacion_id) do update set clave_hash=excluded.clave_hash,revision=gen_random_uuid(),orden='reconectar',solicitada_at=now(),senal_at=null,estado='sin_senal',qr=null,qr_vence=null;
     return jsonb_build_object('id',h.id,'clave',clave);
   else
     -- No desconectar una sesión sana para regenerar un QR; no duplicar solicitudes.
     update gestlok_chat_private.wai_sesiones w set revision=gen_random_uuid(),
      orden=p_accion,solicitada_at=now(),estado='reconectando',qr=null,qr_vence=null
     where w.habilitacion_id=h.id and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '90 seconds'
       and (w.estado<>'conectado' or p_accion='reconectar' and w.senal_at<=now()-interval '45 seconds')
       and w.solicitada_at<=now()-interval '10 seconds';
     if not found then raise exception 'Conector sin señal, recuperándose o ya conectado. Actualizá el estado.' using errcode='22023'; end if;
   end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'numero',x.numero,'empresa',e.nombre_publico,'local',coalesce(d.data->>'nombre',x.local_id),
  'habilitada',x.habilitada and coalesce(e.habilitada,false) and s.id is not null and d.id is not null,'preparada',w.habilitacion_id is not null,
  'senal_at',w.senal_at,'estado',case when not x.habilitada or not coalesce(e.habilitada,false) or s.id is null or d.id is null then 'pausado'
    when w.habilitacion_id is null then 'sin_conector'
    when w.senal_at is null or w.senal_at<x.actualizada_at then 'sin_senal'
    when w.senal_at<=now()-interval '90 seconds' then 'sin_senal'
    when w.estado='qr' and coalesce(w.qr_vence<=now(),true) then 'qr_vencido'
    else w.estado end,
  'qr',case when x.habilitada and e.habilitada and s.id is not null and d.id is not null and w.estado='qr' and w.senal_at>=x.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.qr_vence>now() then w.qr end,
  'qr_vence',case when w.estado='qr' then w.qr_vence end
 ) order by e.nombre_publico,x.local_id,x.numero),'[]'::jsonb) into resultado
 from gestlok_chat_private.whatsapp_premium_habilitaciones x
 left join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id
 left join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 left join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
 left join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=x.id
 where (p_sucursal is null and a) or s.id=p_sucursal;
 return resultado;
end$$;
revoke all on function public.gestlok_chat_wai_conexiones(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_conexiones(uuid,text,uuid) to authenticated;

-- El conector solo opera sobre SU número mediante una clave aleatoria de 256 bits.
-- Un reporte de otra revisión se ignora. La hora de señal es del servidor.
create or replace function public.gestlok_chat_wai_senal(
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
   update gestlok_chat_private.wai_sesiones set estado=p_estado,senal_at=now(),
    orden=case when p_estado='conectado' then 'reconectar' else w.orden end,
    qr=case when p_estado='qr' then p_qr end,
    qr_vence=case when p_estado='qr' then case when w.qr=p_qr then w.qr_vence else now()+interval '45 seconds' end end
   where habilitacion_id=p_id;
 end if;
 return jsonb_build_object('habilitada',true,'revision',w.revision,'orden',w.orden,'numero',h.numero);
end$$;
revoke all on function public.gestlok_chat_wai_senal(uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_senal(uuid,text,uuid,text,text,text) to anon,authenticated;
