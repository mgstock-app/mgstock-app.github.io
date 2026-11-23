-- Registro de gerentes con el código privado del local (pedido de la administradora, 23/11).
-- Cada local tiene un código privado de 8 letras y números. El gerente se registra (email o Google), elige
-- «Soy gerente de un local» y escribe el código: así GESTLOK sabe la empresa y el local. No recibe acceso hasta que
-- el dueño (o la administradora) lo acepte desde el panel de GESTLOK Chat → Ajustes → «Gerentes de este local».
-- Además: «Otro rubro» en el alta de comercios guarda el rubro escrito a mano.

create table if not exists gestlok_platform.codigos_local (
  tenant_id uuid not null references gestlok_tenancy.tenants(id) on delete cascade,
  local_id text not null,
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{8}$'),
  creado_at timestamptz not null default now(),
  primary key (tenant_id, local_id)
);
alter table gestlok_platform.codigos_local enable row level security;

create or replace function gestlok_platform.codigo_local_nuevo()
returns text language plpgsql volatile set search_path to '' as $function$
declare v text; abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    select string_agg(substr(abc, 1 + (get_byte(b, i) % 32), 1), '') into v
      from (select extensions.gen_random_bytes(8) b) x, generate_series(0, 7) i;
    exit when not exists (select 1 from gestlok_platform.codigos_local where codigo = v);
  end loop;
  return v;
end $function$;

-- «Otro rubro»: exige escribirlo (2 a 40 letras).
create or replace function gestlok_platform.negocio_chat_limpio(p jsonb)
returns jsonb language plpgsql immutable set search_path to '' as $function$
declare v_nombre text; v_rubro text; v_otro text; v_localidad text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Faltan los datos del comercio' using errcode = '22023'; end if;
  v_nombre := btrim(regexp_replace(coalesce(p->>'nombre', ''), '\s+', ' ', 'g'));
  v_rubro := coalesce(p->>'rubro', '');
  v_otro := btrim(regexp_replace(coalesce(p->>'rubro_otro', ''), '\s+', ' ', 'g'));
  v_localidad := btrim(regexp_replace(coalesce(p->>'localidad', ''), '\s+', ' ', 'g'));
  if length(v_nombre) not between 2 and 80 then raise exception 'Escribí el nombre del comercio (2 a 80 letras)' using errcode = '22023'; end if;
  if v_rubro not in ('gastronomia', 'cafeteria', 'almacen', 'perfumeria', 'ferreteria', 'mascotas', 'otro') then
    raise exception 'Elegí el rubro del comercio' using errcode = '22023';
  end if;
  if v_rubro = 'otro' and length(v_otro) not between 2 and 40 then raise exception 'Escribí cuál es tu rubro' using errcode = '22023'; end if;
  if length(v_localidad) > 60 then raise exception 'La localidad es demasiado larga' using errcode = '22023'; end if;
  return jsonb_strip_nulls(jsonb_build_object('nombre', v_nombre, 'rubro', v_rubro,
    'rubro_otro', case when v_rubro = 'otro' then v_otro end, 'localidad', nullif(v_localidad, '')));
end $function$;

-- El gerente pide entrar con el código del local (sin acceso hasta que lo acepten).
create or replace function public.gestlok_request_gerente_registration(p_codigo text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_email text := gestlok_platform.registration_email(); v_codigo text; c gestlok_platform.codigos_local;
  v_empresa text; v_local text; v_meta jsonb; v_provider text; v_intentos integer;
begin
  if public.mi_rol() is not null then
    raise exception 'La cuenta ya fue autorizada. Solicitá cambios a la administradora.' using errcode = '42501';
  end if;
  -- Freno a intentos al azar: hasta 10 códigos equivocados por hora y por cuenta.
  select count(*) into v_intentos from gestlok_platform.admin_audit a
   where a.actor = auth.uid() and a.action = 'gerente_codigo_invalido' and a.at > now() - interval '1 hour';
  if v_intentos >= 10 then raise exception 'Demasiados intentos. Esperá un rato y pedile el código al dueño.' using errcode = '42501'; end if;
  v_codigo := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into c from gestlok_platform.codigos_local where codigo = v_codigo;
  if c.codigo is null then
    -- Se responde sin error para que el intento quede registrado (un error desharía el registro del freno).
    insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail) values (auth.uid(), 'gerente_codigo_invalido', null, '{}'::jsonb);
    return jsonb_build_object('error', 'Ese código no corresponde a ningún local. Revisalo con el dueño.');
  end if;
  select coalesce(e.nombre_publico, co.name) into v_empresa
    from gestlok_tenancy.tenants t
    left join gestlok_chat_private.empresas e on e.tenant_id = t.id
    left join gestlok_platform.companies co on co.tenant_id = t.id
   where t.id = c.tenant_id;
  select coalesce(nullif(d.data->>'nombre', ''), d.id) into v_local from public.docs d
   where d.tenant_id = c.tenant_id and d.col = 'locales' and d.id = c.local_id;
  select u.raw_user_meta_data, coalesce(u.raw_app_meta_data->>'provider', 'email') into v_meta, v_provider
    from auth.users u where u.id = auth.uid();
  insert into gestlok_platform.registration_requests(user_id, email, name, provider, kind, modules, negocio)
  values (auth.uid(), v_email, left(coalesce(v_meta->>'full_name', v_meta->>'name', ''), 100), left(v_provider, 40), 'colaborador', '{}',
          jsonb_build_object('tipo', 'gerente', 'tenant_id', c.tenant_id, 'local_id', c.local_id, 'empresa', v_empresa, 'local', v_local))
  on conflict (user_id) do update set email = excluded.email, name = excluded.name, kind = excluded.kind, modules = excluded.modules,
    negocio = excluded.negocio, status = 'pending', updated_at = now(), reviewed_by = null, reviewed_at = null
  where registration_requests.status <> 'assigned';
  return jsonb_build_object('status', 'pending', 'empresa', v_empresa, 'local', v_local);
