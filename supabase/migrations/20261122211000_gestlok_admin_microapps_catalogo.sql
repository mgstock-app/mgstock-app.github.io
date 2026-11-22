-- Catálogo universal de microapps; habilitaciones aisladas por tenant.
-- Sin backfill ni mutaciones a empresas existentes.
create table if not exists gestlok_platform.microapp_catalog (
 app_code text primary key,
 nombre text not null,
 descripcion text not null,
 defaults jsonb not null default '{}'::jsonb,
 version integer not null default 1,
 asignable boolean not null default true
);
alter table gestlok_platform.microapp_catalog enable row level security;
revoke all on gestlok_platform.microapp_catalog from public,anon,authenticated;
insert into gestlok_platform.microapp_catalog(app_code,nombre,descripcion,defaults,version)
values
 ('gestlok_chat','GESTLOK Chat','Atención, pedidos y central de mensajes por sucursal',
  '{"scope":"tenant_local","catalogo_por_local":true,"roles":"permisos_vigentes","diseno":"global","chat_inicia_pausado":true}'::jsonb,1),
 ('sistema_ventas','Sistema de ventas','Ventas, stock, precios y dispositivos del Plan Scanner',
  '{"scope":"tenant","catalogo_por_local":true,"roles":"permisos_vigentes","diseno":"global","requiere_dueno_registrado":true}'::jsonb,1)
on conflict(app_code) do nothing;

create table if not exists gestlok_platform.company_microapps (
 tenant_id uuid not null references gestlok_tenancy.tenants(id) on delete restrict,
 app_code text not null references gestlok_platform.microapp_catalog(app_code),
 enabled boolean not null default false,
 configuracion jsonb not null default '{}'::jsonb,
 assigned_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(tenant_id,app_code)
);
alter table gestlok_platform.company_microapps enable row level security;
revoke all on gestlok_platform.company_microapps from public,anon,authenticated;

-- Solo la administradora real. Un rol oculto en el navegador no autoriza este RPC.
create or replace function gestlok_platform.exigir_creadora_microapps()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
 v_id:=gestlok_platform.require_admin();
 if v_id is null or not exists(select 1 from auth.users u
    where u.id=v_id and lower(u.email)='kmu15lopez@gmail.com') then
   raise exception 'Acceso exclusivo de la administradora' using errcode='42501';
 end if;
 return v_id;
end $$;
revoke all on function gestlok_platform.exigir_creadora_microapps() from public,anon,authenticated;

