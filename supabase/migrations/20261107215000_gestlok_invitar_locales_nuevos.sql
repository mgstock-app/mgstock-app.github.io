-- Invitaciones permanentes para TODO local creado desde esta migración.
-- Enlace por WhatsApp -> Google -> legajo -> pendiente -> aprobación por dueño.
-- Los locales anteriores se mantienen intactos; se habilitan Acassuso/San Isidro.
-- Nunca se concede rol ni acceso al abrir un enlace o cargar un legajo.

create table if not exists gestlok_platform.invite_enabled_locals (
 tenant_id uuid not null,
 local_id text not null,
 enabled_at timestamptz not null default now(),
 primary key(tenant_id,local_id)
);
create table if not exists gestlok_platform.local_invite_links (
 tenant_id uuid not null,
 local_id text not null,
 token text not null unique check(length(token)>=48),
 active boolean not null default true,
 created_by uuid,
 created_at timestamptz not null default now(),
 rotated_at timestamptz,
 primary key(tenant_id,local_id),
 foreign key(tenant_id,local_id)
  references gestlok_platform.invite_enabled_locals(tenant_id,local_id)
);
create table if not exists gestlok_platform.local_join_requests (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 local_id text not null,
 user_id uuid not null,
 email text not null,
 first_name text not null check(length(btrim(first_name)) between 2 and 80),
 last_name text not null check(length(btrim(last_name)) between 2 and 80),
 phone text not null check(length(btrim(phone)) between 7 and 25),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid,
 assigned_role text check(assigned_role is null or assigned_role in ('dueno','gerente')),
 assigned_locals jsonb,
 unique(tenant_id,local_id,user_id),
 foreign key(tenant_id,local_id)
  references gestlok_platform.invite_enabled_locals(tenant_id,local_id)
);
create index if not exists gestlok_join_pending_by_tenant
 on gestlok_platform.local_join_requests(tenant_id,status,requested_at desc);
create index if not exists gestlok_join_by_user
 on gestlok_platform.local_join_requests(user_id,requested_at desc);

-- Privacidad: no se pueden consultar los teléfonos/legajos mediante Data API.
revoke all on gestlok_platform.invite_enabled_locals,
 gestlok_platform.local_invite_links,gestlok_platform.local_join_requests
 from public,anon,authenticated;
alter table gestlok_platform.invite_enabled_locals enable row level security;
alter table gestlok_platform.local_invite_links enable row level security;
alter table gestlok_platform.local_join_requests enable row level security;

-- Se habilitan SOLO los locales nuevos, no el flujo histórico de Mi Gusto.
insert into gestlok_platform.invite_enabled_locals(tenant_id,local_id)
select l.tenant_id,l.id from public.docs l where l.col='locales'
 and l.tenant_id='6c8717ea-5f78-426b-9458-74a5dcac6e4e'
on conflict do nothing;

-- Por defecto todo local FUTURO obtiene el botón. No altera locales previos.
create or replace function gestlok_platform.enable_invites_on_new_local()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.col='locales' then
  insert into gestlok_platform.invite_enabled_locals(tenant_id,local_id)
  values(new.tenant_id,new.id) on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function gestlok_platform.enable_invites_on_new_local() from public,anon,authenticated;
drop trigger if exists gestlok_enable_invites_new_local on public.docs;
create trigger gestlok_enable_invites_new_local
 after insert on public.docs for each row
 when (new.col='locales')
 execute function gestlok_platform.enable_invites_on_new_local();

-- Rol de la sesión activo, no metadata proporcionada por el cliente.
create or replace function gestlok_platform.invite_permission(p_tenant uuid,p_local text)
returns text language plpgsql stable security definer set search_path=''
as $$
declare v_email text;
begin
 v_email:=gestlok_tenancy.verified_role_context_email();
 if v_email is null or p_tenant is null or p_local is null then return 'none'; end if;
 if not exists(select 1 from gestlok_platform.invite_enabled_locals x
   join public.docs l on l.tenant_id=x.tenant_id and l.id=x.local_id and l.col='locales'
   where x.tenant_id=p_tenant and x.local_id=p_local) then return 'none'; end if;
 if gestlok_platform.creator_write_active() then return 'admin'; end if;
 if gestlok_tenancy.current_tenant_id() is distinct from p_tenant then return 'none';end if;
 return coalesce((
   select case when e.data->>'rol'='dueno' then 'dueno'
      when e.data->>'rol'='gerente' and coalesce(e.data->'locales','[]'::jsonb) ? p_local
        then 'gerente' else null end
   from public.docs e
   where e.tenant_id=p_tenant and e.col='equipo'
     and lower(e.data->>'email')=v_email limit 1),'none');
