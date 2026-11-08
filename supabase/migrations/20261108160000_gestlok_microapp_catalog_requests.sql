-- Intereses comerciales durante el alta, sin habilitar roles, locales ni módulos.
-- Depende de la migración de datos comerciales 20261108150000.
alter table gestlok_platform.registration_requests
 add column if not exists microapps text[] not null default '{}'::text[],
 add column if not exists customization_notes text;

-- Nuevo endpoint; mantiene el antiguo para clientes en caché durante la transición.
create or replace function public.gestlok_request_business_registration_v2(
 p_modules text[], p_business_name text, p_responsible_name text,
 p_contact_phone text, p_business_address text,
 p_microapps text[], p_customization text default ''
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_email text:=gestlok_platform.registration_email();
 v_notes text:=btrim(coalesce(p_customization,''));
 v_modules text[];
 v_result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Iniciá sesión para enviar tu solicitud' using errcode='42501';
 end if;
 if p_microapps is null or cardinality(p_microapps) not between 1 and 7
   or exists (select 1 from unnest(p_microapps) m
              where m is null or m not in
              ('scanner','stock','precios','pagos','vencimientos','empleados','pedidos'))
   or (select count(distinct m) from unnest(p_microapps) m)<>cardinality(p_microapps)
   or length(v_notes)>600 then
     raise exception 'Elegí microapps válidas y una nota de hasta 600 caracteres'
       using errcode='22023';
 end if;
 -- Los módulos generales son únicamente una consecuencia de la selección,
 -- nunca un permiso concedido ni una licencia creada.
 select coalesce(array_agg(m order by m),'{}'::text[]) into v_modules
 from (
   select distinct case when x='empleados' then 'recibos_personal' else 'comercial' end m
   from unnest(p_microapps) x
 ) requested;
 if p_modules is null
   or (select array_agg(m order by m) from unnest(p_modules) m) is distinct from v_modules then
   raise exception 'Las áreas deben coincidir con las microapps elegidas'
     using errcode='22023';
 end if;
 -- Reusa la validación de identidad, el bloqueo de cuentas ya autorizadas
 -- y la creación de una solicitud pendiente, sin acceso automático.
 perform public.gestlok_request_business_registration(
   v_modules,p_business_name,p_responsible_name,p_contact_phone,p_business_address
 );
 update gestlok_platform.registration_requests r
    set microapps=p_microapps,
        customization_notes=nullif(v_notes,''),
        updated_at=now()
  where r.user_id=auth.uid() and r.email=v_email
    and r.kind='dueno' and r.status='pending';
 if not found then
   raise exception 'No se encontró una solicitud pendiente para esta cuenta'
     using errcode='42501';
 end if;
 select jsonb_build_object(
   'kind',r.kind,'modules',r.modules,'status',r.status,
   'microapps',r.microapps,'customization_notes',r.customization_notes,
   'business_name',r.business_name,'responsible_name',r.responsible_name,
   'contact_phone',r.contact_phone,'business_address',r.business_address
 ) into v_result
 from gestlok_platform.registration_requests r
 where r.user_id=auth.uid() and r.email=v_email;
 return v_result;
end $$;
revoke all on function public.gestlok_request_business_registration_v2(
 text[],text,text,text,text,text[],text) from public,anon;
grant execute on function public.gestlok_request_business_registration_v2(
 text[],text,text,text,text,text[],text) to authenticated;

create or replace function public.gestlok_my_registration()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_email text:=gestlok_platform.registration_email();
 v_result jsonb;
begin
 select jsonb_build_object(
   'kind',r.kind,'modules',r.modules,'status',r.status,
   'microapps',r.microapps,'customization_notes',r.customization_notes,
   'business_name',r.business_name,'responsible_name',r.responsible_name,
   'contact_phone',r.contact_phone,'business_address',r.business_address
 ) into v_result
 from gestlok_platform.registration_requests r
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
 if auth.uid() is null
   or not exists(select 1 from gestlok_platform.admins a where a.user_id=auth.uid()) then
   raise exception 'Acceso exclusivo de la creadora' using errcode='42501';
 end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
    'id','registration-'||r.user_id::text,
    'registrationUserId',r.user_id,'email',r.email,
    'nombre',r.name,'proveedor',r.provider,
    'tipoCuenta',r.kind,'modulosSolicitados',r.modules,
    'empresa',r.business_name,'responsable',r.responsible_name,
    'telefono',r.contact_phone,'direccion',r.business_address,
    'microapps',r.microapps,'personalizacion',r.customization_notes,
    'fecha',(extract(epoch from r.created_at)*1000)::bigint
  ) order by r.created_at desc)
  from gestlok_platform.registration_requests r where r.status='pending'
 ),'[]'::jsonb);
end $$;
revoke all on function public.gestlok_creator_registration_requests() from public,anon;
grant execute on function public.gestlok_creator_registration_requests() to authenticated;
