-- Additive, request-only RPCs. Never grants a role, tenant or module.
-- Existing accounts, data, policies and ReciboNet remain unchanged.
create table gestlok_platform.registration_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 name text not null default '',
 provider text not null default 'email',
 kind text not null check(kind in ('dueno','colaborador')),
 modules text[] not null,
 status text not null default 'pending' check(status in ('pending','assigned','rejected')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 check((kind='colaborador' and cardinality(modules)=0) or
   (kind='dueno' and modules in (array['comercial'],array['recibos_personal'],array['comercial','recibos_personal'])))
);
alter table gestlok_platform.registration_requests enable row level security;
revoke all on gestlok_platform.registration_requests from public,anon,authenticated;
create function gestlok_platform.registration_email()
returns text language plpgsql stable set search_path=''
as $$
declare v_email text;
begin
 select lower(u.email) into v_email from auth.users u
 where u.id=auth.uid() and u.email_confirmed_at is not null;
 if v_email is null or v_email<>lower(coalesce(auth.jwt()->>'email','')) then
  raise exception 'Cuenta verificada requerida' using errcode='42501';
 end if;
 return v_email;
end $$;
revoke all on function gestlok_platform.registration_email() from public,anon,authenticated;

-- Definer is necessary to read only the caller's pending request without
-- allowing direct writes or weakening the existing docs RLS/tenant fence.
create function public.gestlok_my_registration()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_email text:=gestlok_platform.registration_email(); v_result jsonb;
begin
 select jsonb_build_object('kind',r.kind,'modules',r.modules,'status',r.status)
 into v_result from gestlok_platform.registration_requests r where r.user_id=auth.uid() and r.email=v_email;
 return v_result;
end $$;
revoke all on function public.gestlok_my_registration() from public,anon;
grant execute on function public.gestlok_my_registration() to authenticated;

create function public.gestlok_request_registration(p_kind text,p_modules text[])
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_email text:=gestlok_platform.registration_email();
 v_modules text[];
 v_meta jsonb; v_provider text;
begin
 if p_kind is null or p_kind not in ('dueno','colaborador') or p_modules is null then
  raise exception 'Selección de cuenta inválida' using errcode='22023';
 end if;
 if cardinality(p_modules)>2 or exists(select 1 from unnest(p_modules) m where m is null or m not in ('comercial','recibos_personal')) then
  raise exception 'Selección de módulos inválida' using errcode='22023';
 end if;
 select coalesce(array_agg(m order by m),'{}'::text[]) into v_modules from (select distinct unnest(p_modules) m) q;
 if cardinality(v_modules)<>cardinality(p_modules) or
    (p_kind='dueno' and cardinality(v_modules)=0) or
    (p_kind='colaborador' and cardinality(v_modules)<>0) then
  raise exception 'Selección de módulos inválida' using errcode='22023';
 end if;
 if public.mi_rol() is not null then
  raise exception 'La cuenta ya fue autorizada. Solicitá cambios a la administradora.' using errcode='42501';
 end if;
 select u.raw_user_meta_data,coalesce(u.raw_app_meta_data->>'provider','email')
 into v_meta,v_provider from auth.users u where u.id=auth.uid();
 insert into gestlok_platform.registration_requests(user_id,email,name,provider,kind,modules)
 values(auth.uid(),v_email,left(coalesce(v_meta->>'full_name',v_meta->>'name',''),100),left(v_provider,40),p_kind,v_modules)
 on conflict(user_id) do update set email=excluded.email,name=excluded.name,
  kind=excluded.kind,modules=excluded.modules,status='pending',updated_at=now(),reviewed_by=null,reviewed_at=null
 where registration_requests.kind is distinct from excluded.kind
    or registration_requests.modules is distinct from excluded.modules
    or registration_requests.email is distinct from excluded.email
    or registration_requests.status='rejected';
 return jsonb_build_object('kind',p_kind,'modules',to_jsonb(v_modules),'status','pending');
end $$;
revoke all on function public.gestlok_request_registration(text,text[]) from public,anon;
grant execute on function public.gestlok_request_registration(text,text[]) to authenticated;

create function public.gestlok_creator_registration_requests()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
 perform gestlok_platform.registration_email();
 if auth.uid() is null or not exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid()) then
  raise exception 'Acceso exclusivo de la creadora' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id','registration-'||r.user_id::text,'registrationUserId',r.user_id,
  'email',r.email,'nombre',r.name,'proveedor',r.provider,
  'tipoCuenta',r.kind,'modulosSolicitados',r.modules,
  'fecha',(extract(epoch from r.created_at)*1000)::bigint) order by r.created_at desc)
  from gestlok_platform.registration_requests r where r.status='pending'),'[]'::jsonb);
end $$;
revoke all on function public.gestlok_creator_registration_requests() from public,anon;
grant execute on function public.gestlok_creator_registration_requests() to authenticated;

create function public.gestlok_review_registration(p_user uuid,p_status text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 perform gestlok_platform.registration_email();
 if auth.uid() is null or not exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid()) then
  raise exception 'Acceso exclusivo de la creadora' using errcode='42501';
 end if;
 if p_status is null or p_status not in ('assigned','rejected') then
  raise exception 'Estado de revisión inválido' using errcode='22023';
 end if;
 if p_status='assigned' and not exists(
  select 1 from gestlok_platform.registration_requests r join public.docs d
   on d.col='equipo' and lower(d.data->>'email')=r.email
  where r.user_id=p_user and d.data->>'rol' in ('dueno','gerente','lectura','editor')
 ) then
  raise exception 'Primero se debe asignar el acceso por el procedimiento autorizado' using errcode='42501';
 end if;
 update gestlok_platform.registration_requests set status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 where user_id=p_user and status='pending';
 if not found then raise exception 'Solicitud no disponible' using errcode='22023';end if;
end $$;
revoke all on function public.gestlok_review_registration(uuid,text) from public,anon;
grant execute on function public.gestlok_review_registration(uuid,text) to authenticated;
