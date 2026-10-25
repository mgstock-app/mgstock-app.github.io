-- GESTLOK · habilitación del módulo «Administrar a los empleados» por empresa.
-- Aditiva: no modifica docs, equipo, locales ni datos de ReciboNet.
-- · gestlok_platform.company_modules: módulo habilitado/deshabilitado por la creadora, por empresa.
-- · gestlok_platform.recibonet_links: vínculo explícito y verificado empresa GESTLOK ↔ organización ReciboNet.
-- · gestlok_platform.admin_audit: registro de acciones administrativas relevantes.
-- Las tres tablas son privadas (esquema sin USAGE para clientes); solo se usan desde funciones.

create table if not exists gestlok_platform.company_modules(
  tenant_id uuid not null references gestlok_tenancy.tenants(id),
  module text not null check (module in ('recibos_personal')),
  enabled boolean not null default false,
  changed_by uuid not null,
  changed_at timestamptz not null default now(),
  primary key (tenant_id, module)
);
create table if not exists gestlok_platform.recibonet_links(
  tenant_id uuid primary key references gestlok_tenancy.tenants(id),
  organization_id uuid not null unique,
  organization_number text not null unique check (organization_number ~ '^[0-9]{7}$'),
  internal_name text not null check (length(internal_name) between 1 and 80),
  verified_by uuid not null,
  verified_at timestamptz not null default now(),
  evidence jsonb not null default '{}'
);
create table if not exists gestlok_platform.admin_audit(
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null check (length(action) between 3 and 60),
  tenant_id uuid,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
alter table gestlok_platform.company_modules enable row level security;
alter table gestlok_platform.recibonet_links enable row level security;
alter table gestlok_platform.admin_audit enable row level security;
revoke all on gestlok_platform.company_modules, gestlok_platform.recibonet_links, gestlok_platform.admin_audit from public, anon, authenticated;

-- Solo la administradora registrada en gestlok_platform.admins (por identidad, no por rol visual).
create or replace function gestlok_platform.require_admin()
returns uuid language plpgsql stable security definer set search_path=''
as $$
begin
  perform gestlok_platform.registration_email();
  if not exists(select 1 from gestlok_platform.admins a where a.user_id = auth.uid()) then
    raise exception 'Acceso exclusivo de administradora autorizada' using errcode = '42501';
  end if;
  return auth.uid();
end $$;
revoke all on function gestlok_platform.require_admin() from public, anon, authenticated;

-- Contexto del dueño: el módulo de empleados queda autorizado solo si la creadora lo habilitó
-- para ESA empresa y existe el vínculo verificado con su organización de ReciboNet.
create or replace function public.gestlok_owner_area_context()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_email text:=gestlok_platform.registration_email();
 v_tenant uuid:=gestlok_tenancy.current_tenant_id();
 v_member jsonb; v_name text; v_locals jsonb; v_link gestlok_platform.recibonet_links; v_staff boolean;
begin
 if public.mi_rol() is distinct from 'dueno' then
  raise exception 'Acceso exclusivo de dueños autorizados' using errcode='42501';
 end if;
 select d.data into v_member from public.docs d
 where d.col='equipo' and d.tenant_id=v_tenant and lower(d.data->>'email')=v_email;
 if v_member is null then raise exception 'Sin empresa autorizada' using errcode='42501';end if;
 select coalesce(jsonb_agg(d.id order by d.id),'[]'::jsonb) into v_locals
 from public.docs d where d.col='locales' and d.tenant_id=v_tenant and public.puede_ver_local(d.id);
 select c.name into v_name from gestlok_platform.companies c where c.tenant_id=v_tenant;
 if v_member->>'logoId'='mi-gusto' then v_name:='Mi Gusto';end if;
 select * into v_link from gestlok_platform.recibonet_links l where l.tenant_id=v_tenant;
 v_staff:=v_link.tenant_id is not null and exists(select 1 from gestlok_platform.company_modules m
   where m.tenant_id=v_tenant and m.module='recibos_personal' and m.enabled);
 return jsonb_build_object('role','dueno','tenant_id',v_tenant,'company_name',coalesce(v_name,'Mi empresa'),
  'logo_id',case when v_member->>'logoId'='mi-gusto' then 'mi-gusto' else null end,
  'local_ids',v_locals,
  'recibonet',case when v_staff then jsonb_build_object('organization_number',v_link.organization_number,'internal_name',v_link.internal_name) else null end,
  'modules',jsonb_build_object(
    'comercial',jsonb_build_object('authorized',jsonb_array_length(v_locals)>0,'operational',true,'authority','existing_company_membership'),
    'recibos_personal',case when v_staff
      then jsonb_build_object('authorized',true,'operational',true,'authority','creator_module_grant')
      else jsonb_build_object('authorized',false,'operational',v_link.tenant_id is not null,'reason',
        case when v_link.tenant_id is null then 'company_not_linked' else 'module_not_enabled' end) end));
end $$;
revoke all on function public.gestlok_owner_area_context() from public, anon;
grant execute on function public.gestlok_owner_area_context() to authenticated;

-- Registro de empresas para la creadora: metadatos, módulos y vínculo. Nunca datos privados.
create or replace function public.gestlok_creator_companies_index()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 perform gestlok_platform.require_admin();
 return jsonb_build_object('scope','metadata_only','companies',coalesce((select jsonb_agg(
  jsonb_build_object('tenant_id',t.id,'name',coalesce(
    (select c.name from gestlok_platform.companies c where c.tenant_id=t.id),
    case when exists(select 1 from public.docs e where e.col='equipo' and e.tenant_id=t.id and e.data->>'logoId'='mi-gusto') then 'Mi Gusto' end,'Empresa'),
    'owners',(select count(*) from public.docs e where e.col='equipo' and e.tenant_id=t.id and e.data->>'rol'='dueno'),
    'locals',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.data->>'nombre') order by l.id) from public.docs l where l.col='locales' and l.tenant_id=t.id),'[]'::jsonb),
    'modules',jsonb_build_object(
      'comercial',true,
      'recibos_personal',coalesce((select m.enabled from gestlok_platform.company_modules m where m.tenant_id=t.id and m.module='recibos_personal'),false)),
    'recibonet',(select jsonb_build_object('organization_number',r.organization_number,'verified_at',r.verified_at) from gestlok_platform.recibonet_links r where r.tenant_id=t.id))
  order by t.created_at,t.id) from gestlok_tenancy.tenants t),'[]'::jsonb));
