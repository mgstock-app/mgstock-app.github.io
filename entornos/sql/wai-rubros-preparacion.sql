-- Clasificación comercial independiente de la activación del motor gastronómico.
-- No registra números, no crea pedidos, no cambia cartas ni habilita transporte.
create table if not exists gestlok_chat_private.wai_rubros_locales(
 tenant_id uuid not null references gestlok_tenancy.tenants(id),
 local_id text not null,
 rubro text not null check(rubro in ('gastronomia','cafeteria','almacen','perfumeria','ferreteria','mascotas','servicios','otro')),
 actualizado_at timestamptz not null default now(),
 primary key(tenant_id,local_id)
);
alter table gestlok_chat_private.wai_rubros_locales enable row level security;
revoke all on gestlok_chat_private.wai_rubros_locales from public,anon,authenticated;
-- El rubro de Mi Gusto es conocido; no cambia ninguna habilitación.
insert into gestlok_chat_private.wai_rubros_locales(tenant_id,local_id,rubro)
select s.tenant_id,s.local_id,'gastronomia' from gestlok_chat_private.sucursales s
join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id
where s.slug in ('mi-gusto-munro','mi-gusto-torcuato') and lower(e.nombre_publico) in ('mi gusto','mi gusto (prueba)')
on conflict(tenant_id,local_id) do nothing;
create or replace function gestlok_chat_private.wai_rubro_declarado(p_tenant uuid,p_local text)
returns text language sql volatile set search_path='' as $$
 select coalesce(
 (select rubro from gestlok_chat_private.wai_rubros_locales where tenant_id=p_tenant and local_id=p_local),
 (select c.rubro from gestlok_chat_private.wai_comercios c join gestlok_chat_private.sucursales s on s.id=c.sucursal_id where s.tenant_id=p_tenant and s.local_id=p_local),
 (select r.rubro from gestlok_chat_private.wai_plantillas_empresa p
  join gestlok_chat_private.sucursales s on s.id=p.fuente and s.tenant_id=p.tenant_id
  join gestlok_chat_private.wai_rubros_locales r on r.tenant_id=s.tenant_id and r.local_id=s.local_id
  where p.tenant_id=p_tenant))
$$;
revoke all on function gestlok_chat_private.wai_rubro_declarado(uuid,text) from public,anon,authenticated;
create or replace function public.gestlok_chat_wai_admin_rubro(p_tenant uuid,p_local text,p_rubro text)
returns text language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 perform gestlok_platform.require_admin();
 if p_rubro is null or p_rubro not in ('gastronomia','cafeteria','almacen','perfumeria','ferreteria','mascotas','servicios','otro') then raise exception 'Rubro inválido' using errcode='22023';end if;
 if not exists(select 1 from public.docs where tenant_id=p_tenant and col='locales' and id=p_local) then raise exception 'Local no perteneciente a empresa' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_local,0));
 if p_rubro<>'gastronomia' and exists(select 1 from gestlok_chat_private.sucursales s join gestlok_chat_private.wai_comercios c on c.sucursal_id=s.id where s.tenant_id=p_tenant and s.local_id=p_local and c.activo) then
  raise exception 'Pausá WAI antes de cambiar a un rubro en preparación' using errcode='22023';
 end if;
 insert into gestlok_chat_private.wai_rubros_locales(tenant_id,local_id,rubro) values(p_tenant,p_local,p_rubro)
 on conflict(tenant_id,local_id) do update set rubro=excluded.rubro,actualizado_at=now();
 return p_rubro;
end$$;
revoke all on function public.gestlok_chat_wai_admin_rubro(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_admin_rubro(uuid,text,text) to authenticated;
-- Incluso una llamada directa a la RPC antigua debe respetar el rubro declarado.
create or replace function gestlok_chat_private.wai_validar_rubro_activacion()
returns trigger language plpgsql set search_path='' as $$
declare s gestlok_chat_private.sucursales; r text;
begin
 if new.activo then
  select * into s from gestlok_chat_private.sucursales where id=new.sucursal_id;
  perform pg_advisory_xact_lock(hashtextextended(s.tenant_id::text||':'||s.local_id,0));
  r=gestlok_chat_private.wai_rubro_declarado(s.tenant_id,s.local_id);
  if coalesce(r,'gastronomia')<>'gastronomia' then raise exception 'Este rubro está en preparación. No se habilita el motor gastronómico.' using errcode='22023';end if;
 end if;
 return new;
end$$;
revoke all on function gestlok_chat_private.wai_validar_rubro_activacion() from public,anon,authenticated;
create or replace trigger wai_validar_rubro_activacion before insert or update of activo,rubro on gestlok_chat_private.wai_comercios for each row execute function gestlok_chat_private.wai_validar_rubro_activacion();

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_admin_organizacion(p_accion text DEFAULT 'listar'::text, p_tenant uuid DEFAULT NULL::uuid, p_local text DEFAULT NULL::text, p_owner text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare src uuid;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 perform gestlok_platform.require_admin();
 if p_accion in ('responsable','plantilla') then
  if not exists(select 1 from public.docs where tenant_id=p_tenant and col='locales' and id=p_local) then raise exception 'Local no perteneciente a empresa' using errcode='42501';end if;
  if p_accion='responsable' then
   if p_owner is null or p_owner='' then delete from gestlok_chat_private.wai_responsables where tenant_id=p_tenant and local_id=p_local;
   else
    if not exists(select 1 from public.docs d where d.tenant_id=p_tenant and d.col='equipo' and d.id=p_owner and d.data->>'rol'='dueno' and (coalesce(d.data->'locales','[]'::jsonb)='[]'::jsonb or d.data->'locales' ? p_local)) then raise exception 'Responsable no autorizado para el local' using errcode='42501';end if;
    insert into gestlok_chat_private.wai_responsables(tenant_id,local_id,equipo_id) values(p_tenant,p_local,p_owner) on conflict(tenant_id,local_id) do update set equipo_id=excluded.equipo_id,actualizado_at=now();
   end if;
  else
   select id into src from gestlok_chat_private.sucursales where tenant_id=p_tenant and local_id=p_local;
   perform gestlok_chat_private.wai_capturar_plantilla(p_tenant,src);
  end if;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('tenant',l.tenant_id,'local_id',l.id,
  'responsable_id',o.id,'responsable',o.data->>'nombre','plantilla',tp.fuente is not null,'rubro',gestlok_chat_private.wai_rubro_declarado(l.tenant_id,l.id),
  'duenos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'nombre',coalesce(nullif(d.data->>'nombre',''),'Dueño')) order by d.data->>'nombre') from public.docs d where d.tenant_id=l.tenant_id and d.col='equipo' and d.data->>'rol'='dueno' and (coalesce(d.data->'locales','[]'::jsonb)='[]'::jsonb or d.data->'locales' ? l.id)),'[]'::jsonb)))
 from public.docs l left join gestlok_chat_private.wai_responsables r on r.tenant_id=l.tenant_id and r.local_id=l.id
 left join public.docs o on o.tenant_id=l.tenant_id and o.col='equipo' and o.id=r.equipo_id and o.data->>'rol'='dueno' and (coalesce(o.data->'locales','[]'::jsonb)='[]'::jsonb or o.data->'locales' ? l.id)
 left join gestlok_chat_private.wai_plantillas_empresa tp on tp.tenant_id=l.tenant_id
 where l.col='locales'),'[]'::jsonb);
end $function$
;
revoke all on function public.gestlok_chat_wai_admin_organizacion(text,uuid,text,text) from public,anon;
grant execute on function public.gestlok_chat_wai_admin_organizacion(text,uuid,text,text) to authenticated;
