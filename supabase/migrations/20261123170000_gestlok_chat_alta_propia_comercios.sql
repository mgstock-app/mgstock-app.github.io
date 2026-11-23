-- GESTLOK Chat · alta propia de comercios con aprobación de la administradora.
-- 1) El dueño crea su cuenta en gestlok.com.ar → «Registrarme», elige «GESTLOK Chat» y carga los datos del comercio.
-- 2) La solicitud queda pendiente (no da ningún acceso).
-- 3) La administradora la ve en Inicio → Herramientas → GESTLOK Chat y toca «Aprobar y crear»: se crea la empresa con
--    su primer local, el dueño queda vinculado y GESTLOK Chat queda activo con el chat del local APAGADO hasta que el
--    dueño cargue su carta y sus ajustes. Rechazar usa gestlok_review_registration como siempre.
-- No modifica empresas existentes.

alter table gestlok_platform.registration_requests add column if not exists negocio jsonb;
alter table gestlok_platform.registration_requests drop constraint if exists registration_requests_check;
alter table gestlok_platform.registration_requests add constraint registration_requests_check check (
  (kind = 'colaborador' and cardinality(modules) = 0) or
  (kind = 'dueno' and (modules = array['comercial'] or modules = array['recibos_personal']
     or modules = array['comercial', 'recibos_personal'] or modules = array['gestlok_chat'])));

create or replace function gestlok_platform.negocio_chat_limpio(p jsonb)
returns jsonb language plpgsql immutable set search_path to '' as $function$
declare v_nombre text; v_rubro text; v_localidad text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Faltan los datos del comercio' using errcode = '22023'; end if;
  v_nombre := btrim(regexp_replace(coalesce(p->>'nombre', ''), '\s+', ' ', 'g'));
  v_rubro := coalesce(p->>'rubro', '');
  v_localidad := btrim(regexp_replace(coalesce(p->>'localidad', ''), '\s+', ' ', 'g'));
  if length(v_nombre) not between 2 and 80 then raise exception 'Escribí el nombre del comercio (2 a 80 letras)' using errcode = '22023'; end if;
  if v_rubro not in ('gastronomia', 'cafeteria', 'almacen', 'perfumeria', 'ferreteria', 'mascotas', 'otro') then
    raise exception 'Elegí el rubro del comercio' using errcode = '22023';
  end if;
  if length(v_localidad) > 60 then raise exception 'La localidad es demasiado larga' using errcode = '22023'; end if;
  return jsonb_build_object('nombre', v_nombre, 'rubro', v_rubro, 'localidad', nullif(v_localidad, ''));
end $function$;

create or replace function public.gestlok_request_chat_registration(p_negocio jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_email text := gestlok_platform.registration_email(); v_negocio jsonb; v_meta jsonb; v_provider text;
begin
  v_negocio := gestlok_platform.negocio_chat_limpio(p_negocio);
  if public.mi_rol() is not null then
    raise exception 'La cuenta ya fue autorizada. Solicitá cambios a la administradora.' using errcode = '42501';
  end if;
  select u.raw_user_meta_data, coalesce(u.raw_app_meta_data->>'provider', 'email') into v_meta, v_provider
    from auth.users u where u.id = auth.uid();
  insert into gestlok_platform.registration_requests(user_id, email, name, provider, kind, modules, negocio)
  values (auth.uid(), v_email, left(coalesce(v_meta->>'full_name', v_meta->>'name', ''), 100), left(v_provider, 40),
          'dueno', array['gestlok_chat'], v_negocio)
  on conflict (user_id) do update set email = excluded.email, name = excluded.name, kind = excluded.kind,
    modules = excluded.modules, negocio = excluded.negocio, status = 'pending', updated_at = now(),
    reviewed_by = null, reviewed_at = null
  where registration_requests.status <> 'assigned';
  return jsonb_build_object('kind', 'dueno', 'modules', jsonb_build_array('gestlok_chat'), 'negocio', v_negocio, 'status', 'pending');
end $function$;
revoke all on function public.gestlok_request_chat_registration(jsonb) from public, anon;
grant execute on function public.gestlok_request_chat_registration(jsonb) to authenticated;

create or replace function public.gestlok_my_registration()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_email text := gestlok_platform.registration_email(); v_result jsonb;
begin
  select jsonb_build_object('kind', r.kind, 'modules', r.modules, 'status', r.status, 'negocio', r.negocio)
    into v_result from gestlok_platform.registration_requests r where r.user_id = auth.uid() and r.email = v_email;
  return v_result;
end $function$;

create or replace function public.gestlok_creator_registration_requests()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  perform gestlok_platform.registration_email();
  if auth.uid() is null or not exists(select 1 from gestlok_platform.admins a where a.user_id = auth.uid()) then
    raise exception 'Acceso exclusivo de la creadora' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', 'registration-' || r.user_id::text, 'registrationUserId', r.user_id,
    'email', r.email, 'nombre', r.name, 'proveedor', r.provider,
    'tipoCuenta', r.kind, 'modulosSolicitados', r.modules, 'negocio', r.negocio,
    'fecha', (extract(epoch from r.created_at) * 1000)::bigint) order by r.created_at desc)
    from gestlok_platform.registration_requests r where r.status = 'pending'), '[]'::jsonb);
