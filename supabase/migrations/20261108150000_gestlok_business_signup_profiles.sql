-- Datos comerciales del alta: guardados solo tras validar el correo de la cuenta.
-- Solicitudes pendientes: nunca crean tenant, roles ni acceso a datos de otra empresa.
alter table gestlok_platform.registration_requests
  add column if not exists business_name text,
  add column if not exists responsible_name text,
  add column if not exists contact_phone text,
  add column if not exists business_address text;

create or replace function public.gestlok_request_business_registration(
  p_modules text[], p_business_name text, p_responsible_name text,
  p_contact_phone text, p_business_address text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_email text := gestlok_platform.registration_email();
  v_business text := btrim(coalesce(p_business_name,''));
  v_responsible text := btrim(coalesce(p_responsible_name,''));
  v_phone text := btrim(coalesce(p_contact_phone,''));
  v_address text := btrim(coalesce(p_business_address,''));
  v_result jsonb;
begin
  if length(v_business) not between 2 and 100
    or length(v_responsible) not between 3 and 100
    or length(v_phone) not between 9 and 25
    or length(regexp_replace(v_phone,'[^0-9]','','g')) not between 10 and 15
    or v_phone !~ '^[+0-9 ()-]+$'
    or length(v_address)>160 then
      raise exception 'Revisá los datos del negocio y el teléfono' using errcode='22023';
  end if;
  -- Valida identidad, módulos, rol y solicitudes previas. No concede permisos.
  perform public.gestlok_request_registration('dueno',p_modules);
  update gestlok_platform.registration_requests r
     set business_name=v_business, responsible_name=v_responsible,
         contact_phone=v_phone, business_address=nullif(v_address,''),
         name=v_responsible, updated_at=now()
   where r.user_id=auth.uid() and r.email=v_email and r.kind='dueno' and r.status='pending';
  if not found then
    raise exception 'Solicitud pendiente no encontrada' using errcode='42501';
  end if;
  select jsonb_build_object(
    'kind',r.kind,'modules',r.modules,'status',r.status,
    'business_name',r.business_name,'responsible_name',r.responsible_name,
    'contact_phone',r.contact_phone,'business_address',r.business_address
  ) into v_result from gestlok_platform.registration_requests r
  where r.user_id=auth.uid() and r.email=v_email;
  return v_result;
end $$;
revoke all on function public.gestlok_request_business_registration(text[],text,text,text,text)
  from public,anon;
grant execute on function public.gestlok_request_business_registration(text[],text,text,text,text)
  to authenticated;

create or replace function public.gestlok_my_registration()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_email text:=gestlok_platform.registration_email(); v_result jsonb;
begin
 select jsonb_build_object('kind',r.kind,'modules',r.modules,'status',r.status,
   'business_name',r.business_name,'responsible_name',r.responsible_name,
   'contact_phone',r.contact_phone,'business_address',r.business_address)
 into v_result from gestlok_platform.registration_requests r
 where r.user_id=auth.uid() and r.email=v_email;
 return v_result;
end $$;
revoke all on function public.gestlok_my_registration() from public,anon;
grant execute on function public.gestlok_my_registration() to authenticated;

create or replace function public.gestlok_creator_registration_requests()
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
  'empresa',r.business_name,'responsable',r.responsible_name,
  'telefono',r.contact_phone,'direccion',r.business_address,
  'fecha',(extract(epoch from r.created_at)*1000)::bigint) order by r.created_at desc)
  from gestlok_platform.registration_requests r where r.status='pending'),'[]'::jsonb);
end $$;
revoke all on function public.gestlok_creator_registration_requests() from public,anon;
grant execute on function public.gestlok_creator_registration_requests() to authenticated;
