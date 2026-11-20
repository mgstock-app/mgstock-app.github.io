-- Migración aplicada en Supabase el 2026-11-20, versión 20261120163305.
-- Mi Gusto: marca compartida para la creadora, tenant aislado por grupo de dueños.
-- No toca propietarios, locales ni datos existentes salvo registrar la raíz de marca.
create table if not exists gestlok_platform.brand_memberships (
 tenant_id uuid primary key references gestlok_tenancy.tenants(id) on delete restrict,
 root_tenant uuid not null references gestlok_tenancy.tenants(id) on delete restrict,
 brand_name text not null check(length(btrim(brand_name)) between 2 and 100),
 created_at timestamptz not null default now()
);
revoke all on gestlok_platform.brand_memberships from public,anon,authenticated;
alter table gestlok_platform.brand_memberships enable row level security;
create index if not exists brand_memberships_root_idx on gestlok_platform.brand_memberships(root_tenant);
insert into gestlok_platform.brand_memberships(tenant_id,root_tenant,brand_name)
values('cb0dc04a-9a13-434f-a3d0-47f1d8f39670','cb0dc04a-9a13-434f-a3d0-47f1d8f39670','Mi Gusto')
on conflict(tenant_id) do nothing;

CREATE OR REPLACE FUNCTION public.gestlok_creator_add_brand_local(p_parent_tenant uuid, p_local_name text, p_owner_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_root uuid;v_target uuid;v_existing uuid;v_brand text;v_mode text;v_local text;
 v_name text:=btrim(coalesce(p_local_name,''));
 v_email text:=lower(btrim(coalesce(p_owner_email,'')));
 v_setup jsonb;v_new_group boolean:=false;
begin
 perform gestlok_platform.require_admin();
 if not exists(select 1 from gestlok_tenancy.tenants where id=p_parent_tenant) then
  raise exception 'Empresa inexistente' using errcode='P0002';
 end if;
 if length(v_name) not between 2 and 80 then
  raise exception 'Ingresá un nombre de local de 2 a 80 caracteres' using errcode='22023';
 end if;
 if length(v_email)>254 or v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$' then
  raise exception 'Ingresá un correo de dueño válido' using errcode='22023';
 end if;
 select coalesce(m.root_tenant,p_parent_tenant) into v_root
 from gestlok_tenancy.tenants t
 left join gestlok_platform.brand_memberships m on m.tenant_id=t.id
 where t.id=p_parent_tenant;
 perform pg_advisory_xact_lock(hashtextextended(v_root::text,0));
 select coalesce(m.brand_name,c.name,
   case when v_root='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid then 'Mi Gusto' end,'Empresa'),
   coalesce(c.mode,(select d.data->>'tipo' from public.docs d
     where d.col='configuracion_negocio' and d.tenant_id=v_root limit 1),'fisica')
 into v_brand,v_mode from gestlok_tenancy.tenants t
 left join gestlok_platform.brand_memberships m on m.tenant_id=t.id
 left join gestlok_platform.companies c on c.tenant_id=t.id where t.id=v_root;
 if v_mode not in ('fisica','online','mixta') then v_mode:='fisica';end if;
 insert into gestlok_platform.brand_memberships(tenant_id,root_tenant,brand_name)
 values(v_root,v_root,v_brand) on conflict(tenant_id) do nothing;
 select d.tenant_id into v_existing from public.docs d
 where d.col='equipo' and lower(d.data->>'email')=v_email limit 1;
 if v_existing is not null then
  if not exists(select 1 from public.docs d where d.col='equipo' and d.tenant_id=v_existing
     and lower(d.data->>'email')=v_email and d.data->>'rol'='dueno')
    or coalesce((select m.root_tenant from gestlok_platform.brand_memberships m
       where m.tenant_id=v_existing),v_existing)<>v_root then
   raise exception 'El correo ya está asignado a otro rol o empresa. No se cambió ningún permiso.'
    using errcode='42501';
  end if;
  v_target:=v_existing;
 else
  v_setup:=public.gestlok_creator_prepare_company(v_brand,v_email,v_mode,v_name);
  v_target:=(v_setup->>'tenant_id')::uuid;
  v_local:=v_setup->>'local_id';
  v_new_group:=true;
  insert into gestlok_platform.brand_memberships(tenant_id,root_tenant,brand_name)
    values(v_target,v_root,v_brand);
 end if;
 if not v_new_group then
  if exists(select 1 from public.docs d where d.col='locales' and d.tenant_id=v_target
      and lower(btrim(d.data->>'nombre'))=lower(v_name)) then
   raise exception 'Ese nombre de local ya está registrado para el mismo grupo de dueños'
     using errcode='23505';
  end if;
  v_local:='loc-'||substr(replace(gen_random_uuid()::text,'-',''),1,20);
  insert into public.docs(col,id,data,tenant_id,updated_by)
  values('locales',v_local,jsonb_build_object('nombre',v_name,'orden',
     1+(select count(*) from public.docs d where d.col='locales' and d.tenant_id=v_target)),
     v_target,'gestlok-platform');
 end if;
 -- Registra solo la sucursal nueva en GESTLOK Chat. El chat público queda apagado.
 if exists(select 1 from gestlok_chat_private.empresas e
      where e.tenant_id=v_target and e.habilitada)
    or exists(select 1 from gestlok_chat_private.empresas e
      where e.tenant_id=v_root and e.habilitada) then
   perform public.gestlok_chat_admin_habilitar(v_target,v_brand,
    jsonb_build_array(jsonb_build_object('local_id',v_local,'nombre',v_name)));
 end if;
 return jsonb_build_object('ok',true,'empresa',v_brand,'local',v_name,
  'local_id',v_local,'tenant_id',v_target,'owner_email',v_email,
  'grupo_nuevo',v_new_group,'registro_requerido',v_new_group);
end $function$
revoke all on function public.gestlok_creator_add_brand_local(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gestlok_creator_add_brand_local(uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_creator_brand_links_index()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform gestlok_platform.require_admin();
 return jsonb_build_object('scope','brand_links','links',
  coalesce((select jsonb_agg(jsonb_build_object(
   'tenant_id',t.id,'root_tenant',coalesce(m.root_tenant,t.id),
   'brand_name',coalesce(m.brand_name,c.name,'Empresa')) order by t.created_at,t.id)
   from gestlok_tenancy.tenants t
   left join gestlok_platform.brand_memberships m on m.tenant_id=t.id
   left join gestlok_platform.companies c on c.tenant_id=t.id),'[]'::jsonb));
end $function$
revoke all on function public.gestlok_creator_brand_links_index() from public,anon,authenticated;
grant execute on function public.gestlok_creator_brand_links_index() to authenticated;