end $function$;

create or replace function public.gestlok_creator_aprobar_chat(p_user uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_admin uuid; r gestlok_platform.registration_requests; v_info jsonb; v_tenant uuid; v_local text;
  v_sucursal text; v_slug text;
begin
  v_admin := gestlok_platform.exigir_creadora_microapps();
  select * into r from gestlok_platform.registration_requests where user_id = p_user for update;
  if r.user_id is null or r.status <> 'pending' or r.modules is distinct from array['gestlok_chat'] then
    raise exception 'Solicitud no disponible' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = r.user_id and u.email_confirmed_at is not null and lower(u.email) = r.email) then
    raise exception 'La cuenta del dueño no está verificada' using errcode = '42501';
  end if;
  r.negocio := gestlok_platform.negocio_chat_limpio(r.negocio);
  v_sucursal := coalesce(r.negocio->>'localidad', 'Local principal');
  -- Empresa nueva con su primer local y el dueño vinculado (mismo procedimiento que «+ Agregar empresa»).
  v_info := public.gestlok_creator_crear_empresa_microapps(r.negocio->>'nombre', r.email, null);
  v_tenant := (v_info->>'tenant_id')::uuid; v_local := v_info->>'local_id';
  if v_tenant is null or v_local is null then raise exception 'No se pudo crear la empresa' using errcode = 'P0001'; end if;
  update public.docs set data = jsonb_set(data, '{nombre}', to_jsonb(v_sucursal), true), updated_at = now()
   where tenant_id = v_tenant and col = 'locales' and id = v_local;
  -- GESTLOK Chat con el chat del local apagado hasta que el dueño lo configure.
  perform public.gestlok_chat_admin_habilitar(v_tenant, r.negocio->>'nombre',
    jsonb_build_array(jsonb_build_object('local_id', v_local, 'nombre', v_sucursal)));
  perform public.gestlok_creator_asignar_microapp(v_tenant, 'gestlok_chat', true);
  update gestlok_chat_private.sucursales set activa = false where tenant_id = v_tenant;
  select slug into v_slug from gestlok_chat_private.sucursales where tenant_id = v_tenant and local_id = v_local;
  update gestlok_platform.registration_requests
     set status = 'assigned', negocio = r.negocio, reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
   where user_id = p_user;
  insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
  values (v_admin, 'chat_alta_aprobada', v_tenant, jsonb_build_object('rubro', r.negocio->>'rubro', 'slug', v_slug));
  return jsonb_build_object('ok', true, 'tenant_id', v_tenant, 'slug', v_slug, 'empresa', r.negocio->>'nombre');
end $function$;
revoke all on function public.gestlok_creator_aprobar_chat(uuid) from public, anon;
grant execute on function public.gestlok_creator_aprobar_chat(uuid) to authenticated;