end $$;
revoke all on function public.gestlok_creator_companies_index() from public, anon;
grant execute on function public.gestlok_creator_companies_index() to authenticated;

-- Habilitar o deshabilitar el módulo de empleados de una empresa. Acción explícita y auditada.
create or replace function public.gestlok_creator_set_module(p_tenant uuid, p_module text, p_enabled boolean)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_admin uuid:=gestlok_platform.require_admin(); v_prev boolean;
begin
 if p_module is distinct from 'recibos_personal' then raise exception 'Módulo inválido' using errcode='22023';end if;
 if p_enabled is null then raise exception 'Estado inválido' using errcode='22023';end if;
 if not exists(select 1 from gestlok_tenancy.tenants t where t.id=p_tenant) then raise exception 'Empresa inexistente' using errcode='22023';end if;
 if p_enabled and not exists(select 1 from gestlok_platform.recibonet_links l where l.tenant_id=p_tenant) then
  raise exception 'La empresa no tiene una organización de ReciboNet vinculada y verificada' using errcode='22023';
 end if;
 select m.enabled into v_prev from gestlok_platform.company_modules m where m.tenant_id=p_tenant and m.module=p_module;
 insert into gestlok_platform.company_modules(tenant_id,module,enabled,changed_by,changed_at)
 values(p_tenant,p_module,p_enabled,v_admin,now())
 on conflict(tenant_id,module) do update set enabled=excluded.enabled,changed_by=excluded.changed_by,changed_at=excluded.changed_at;
 if v_prev is distinct from p_enabled then
  insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
  values(v_admin,case when p_enabled then 'module_enabled' else 'module_disabled' end,p_tenant,
         jsonb_build_object('module',p_module,'previous',v_prev));
 end if;
 return jsonb_build_object('tenant_id',p_tenant,'module',p_module,'enabled',p_enabled,'changed',v_prev is distinct from p_enabled);
end $$;
revoke all on function public.gestlok_creator_set_module(uuid,text,boolean) from public, anon;
grant execute on function public.gestlok_creator_set_module(uuid,text,boolean) to authenticated;

-- Registro de auditoría para la creadora (solo lectura, últimos 50 eventos, sin datos personales).
create or replace function public.gestlok_creator_audit()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 perform gestlok_platform.require_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('at',a.at,'action',a.action,'tenant_id',a.tenant_id,'detail',a.detail) order by a.at desc)
  from (select * from gestlok_platform.admin_audit order by at desc limit 50) a),'[]'::jsonb);
end $$;
revoke all on function public.gestlok_creator_audit() from public, anon;
grant execute on function public.gestlok_creator_audit() to authenticated;

-- Vínculo empresa ↔ ReciboNet: solo lo registra el operador tras verificar ambos registros
-- (no se expone a clientes). Idempotente y auditado; nunca reemplaza un vínculo distinto.
create or replace function gestlok_platform.link_recibonet_verified(
  p_tenant uuid, p_organization uuid, p_number text, p_internal_name text, p_admin uuid, p_evidence jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_existing gestlok_platform.recibonet_links;
begin
 if not exists(select 1 from gestlok_platform.admins a where a.user_id=p_admin) then raise exception 'Administradora no registrada';end if;
 if not exists(select 1 from gestlok_tenancy.tenants t where t.id=p_tenant) then raise exception 'Empresa inexistente';end if;
 select * into v_existing from gestlok_platform.recibonet_links l where l.tenant_id=p_tenant or l.organization_id=p_organization or l.organization_number=p_number;
 if v_existing.tenant_id is not null then
  if v_existing.tenant_id=p_tenant and v_existing.organization_id=p_organization and v_existing.organization_number=p_number then
   return jsonb_build_object('status','already_linked');
  end if;
  raise exception 'Ya existe otro vínculo para esta empresa u organización';
 end if;
 insert into gestlok_platform.recibonet_links(tenant_id,organization_id,organization_number,internal_name,verified_by,evidence)
 values(p_tenant,p_organization,p_number,p_internal_name,p_admin,coalesce(p_evidence,'{}'));
 insert into gestlok_platform.admin_audit(actor,action,tenant_id,detail)
 values(p_admin,'recibonet_linked',p_tenant,jsonb_build_object('organization_number',p_number));
 return jsonb_build_object('status','linked');
end $$;
revoke all on function gestlok_platform.link_recibonet_verified(uuid,uuid,text,text,uuid,jsonb) from public, anon, authenticated;