-- Alta simple y atómica: dueño obligatorio, gerente opcional y primer local por defecto.
-- Reutiliza el alta de plataforma (tenant, roles, configuración) existente.
create or replace function public.gestlok_creator_crear_empresa_microapps(
 p_nombre text,p_dueno_email text,p_gerente_email text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_info jsonb; v_gerente text:=lower(btrim(coalesce(p_gerente_email,'')));
 v_dueno text:=lower(btrim(coalesce(p_dueno_email,''))); v_tenant uuid; v_local text;
begin
 perform gestlok_platform.exigir_creadora_microapps();
 if v_gerente<>'' then
   if length(v_gerente)>254 or v_gerente !~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$'
      or v_gerente=v_dueno then
      raise exception 'Email del gerente inválido o igual al del dueño' using errcode='22023';
   end if;
   if exists(select 1 from public.docs d
     where d.col='equipo' and lower(d.data->>'email')=v_gerente)
      or exists(select 1 from gestlok_platform.admins a
         join auth.users u on u.id=a.user_id where lower(u.email)=v_gerente) then
      raise exception 'El email del gerente ya pertenece a otra empresa' using errcode='22023';
   end if;
 end if;
 v_info:=public.gestlok_creator_prepare_company_named(
   p_nombre,p_dueno_email,'fisica','Local principal','Responsable');
 v_tenant:=(v_info->>'tenant_id')::uuid;
 v_local:=v_info->>'local_id';
 if v_gerente<>'' then
   insert into public.docs(col,id,data,tenant_id,updated_by)
   values('equipo',v_gerente,jsonb_build_object('email',v_gerente,'rol','gerente',
     'locales',jsonb_build_array(v_local),
     'agregado',(extract(epoch from now())*1000)::bigint),v_tenant,'gestlok-platform');
 end if;
 insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
 values(auth.uid(),'company_created',v_tenant,
   jsonb_build_object('gerente_asignado',v_gerente<>'','app_default','ninguna'));
 return v_info||jsonb_build_object('gerente',nullif(v_gerente,''));
end $$;
revoke all on function public.gestlok_creator_crear_empresa_microapps(text,text,text)
 from public,anon,authenticated;
grant execute on function public.gestlok_creator_crear_empresa_microapps(text,text,text) to authenticated;

-- Consulta de catálogo y asignaciones. El estado real de cada app es distinto al deseado.
-- Las empresas heredadas se muestran a través de sus servicios existentes sin modificarlas.
create or replace function public.gestlok_creator_microapps()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform gestlok_platform.exigir_creadora_microapps();
 return coalesce((
   select jsonb_agg(jsonb_build_object(
     'tenant_id',c.tenant_id,'app_code',a.app_code,'nombre',a.nombre,
     'descripcion',a.descripcion,'version',a.version,
     'habilitada',coalesce(m.enabled,
       case when a.app_code='gestlok_chat' then
          exists(select 1 from gestlok_chat_private.empresas ce
                 where ce.tenant_id=c.tenant_id and ce.habilitada)
       when a.app_code='sistema_ventas' then
          exists(select 1 from public.gestlok_pilot_access p
                 where p.tenant_id=c.tenant_id and p.enabled and p.plan_code='scanner')
       else false end),
     'estado',case
       when a.app_code='gestlok_chat' and exists
            (select 1 from gestlok_chat_private.empresas ce
             where ce.tenant_id=c.tenant_id and ce.habilitada) then 'activa'
       when a.app_code='sistema_ventas' and exists
            (select 1 from public.gestlok_pilot_access p where p.tenant_id=c.tenant_id
             and p.enabled and p.plan_code='scanner') then 'activa'
       when m.enabled then 'esperando_configuracion'
       else 'desactivada' end,
     'configuracion',coalesce(m.configuracion,'{}'::jsonb)
   ) order by c.name,a.nombre)
   from gestlok_platform.companies c
   cross join gestlok_platform.microapp_catalog a
   left join gestlok_platform.company_microapps m
    on m.tenant_id=c.tenant_id and m.app_code=a.app_code
   where a.asignable
 ),'[]'::jsonb);
end $$;
revoke all on function public.gestlok_creator_microapps()
 from public,anon,authenticated;
grant execute on function public.gestlok_creator_microapps() to authenticated;

-- Activación por empresa y app, nunca global. Apagar una app NO elimina sus datos.
create or replace function public.gestlok_creator_asignar_microapp(
 p_tenant uuid,p_app text,p_habilitar boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_admin uuid; v_owner_email text; v_owner_uid uuid; v_name text;
 v_actual uuid; v_estado text;
begin
 v_admin:=gestlok_platform.exigir_creadora_microapps();
 if p_habilitar is null then raise exception 'Elegí habilitar o deshabilitar' using errcode='22023'; end if;
 if p_app not in ('gestlok_chat','sistema_ventas') then
   raise exception 'Microapp no habilitada para asignación' using errcode='22023'; end if;
 select c.name,c.owner_email into v_name,v_owner_email
 from gestlok_platform.companies c where c.tenant_id=p_tenant;
 if v_name is null then raise exception 'Empresa no registrada' using errcode='22023'; end if;
 if p_app='gestlok_chat' then
   if p_habilitar then
     perform public.gestlok_chat_admin_habilitar(p_tenant,left(v_name,80),null);
   elsif exists(select 1 from gestlok_chat_private.empresas where tenant_id=p_tenant) then
     perform public.gestlok_chat_admin_estado(p_tenant,false);
   end if;
   v_estado:=case when p_habilitar then 'activa' else 'desactivada' end;
 else
   select u.id into v_owner_uid from auth.users u where lower(u.email)=lower(v_owner_email);
   if p_habilitar and v_owner_uid is not null then
     if not exists(select 1 from public.docs d where d.tenant_id=p_tenant and d.col='equipo'
         and lower(d.data->>'email')=lower(v_owner_email) and d.data->>'rol'='dueno') then
       raise exception 'Dueño no vinculado con esta empresa' using errcode='42501';
     end if;
     select p.owner_uid into v_actual from public.gestlok_pilot_access p where p.tenant_id=p_tenant;
     if v_actual is not null and v_actual<>v_owner_uid then
       raise exception 'El Plan Scanner pertenece a otro usuario: revisar antes de activar' using errcode='42501';end if;
     insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)
      values(p_tenant,v_owner_uid,true,'scanner')
      on conflict(tenant_id) do update set enabled=true
      where public.gestlok_pilot_access.owner_uid=excluded.owner_uid;
   elsif not p_habilitar then
     update public.gestlok_pilot_access set enabled=false where tenant_id=p_tenant;
   end if;
   v_estado:=case when not p_habilitar then 'desactivada'
     when v_owner_uid is null then 'esperando_dueno' else 'activa' end;
 end if;
 insert into gestlok_platform.company_microapps(tenant_id,app_code,enabled,assigned_by)
 values(p_tenant,p_app,p_habilitar,v_admin)
 on conflict(tenant_id,app_code) do update set
 enabled=excluded.enabled,assigned_by=excluded.assigned_by,updated_at=now();
 insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
 values(v_admin,'microapp_asignada',p_tenant,
 jsonb_build_object('app',p_app,'habilitada',p_habilitar,'estado',v_estado));
 return jsonb_build_object('ok',true,'tenant_id',p_tenant,
   'app_code',p_app,'habilitada',p_habilitar,'estado',v_estado);
end $$;
revoke all on function public.gestlok_creator_asignar_microapp(uuid,text,boolean)
 from public,anon,authenticated;
grant execute on function public.gestlok_creator_asignar_microapp(uuid,text,boolean) to authenticated;

-- Dueño que se registra después: se activa SU scanner, nunca uno ajeno.
create or replace function public.gestlok_microapps_activar_dueno()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid:=auth.uid(); v_email text; v_empresa record; v_actual uuid;
 v_count integer:=0;
begin
 if v_id is null then raise exception 'Sesión requerida' using errcode='42501'; end if;
 select lower(u.email) into v_email from auth.users u where u.id=v_id;
 if v_email is null then raise exception 'Email de sesión no encontrado' using errcode='42501'; end if;
 for v_empresa in
   select c.tenant_id from gestlok_platform.companies c
   join gestlok_platform.company_microapps m on m.tenant_id=c.tenant_id
     and m.app_code='sistema_ventas' and m.enabled
   where lower(c.owner_email)=v_email
   and exists(select 1 from public.docs d where d.tenant_id=c.tenant_id and d.col='equipo'
      and d.data->>'rol'='dueno' and lower(d.data->>'email')=v_email)
 loop
   select p.owner_uid into v_actual from public.gestlok_pilot_access p
     where p.tenant_id=v_empresa.tenant_id;
   if v_actual is not null and v_actual<>v_id then continue; end if;
   insert into public.gestlok_pilot_access(tenant_id,owner_uid,enabled,plan_code)
   values(v_empresa.tenant_id,v_id,true,'scanner')
   on conflict(tenant_id) do update set enabled=true
      where public.gestlok_pilot_access.owner_uid=excluded.owner_uid;
   v_count:=v_count+1;
 end loop;
 return jsonb_build_object('ok',true,'activadas',v_count);
end $$;
revoke all on function public.gestlok_microapps_activar_dueno()
 from public,anon,authenticated;
grant execute on function public.gestlok_microapps_activar_dueno() to authenticated;
