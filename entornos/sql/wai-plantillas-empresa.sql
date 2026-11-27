-- Company templates and WAI responsible owner. Private, no real phone or payment data copied.
create table if not exists gestlok_chat_private.wai_plantillas_empresa(
 tenant_id uuid primary key references gestlok_tenancy.tenants(id),
 fuente uuid not null,
 config jsonb not null, categorias jsonb not null, productos jsonb not null,
 paginas jsonb not null, atencion jsonb, actualizado_at timestamptz not null default now()
);
create table if not exists gestlok_chat_private.wai_responsables(
 tenant_id uuid not null references gestlok_tenancy.tenants(id),
 local_id text not null, equipo_id text not null, actualizado_at timestamptz not null default now(),
 primary key(tenant_id,local_id)
);
alter table gestlok_chat_private.wai_plantillas_empresa enable row level security;
alter table gestlok_chat_private.wai_responsables enable row level security;
revoke all on gestlok_chat_private.wai_plantillas_empresa,gestlok_chat_private.wai_responsables from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_capturar_plantilla(p_tenant uuid,p_fuente uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s gestlok_chat_private.sucursales;
begin
 select * into s from gestlok_chat_private.sucursales where id=p_fuente and tenant_id=p_tenant;
 if s.id is null then raise exception 'Sucursal de otra empresa o inexistente' using errcode='42501'; end if;
 if not exists(select 1 from gestlok_chat_private.productos where sucursal_id=s.id and tenant_id=p_tenant) then raise exception 'La sucursal no tiene una carta para copiar'; end if;
 insert into gestlok_chat_private.wai_plantillas_empresa(tenant_id,fuente,config,categorias,productos,paginas,atencion)
 values(p_tenant,s.id,
 jsonb_build_object('horario',s.horario,'acepta_retiro',s.acepta_retiro,'acepta_envio',s.acepta_envio,'envio_costo',s.envio_costo,'pedido_minimo',s.pedido_minimo,'medios_pago',s.medios_pago,'medios_pago_retiro',s.medios_pago_retiro,'medios_pago_envio',s.medios_pago_envio,'demora_retiro',s.demora_retiro,'demora_envio',s.demora_envio,'turnos_chat',s.turnos_chat,'descuento_efectivo_pct',s.descuento_efectivo_pct,'menu_interactivo',s.menu_interactivo,'descuento_efectivo_entrega',s.descuento_efectivo_entrega,'precio_efectivo_en_carta',s.precio_efectivo_en_carta,'dias_apertura',s.dias_apertura,'carta_texto',s.carta_texto,'carta_imagen_url',s.carta_imagen_url,'ia_activa',s.ia_activa),
 coalesce((select jsonb_agg(to_jsonb(c)) from gestlok_chat_private.categorias c where c.sucursal_id=s.id and c.tenant_id=p_tenant),'[]'),
 coalesce((select jsonb_agg(to_jsonb(p)) from gestlok_chat_private.productos p where p.sucursal_id=s.id and p.tenant_id=p_tenant),'[]'),
 coalesce((select jsonb_agg(to_jsonb(p)) from gestlok_chat_private.wai_carta_paginas p where p.sucursal_id=s.id),'[]'),
 (select to_jsonb(a)-'sucursal_id'-'actualizado_at' from gestlok_chat_private.wai_atencion_config a where a.sucursal_id=s.id))
 on conflict(tenant_id) do update set fuente=excluded.fuente,config=excluded.config,categorias=excluded.categorias,productos=excluded.productos,paginas=excluded.paginas,atencion=excluded.atencion,actualizado_at=now();
end $$;
revoke all on function gestlok_chat_private.wai_capturar_plantilla(uuid,uuid) from public,anon,authenticated;

create or replace function gestlok_chat_private.wai_aplicar_plantilla_nueva()
returns trigger language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function gestlok_chat_private.wai_aplicar_plantilla_nueva() from public,anon,authenticated;
-- Replace the previous Mi Gusto-only trigger (ambiguous productos variable).
drop trigger if exists heredar_carta_mi_gusto on gestlok_chat_private.sucursales;
drop trigger if exists wai_copiar_plantilla_nueva on gestlok_chat_private.sucursales;
create trigger wai_copiar_plantilla_nueva after insert on gestlok_chat_private.sucursales for each row execute function gestlok_chat_private.wai_aplicar_plantilla_nueva();

-- Only WAI/Chat owner permissions, not the rest of GESTLOK. Existing company-wide owner
-- roles with no explicit scope retain legacy access; explicit local lists are enforced.
create or replace function gestlok_chat_private.nivel(p_sucursal uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_t uuid; v_local text; v_rol text;
begin
 if auth.uid() is null or p_sucursal is null then return null; end if;
 select s.tenant_id,s.local_id into v_t,v_local from gestlok_chat_private.sucursales s join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.habilitada where s.id=p_sucursal;
 if v_t is null or gestlok_tenancy.current_tenant_id() is distinct from v_t then return null;end if;
 v_rol:=public.mi_rol();
 if v_rol='creadora' then perform gestlok_platform.require_admin();return 'configurar';end if;
 if v_rol='dueno' and public.puede_editar_local(v_local) and exists(
  select 1 from public.docs d where d.tenant_id=v_t and d.col='equipo' and d.data->>'rol'='dueno' and lower(d.data->>'email')=lower(coalesce(auth.jwt()->>'email',''))
  and (coalesce(d.data->'locales','[]'::jsonb)='[]'::jsonb or (d.data->'locales') ? v_local)
 ) then return 'configurar';end if;
 if v_rol='gerente' and public.puede_editar_local(v_local) then return 'configurar';end if;
 if v_rol='editor' and public.puede_editar_local(v_local) then return 'gestionar';end if;
 if v_rol='lectura' and gestlok_platform.support_tenant() is not distinct from v_t then return 'ver';end if;
 return null;
end $$;

create or replace function public.gestlok_chat_wai_admin_organizacion(p_accion text default 'listar',p_tenant uuid default null,p_local text default null,p_owner text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
  'responsable_id',o.id,'responsable',o.data->>'nombre','plantilla',tp.fuente is not null,
  'duenos',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'nombre',coalesce(nullif(d.data->>'nombre',''),'Dueño')) order by d.data->>'nombre') from public.docs d where d.tenant_id=l.tenant_id and d.col='equipo' and d.data->>'rol'='dueno' and (coalesce(d.data->'locales','[]'::jsonb)='[]'::jsonb or d.data->'locales' ? l.id)),'[]'::jsonb)))
 from public.docs l left join gestlok_chat_private.wai_responsables r on r.tenant_id=l.tenant_id and r.local_id=l.id
 left join public.docs o on o.tenant_id=l.tenant_id and o.col='equipo' and o.id=r.equipo_id and o.data->>'rol'='dueno' and (coalesce(o.data->'locales','[]'::jsonb)='[]'::jsonb or o.data->'locales' ? l.id)
 left join gestlok_chat_private.wai_plantillas_empresa tp on tp.tenant_id=l.tenant_id
 where l.col='locales'),'[]'::jsonb);
end $$;
revoke all on function public.gestlok_chat_wai_admin_organizacion(text,uuid,text,text) from public,anon;
grant execute on function public.gestlok_chat_wai_admin_organizacion(text,uuid,text,text) to authenticated;

-- Initial company template: Munro, never overwrite an existing template or local.
do $$ declare s gestlok_chat_private.sucursales; begin
 select x.* into s from gestlok_chat_private.sucursales x join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id where x.slug='mi-gusto-munro' and lower(e.nombre_publico) in ('mi gusto','mi gusto (prueba)');
 if s.id is not null and not exists(select 1 from gestlok_chat_private.wai_plantillas_empresa where tenant_id=s.tenant_id) then perform gestlok_chat_private.wai_capturar_plantilla(s.tenant_id,s.id);end if;
 -- Responsible owners are assigned privately by administration.
end $;
