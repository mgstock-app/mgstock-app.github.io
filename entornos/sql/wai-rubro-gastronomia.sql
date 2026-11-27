-- WAI activation scoped to gastronomic businesses. Separate from Premium/Chat.
create table if not exists gestlok_chat_private.wai_comercios (
 sucursal_id uuid primary key references gestlok_chat_private.sucursales(id) on delete cascade,
 rubro text not null check(rubro='gastronomia'),
 activo boolean not null default true,
 actualizado_at timestamptz not null default clock_timestamp(),
 actualizado_por uuid
);
alter table gestlok_chat_private.wai_comercios enable row level security;
revoke all on gestlok_chat_private.wai_comercios from public,anon,authenticated;

-- Seed only the two authorized TEST locales; no real numbers or menu settings changed.
insert into gestlok_chat_private.wai_comercios(sucursal_id,rubro)
select s.id,'gastronomia' from gestlok_chat_private.sucursales s
join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id
where s.slug in ('mi-gusto-munro','mi-gusto-torcuato') and e.nombre_publico ilike '%(prueba)%'
and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
on conflict(sucursal_id) do nothing;

create or replace function gestlok_chat_private.wai_rubro_activo(p_sucursal uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from gestlok_chat_private.wai_comercios where sucursal_id=p_sucursal and rubro='gastronomia' and activo)
$$;
revoke all on function gestlok_chat_private.wai_rubro_activo(uuid) from public,anon,authenticated;

create or replace function public.gestlok_chat_wai_comercios(p_accion text default 'listar',p_sucursal uuid default null,p_rubro text default null,p_activo boolean default null,p_numero text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; v_local gestlok_chat_private.sucursales;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Habilitación exclusiva de la administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();
 if p_accion in ('configurar','registrar') then
  if not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then raise exception 'Esta versión de WAI todavía está en Prueba' using errcode='42501';end if;
  if p_rubro is distinct from 'gastronomia' or p_activo is null then raise exception 'Por el momento WAI admite únicamente gastronomía' using errcode='22023';end if;
  select x.* into v_local from gestlok_chat_private.sucursales x join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
   join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
   where x.id=p_sucursal and e.nombre_publico ilike '%(prueba)%';
  if not found then raise exception 'Seleccioná una sucursal de prueba habilitada' using errcode='42501';end if;
  if p_accion='registrar' then
   if not p_activo then raise exception 'Activá WAI para registrar una línea';end if;
   perform public.gestlok_chat_admin_whatsapp_premium('agregar',v_local.tenant_id,v_local.local_id,array[p_numero]);
  end if;
  insert into gestlok_chat_private.wai_comercios(sucursal_id,rubro,activo,actualizado_por)
  values(v_local.id,p_rubro,p_activo,u)
  on conflict(sucursal_id) do update set rubro=excluded.rubro,activo=excluded.activo,actualizado_at=clock_timestamp(),actualizado_por=u;
  -- Pausing revokes the test grant; it does not erase chats or credentials.
  if not p_activo then update gestlok_chat_private.wai_pilotos set cancelado=true where sucursal_id=v_local.id and not cancelado and vence_at>now();end if;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'empresa',e.nombre_publico,'nombre',s.nombre,
  'rubro',c.rubro,'activo',coalesce(c.activo,false),'lineas',(select count(*) from gestlok_chat_private.whatsapp_premium_habilitaciones h where h.tenant_id=s.tenant_id and h.local_id=s.local_id and h.habilitada))
  order by e.nombre_publico,s.nombre) from gestlok_chat_private.sucursales s
  join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.habilitada
  join public.docs d on d.tenant_id=s.tenant_id and d.col='locales' and d.id=s.local_id
  left join gestlok_chat_private.wai_comercios c on c.sucursal_id=s.id
  where e.nombre_publico ilike '%(prueba)%'),'[]'::jsonb);
end$$;
revoke all on function public.gestlok_chat_wai_comercios(text,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_comercios(text,uuid,text,boolean,text) to authenticated;

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
   join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.tenant_id=s.tenant_id and h.local_id=s.local_id
   where s.id=p_sucursal) then return null; end if;
 if gestlok_chat_private.es_creadora_chat() then
   perform gestlok_platform.require_admin(); return 'configurar';
 end if;
 if coalesce(public.mi_rol(),'') not in ('dueno','gerente') then return null; end if;
 n:=gestlok_chat_private.nivel(p_sucursal);
 if n in ('gestionar','configurar') then return n; end if;
 return null;
end$function$
;

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
  and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.wa_verificada_at>now()-interval '35 seconds')
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
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_ensayo_autorizado(p_id uuid, p_clave text, p_revision uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',now())
 from gestlok_chat_private.wai_pilotos p
 join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=p.habilitacion_id
 join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=p.habilitacion_id and h.habilitada
 join gestlok_chat_private.sucursales s on s.id=p.sucursal_id and s.tenant_id=h.tenant_id and s.local_id=h.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
 join public.docs d on d.tenant_id=h.tenant_id and d.id=h.local_id and d.col='locales'
 where p.habilitacion_id=p_id and p_clave ~ '^[a-f0-9]{64}$'
 and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision
 and gestlok_chat_private.wai_rubro_activo(p.sucursal_id) and not p.cancelado and p.vence_at>now()
 and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
 order by p.creado_at desc limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_portal_inicio(p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Iniciá sesión en GESTLOK' using errcode='42501'; end if;
 if p_slug is not null and p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Enlace inválido' using errcode='22023'; end if;
 return jsonb_build_object('administradora',gestlok_chat_private.es_creadora_chat(),
 'piloto_disponible',(select habilitado from gestlok_chat_private.wai_piloto_entorno where id),
 'locales',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'local_id',s.local_id,'slug',s.slug,'nombre',s.nombre,'empresa',e.nombre_publico,
  'rubro','gastronomia','nivel',gestlok_chat_private.wai_portal_nivel(s.id)) order by e.nombre_publico,s.nombre)
 from gestlok_chat_private.sucursales s join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id
 where (p_slug is null or s.slug=p_slug) and gestlok_chat_private.wai_portal_nivel(s.id) is not null),'[]'::jsonb));
end$function$
;