end;
$$;
revoke all on function gestlok_platform.invite_permission(uuid,text) from public,anon,authenticated;

create or replace function gestlok_platform.invite_can_review(p_tenant uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_email text:=gestlok_tenancy.verified_role_context_email();
begin
 if v_email is null then return false; end if;
 if gestlok_platform.creator_write_active() then return true; end if;
 if gestlok_tenancy.current_tenant_id() is distinct from p_tenant then return false;end if;
 return exists(select 1 from public.docs d
    where d.tenant_id=p_tenant and d.col='equipo'
      and d.data->>'rol'='dueno' and lower(d.data->>'email')=v_email);
end;
$$;
revoke all on function gestlok_platform.invite_can_review(uuid) from public,anon,authenticated;

create or replace function public.gestlok_newlocal_invite_scope(p_tenant uuid,p_local text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_permission text:=gestlok_platform.invite_permission(p_tenant,p_local);
begin
 return jsonb_build_object('enabled',v_permission<>'none',
       'can_review',v_permission in ('admin','dueno'));
end;
$$;

-- Token no caduca. El dueño/creadora lo puede regenerar para revocar el anterior.
-- El gerente sólo comparte el enlace estable de su propio local.
create or replace function public.gestlok_newlocal_invite_link(
 p_tenant uuid,p_local text,p_rotate boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_permission text:=gestlok_platform.invite_permission(p_tenant,p_local);
        v_token text; v_company text; v_local_name text;
begin
 if v_permission='none' then
   raise exception 'Sin permisos para invitar desde este local' using errcode='42501';
 end if;
 if p_rotate and v_permission not in ('admin','dueno') then
   raise exception 'Solo el dueño puede regenerar el enlace' using errcode='42501';
 end if;
 select coalesce(l.data->>'nombre',l.id) into v_local_name
 from public.docs l where l.col='locales' and l.tenant_id=p_tenant and l.id=p_local;
 select name into v_company from gestlok_platform.companies c where c.tenant_id=p_tenant limit 1;
 if v_local_name is null or v_company is null then
   raise exception 'La sucursal no está disponible' using errcode='22023';
 end if;
 insert into gestlok_platform.local_invite_links(tenant_id,local_id,token,created_by)
 values(p_tenant,p_local,(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),auth.uid())
 on conflict(tenant_id,local_id) do nothing;
 if p_rotate then
   update gestlok_platform.local_invite_links set token=(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
     rotated_at=now(),created_by=auth.uid(),active=true
    where tenant_id=p_tenant and local_id=p_local;
 end if;
 select token into strict v_token from gestlok_platform.local_invite_links
 where tenant_id=p_tenant and local_id=p_local and active;
 return jsonb_build_object('token',v_token,'local',v_local_name,
    'empresa',v_company,'can_review',v_permission in ('dueno','admin'));
end;
$$;

-- No devuelve datos del negocio: únicamente los nombres incluidos en el enlace.
create or replace function public.gestlok_newlocal_invite_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_company text;v_local text;
begin
 perform gestlok_platform.registration_email();
 if length(coalesce(p_token,''))<>64 then
   raise exception 'Invitación inválida' using errcode='22023';end if;
 select c.name,coalesce(d.data->>'nombre',d.id)
 into v_company,v_local
 from gestlok_platform.local_invite_links x
 join public.docs d on d.tenant_id=x.tenant_id and d.id=x.local_id and d.col='locales'
 join gestlok_platform.companies c on c.tenant_id=x.tenant_id
 where x.token=p_token and x.active;
 if v_company is null then raise exception 'Este enlace dejó de estar disponible' using errcode='22023';end if;
 return jsonb_build_object('empresa',v_company,'local',v_local);
end;
$$;

-- El invitado DEBE iniciar sesión con Google, cargar su propio legajo y
-- permanecer pendiente. El token no concede acceso a la sucursal.
create or replace function public.gestlok_newlocal_join(
 p_token text,p_first text,p_last text,p_phone text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_email text:=gestlok_platform.registration_email();
        v_tenant uuid;v_local text;v_id uuid; v_first text:=btrim(coalesce(p_first,''));
        v_last text:=btrim(coalesce(p_last,''));v_phone text:=btrim(coalesce(p_phone,''));
begin
 if auth.uid() is null or not exists(select 1 from auth.identities i
   where i.user_id=auth.uid() and i.provider='google') then
     raise exception 'Ingresá con Google para completar la invitación' using errcode='42501';
 end if;
 if length(v_first) not between 2 and 80 or length(v_last) not between 2 and 80
    or v_first ~ '[<>]' or v_last ~ '[<>]'
    or v_phone !~ '^\+?[0-9][0-9 ()-]{6,24}$'
 then raise exception 'Completá nombre, apellido y teléfono válidos' using errcode='22023';end if;
 select x.tenant_id,x.local_id into v_tenant,v_local
 from gestlok_platform.local_invite_links x
 join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
 where x.active and x.token=p_token and length(p_token)=64;
 if v_tenant is null then raise exception 'El enlace no es válido' using errcode='22023';end if;
 if exists(select 1 from public.docs d
    where d.tenant_id=v_tenant and d.col='equipo'
    and lower(d.data->>'email')=v_email) then
   raise exception 'Ya pertenecés a esta empresa. Consultá al dueño por tu acceso.' using errcode='22023';
 end if;
 insert into gestlok_platform.local_join_requests
     (tenant_id,local_id,user_id,email,first_name,last_name,phone,status)
 values (v_tenant,v_local,auth.uid(),v_email,v_first,v_last,v_phone,'pending')
 on conflict(tenant_id,local_id,user_id) do update
  set first_name=excluded.first_name,last_name=excluded.last_name,
      phone=excluded.phone,email=excluded.email,
      status='pending',requested_at=now(),reviewed_at=null,reviewed_by=null,
      assigned_role=null,assigned_locals=null
 where local_join_requests.status='rejected'
 returning id into v_id;
 if v_id is null then
  select id into v_id from gestlok_platform.local_join_requests
    where tenant_id=v_tenant and local_id=v_local and user_id=auth.uid();
 end if;
 return jsonb_build_object('status','pending','request_id',v_id);
end;
$$;

create or replace function public.gestlok_newlocal_my_requests()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 perform gestlok_platform.registration_email();
 return coalesce((select jsonb_agg(jsonb_build_object(
     'status',r.status,'empresa',c.name,
     'local',coalesce(l.data->>'nombre',r.local_id),'requested_at',r.requested_at)
   order by r.requested_at desc)
   from gestlok_platform.local_join_requests r
   join gestlok_platform.companies c on c.tenant_id=r.tenant_id
   join public.docs l on l.tenant_id=r.tenant_id and l.col='locales' and l.id=r.local_id
   where r.user_id=auth.uid()),'[]'::jsonb);
end;
$$;

-- El legajo COMPLETO sólo lo leen Dueño y Administradora; nunca Gerente.
create or replace function public.gestlok_newlocal_requests(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 if not gestlok_platform.invite_can_review(p_tenant) then
  raise exception 'Solo el dueño puede consultar los legajos' using errcode='42501';end if;
 return jsonb_build_object(
   'locals',coalesce((select jsonb_agg(jsonb_build_object(
         'id',l.id,'name',coalesce(l.data->>'nombre',l.id)) order by l.id)
      from public.docs l where l.tenant_id=p_tenant and l.col='locales'),'[]'::jsonb),
   'requests',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'local_id',r.local_id,'user_id',r.user_id,'email',r.email,
      'first_name',r.first_name,'last_name',r.last_name,'phone',r.phone,
      'status',r.status,'requested_at',r.requested_at,
      'reviewed_at',r.reviewed_at,'assigned_role',r.assigned_role,
      'assigned_locals',r.assigned_locals)
       order by case r.status when 'pending' then 0 when 'approved' then 1 else 2 end,r.requested_at desc)
      from gestlok_platform.local_join_requests r where r.tenant_id=p_tenant),'[]'::jsonb)
 );
end;
$$;

-- Aprobación EXPLÍCITA del dueño o creadora.
-- Únicos roles del nuevo sistema: dueño / gerente. Locales validados en servidor.
create or replace function public.gestlok_newlocal_review(
 p_request uuid,p_decision text,p_role text default null,p_local_ids text[] default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_row gestlok_platform.local_join_requests%rowtype;
        v_current public.docs%rowtype;v_role text;
        v_ids text[];v_member_id text;v_email text;
        v_profile jsonb;v_locals jsonb;
begin
 select * into v_row from gestlok_platform.local_join_requests
 where id=p_request for update;
 if not found then raise exception 'Solicitud inexistente' using errcode='22023';end if;
 if not gestlok_platform.invite_can_review(v_row.tenant_id) then
  raise exception 'Solo el dueño puede revisar solicitudes' using errcode='42501';end if;
 if v_row.status<>'pending' then raise exception 'La solicitud ya fue revisada' using errcode='22023';end if;
 if p_decision not in ('approved','rejected') then
  raise exception 'Decisión inválida' using errcode='22023';end if;
 if p_decision='rejected' then
   update gestlok_platform.local_join_requests set status='rejected',
     reviewed_by=auth.uid(),reviewed_at=now()
   where id=v_row.id;
   return jsonb_build_object('status','rejected');
 end if;
 if p_role not in ('dueno','gerente') then
   raise exception 'Asigná el rol Dueño o Gerente' using errcode='22023';end if;
 select lower(u.email) into v_email from auth.users u
 where u.id=v_row.user_id and u.email_confirmed_at is not null;
 if v_email is distinct from v_row.email then
  raise exception 'El correo de Google dejó de coincidir' using errcode='42501';end if;
 if not exists(select 1 from auth.identities i where i.user_id=v_row.user_id and i.provider='google') then
  raise exception 'Cuenta Google requerida' using errcode='42501';end if;
 if p_role='gerente' then
  select coalesce(array_agg(distinct l_id order by l_id),'{}'::text[])
  into v_ids from unnest(coalesce(p_local_ids,'{}'::text[])) x(l_id);
  if cardinality(v_ids)=0 or not (v_row.local_id=any(v_ids))
    or exists(select 1 from unnest(v_ids) z(id)
       where not exists(select 1 from public.docs l
          where l.col='locales' and l.tenant_id=v_row.tenant_id and l.id=z.id))
  then raise exception 'Elegí los locales autorizados para este gerente' using errcode='22023';end if;
  v_locals:=to_jsonb(v_ids);
 else
  select coalesce(jsonb_agg(l.id order by l.id),'[]'::jsonb)
  into v_locals from public.docs l where l.col='locales' and l.tenant_id=v_row.tenant_id;
 end if;

 -- Nunca reemplazar silenciosamente el rol de una cuenta existente.
 if exists(select 1 from public.docs d where d.tenant_id=v_row.tenant_id
   and d.col='equipo' and lower(d.data->>'email')=v_email)
 then raise exception 'Este usuario ya tiene un rol. Revisá su perfil antes de modificarlo.' using errcode='22023';end if;

 -- El perfil personal queda SOLO en la tabla privada de solicitudes/legajos.
 -- La membresía operativa no publica teléfono, nombre ni quién revisó.
 v_profile:=jsonb_build_object('email',v_email,'rol',p_role,
  'locales',v_locals,'agregado',(extract(epoch from now())*1000)::bigint);
 v_member_id:='invite-'||replace(v_row.tenant_id::text,'-','')||'-'||replace(v_row.user_id::text,'-','');
 insert into public.docs(tenant_id,col,id,data,updated_by)
 values(v_row.tenant_id,'equipo',v_member_id,v_profile,
   gestlok_platform.registration_email());

 update gestlok_platform.local_join_requests
  set status='approved',assigned_role=p_role,assigned_locals=v_locals,
      reviewed_by=auth.uid(),reviewed_at=now()
 where id=v_row.id;
 return jsonb_build_object('status','approved','role',p_role,'locals',v_locals);
end;
$$;

-- Sólo APIs autenticadas y con parámetros validados. Ninguna de estas
-- funciones permite que un enlace o un gerente asignen permisos.
do $$
declare sig text;
begin
 foreach sig in array array[
  'gestlok_newlocal_invite_scope(uuid,text)',
  'gestlok_newlocal_invite_link(uuid,text,boolean)',
  'gestlok_newlocal_invite_preview(text)',
  'gestlok_newlocal_join(text,text,text,text)',
  'gestlok_newlocal_my_requests()',
  'gestlok_newlocal_requests(uuid)',
  'gestlok_newlocal_review(uuid,text,text,text[])'
 ] loop
   execute 'revoke all on function public.'||sig||' from public,anon';
   execute 'grant execute on function public.'||sig||' to authenticated';
 end loop;
end;
$$;