end $function$;

-- Dueño o administradora, desde el panel del local: ver o cambiar el código y aceptar o rechazar gerentes.
create or replace function public.gestlok_chat_panel_gerentes(p_sucursal uuid, p_renovar boolean default false)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s gestlok_chat_private.sucursales; v_codigo text;
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'configurar');
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  if p_renovar then delete from gestlok_platform.codigos_local where tenant_id = s.tenant_id and local_id = s.local_id; end if;
  insert into gestlok_platform.codigos_local (tenant_id, local_id, codigo) values (s.tenant_id, s.local_id, gestlok_platform.codigo_local_nuevo())
  on conflict (tenant_id, local_id) do nothing;
  select codigo into v_codigo from gestlok_platform.codigos_local where tenant_id = s.tenant_id and local_id = s.local_id;
  return jsonb_build_object('codigo', v_codigo,
    'pendientes', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'email', r.email, 'nombre', r.name,
        'fecha', (extract(epoch from r.created_at) * 1000)::bigint) order by r.created_at)
      from gestlok_platform.registration_requests r
      where r.status = 'pending' and r.kind = 'colaborador' and r.negocio->>'tipo' = 'gerente'
        and r.negocio->>'tenant_id' = s.tenant_id::text and r.negocio->>'local_id' = s.local_id), '[]'::jsonb));
end $function$;

create or replace function public.gestlok_chat_panel_gerente_resolver(p_sucursal uuid, p_user uuid, p_aceptar boolean)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s gestlok_chat_private.sucursales; r gestlok_platform.registration_requests;
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'configurar');
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  select * into r from gestlok_platform.registration_requests where user_id = p_user for update;
  if r.user_id is null or r.status <> 'pending' or r.negocio->>'tipo' is distinct from 'gerente'
     or r.negocio->>'tenant_id' <> s.tenant_id::text or r.negocio->>'local_id' <> s.local_id then
    raise exception 'Solicitud no disponible' using errcode = '22023';
  end if;
  if p_aceptar then
    if exists (select 1 from public.docs d where d.col = 'equipo' and lower(d.data->>'email') = r.email) then
      raise exception 'Ese email ya pertenece al equipo de una empresa' using errcode = '22023';
    end if;
    insert into public.docs (col, id, data, tenant_id, updated_by)
    values ('equipo', r.email, jsonb_build_object('email', r.email, 'rol', 'gerente', 'locales', jsonb_build_array(s.local_id),
      'nombre', nullif(r.name, ''), 'agregado', (extract(epoch from now()) * 1000)::bigint), s.tenant_id, 'gestlok-gerente-codigo');
  end if;
  update gestlok_platform.registration_requests set status = case when p_aceptar then 'assigned' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where user_id = p_user;
  insert into gestlok_chat_private.auditoria(tenant_id, sucursal_id, actor, accion, detalle)
  values (s.tenant_id, s.id, auth.uid(), case when p_aceptar then 'gerente_aceptado' else 'gerente_rechazado' end, jsonb_build_object('email', r.email));
  return jsonb_build_object('ok', true, 'aceptado', p_aceptar);
end $function$;

revoke all on function public.gestlok_request_gerente_registration(text) from public, anon;
revoke all on function public.gestlok_chat_panel_gerentes(uuid, boolean) from public, anon;
revoke all on function public.gestlok_chat_panel_gerente_resolver(uuid, uuid, boolean) from public, anon;
grant execute on function public.gestlok_request_gerente_registration(text) to authenticated;
grant execute on function public.gestlok_chat_panel_gerentes(uuid, boolean) to authenticated;
grant execute on function public.gestlok_chat_panel_gerente_resolver(uuid, uuid, boolean) to authenticated;
revoke all on function gestlok_platform.codigo_local_nuevo() from public, anon, authenticated;
