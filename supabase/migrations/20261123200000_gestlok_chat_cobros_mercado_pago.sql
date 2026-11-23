-- GESTLOK Chat · cobro automático de la cuota con Mercado Pago Suscripciones (y la adaptación por única vez).
-- Decisiones de la administradora (23/11): cuota $70.000 por mes, adaptación opcional $50.000 por única vez,
-- el cobro es el día en que se suscribió cada comercio, el primer cobro empieza al activar su chat y hay 3 días de
-- gracia: si no paga, el chat se pausa solo y vuelve solo cuando Mercado Pago aprueba el pago.
-- Solo se cobra a las empresas marcadas (las nuevas de «alta propia» y las que la administradora marque).
-- Las empresas que ya usan GESTLOK (Mi Gusto, etc.) no tienen cobro y no cambian.
-- La clave de Mercado Pago vive solo en los secretos de la función gestlok-cobros (MP_ACCESS_TOKEN).

create table if not exists gestlok_chat_private.cobro_ajustes (
  id boolean primary key default true check (id),
  cuota numeric(12,2) not null default 70000 check (cuota between 1000 and 10000000),
  adaptacion numeric(12,2) not null default 50000 check (adaptacion between 1000 and 10000000),
  gracia_dias integer not null default 3 check (gracia_dias between 0 and 60),
  actualizada_at timestamptz not null default now()
);
insert into gestlok_chat_private.cobro_ajustes (id) values (true) on conflict (id) do nothing;

create table if not exists gestlok_chat_private.suscripciones (
  tenant_id uuid primary key references gestlok_tenancy.tenants(id) on delete cascade,
  requiere_cobro boolean not null default true,
  estado text not null default 'sin_suscripcion'
    check (estado in ('sin_suscripcion', 'pendiente', 'activa', 'en_mora', 'cancelada')),
  mp_preapproval_id text unique,
  link_cuota text,
  monto numeric(12,2),
  payer_email text,
  proximo_cobro timestamptz,
  ultimo_pago_at timestamptz,
  mora_desde timestamptz,
  pausada_por_cobro boolean not null default false,
  sucursales_pausadas uuid[] not null default '{}',
  link_adaptacion text,
  adaptacion_pagada_at timestamptz,
  creada_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now()
);

create table if not exists gestlok_chat_private.cobros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references gestlok_tenancy.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('cuota', 'adaptacion')),
  mp_id text not null unique,
  estado text not null,
  monto numeric(12,2),
  pagado_at timestamptz,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);
create index if not exists cobros_tenant_idx on gestlok_chat_private.cobros (tenant_id, creado_at desc);
alter table gestlok_chat_private.cobro_ajustes enable row level security;
alter table gestlok_chat_private.suscripciones enable row level security;
alter table gestlok_chat_private.cobros enable row level security;

-- ---------- Pausa y reanudación por cobro ----------
-- Primero lee la lista de chats pausados, después libera la pausa y los vuelve a encender.
create or replace function gestlok_chat_private.cobro_reanudar(p_tenant uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_ids uuid[];
begin
  select sucursales_pausadas into v_ids from gestlok_chat_private.suscripciones
   where tenant_id = p_tenant and pausada_por_cobro for update;
  if not found then return; end if;
  update gestlok_chat_private.suscripciones set pausada_por_cobro = false, sucursales_pausadas = '{}', actualizada_at = now()
   where tenant_id = p_tenant;
  update gestlok_chat_private.sucursales set activa = true where tenant_id = p_tenant and id = any(v_ids);
  insert into gestlok_chat_private.auditoria(tenant_id, actor, accion, detalle)
  values (p_tenant, null, 'cobro_reanudado', jsonb_build_object('sucursales', coalesce(cardinality(v_ids), 0)));
end $function$;

-- Revisión periódica: pasados los días de gracia sin pago, se pausan los chats encendidos de la empresa.
create or replace function gestlok_chat_private.cobros_revisar_mora()
returns integer language plpgsql security definer set search_path to '' as $function$
declare r gestlok_chat_private.suscripciones; v_gracia integer; v_ids uuid[]; n integer := 0;
begin
  select gracia_dias into v_gracia from gestlok_chat_private.cobro_ajustes where id;
  for r in select * from gestlok_chat_private.suscripciones
            where requiere_cobro and not pausada_por_cobro and estado <> 'activa'
              and mora_desde is not null and mora_desde + make_interval(days => coalesce(v_gracia, 3)) < now()
            for update loop
    select coalesce(array_agg(s.id), '{}') into v_ids from gestlok_chat_private.sucursales s
     where s.tenant_id = r.tenant_id and s.activa;
    update gestlok_chat_private.suscripciones set pausada_por_cobro = true, sucursales_pausadas = v_ids, actualizada_at = now()
     where tenant_id = r.tenant_id;
    update gestlok_chat_private.sucursales set activa = false where id = any(v_ids);
    insert into gestlok_chat_private.auditoria(tenant_id, actor, accion, detalle)
    values (r.tenant_id, null, 'cobro_pausado', jsonb_build_object('sucursales', cardinality(v_ids), 'mora_desde', r.mora_desde));
    n := n + 1;
  end loop;
  return n;
end $function$;

-- Al encender el chat: empieza a correr el plazo para suscribirse (primer cobro al activar) y, si está pausado por
-- falta de pago, no se deja encender hasta que pague.
create or replace function gestlok_chat_private.cobro_al_activar()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare r gestlok_chat_private.suscripciones;
begin
  if new.activa and not coalesce(old.activa, false) then
    select * into r from gestlok_chat_private.suscripciones where tenant_id = new.tenant_id and requiere_cobro;
    if found then
      if r.pausada_por_cobro then
        raise exception 'El chat está pausado por falta de pago. Cuando Mercado Pago apruebe la cuota se vuelve a encender solo.'
          using errcode = '42501';
      end if;
      if r.estado <> 'activa' and r.mora_desde is null then
        update gestlok_chat_private.suscripciones set mora_desde = now(), actualizada_at = now() where tenant_id = new.tenant_id;
      end if;
    end if;
  end if;
  return new;
end $function$;
drop trigger if exists sucursales_cobro_al_activar on gestlok_chat_private.sucursales;
create trigger sucursales_cobro_al_activar before update of activa on gestlok_chat_private.sucursales
  for each row execute function gestlok_chat_private.cobro_al_activar();

-- ---------- Estado para el panel ----------
create or replace function gestlok_chat_private.cobro_json(p_tenant uuid)
returns jsonb language sql stable security definer set search_path to '' as $function$
  select jsonb_build_object('tenant_id', p_tenant,
    'requiere_cobro', coalesce(s.requiere_cobro, false), 'estado', coalesce(s.estado, 'sin_cobro'),
    'cuota', a.cuota, 'adaptacion', a.adaptacion, 'gracia_dias', a.gracia_dias,
    'link_cuota', s.link_cuota, 'link_adaptacion', s.link_adaptacion, 'adaptacion_pagada', s.adaptacion_pagada_at is not null,
    'proximo_cobro', s.proximo_cobro, 'ultimo_pago_at', s.ultimo_pago_at, 'pausada', coalesce(s.pausada_por_cobro, false),
    'vence', case when s.estado <> 'activa' and s.mora_desde is not null and not s.pausada_por_cobro
                  then s.mora_desde + make_interval(days => a.gracia_dias) end,
    'cobros', coalesce((select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'estado', c.estado, 'monto', c.monto,
        'fecha', coalesce(c.pagado_at, c.creado_at)) order by c.creado_at desc)
      from (select * from gestlok_chat_private.cobros where tenant_id = p_tenant order by creado_at desc limit 12) c), '[]'::jsonb))
  from gestlok_chat_private.cobro_ajustes a
  left join gestlok_chat_private.suscripciones s on s.tenant_id = p_tenant
  where a.id
$function$;

-- Dueño (o administradora) desde el panel del local.
create or replace function public.gestlok_chat_panel_suscripcion(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_tenant uuid;
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'configurar');
  select tenant_id into v_tenant from gestlok_chat_private.sucursales where id = p_sucursal;
  return gestlok_chat_private.cobro_json(v_tenant);
end $function$;

-- Administradora: todas las empresas con GESTLOK Chat y su cobro.
create or replace function public.gestlok_chat_admin_cobros()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  perform gestlok_platform.exigir_creadora_microapps();
  return jsonb_build_object('ajustes', (select to_jsonb(a) - 'id' from gestlok_chat_private.cobro_ajustes a where a.id),
    'empresas', coalesce((select jsonb_agg(gestlok_chat_private.cobro_json(e.tenant_id) || jsonb_build_object('nombre', e.nombre_publico)
       order by e.nombre_publico) from gestlok_chat_private.empresas e), '[]'::jsonb));
end $function$;

create or replace function public.gestlok_chat_admin_cobro_requerir(p_tenant uuid, p_requiere boolean)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_admin uuid := gestlok_platform.exigir_creadora_microapps();
begin
  if p_requiere is null or not exists (select 1 from gestlok_chat_private.empresas where tenant_id = p_tenant) then
    raise exception 'Empresa sin GESTLOK Chat' using errcode = '22023';
  end if;
  insert into gestlok_chat_private.suscripciones (tenant_id, requiere_cobro) values (p_tenant, p_requiere)
  on conflict (tenant_id) do update set requiere_cobro = excluded.requiere_cobro, actualizada_at = now();
  if not p_requiere then perform gestlok_chat_private.cobro_reanudar(p_tenant); end if;
  insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
  values (v_admin, 'chat_cobro_requerido', p_tenant, jsonb_build_object('requiere', p_requiere));
  return gestlok_chat_private.cobro_json(p_tenant);
end $function$;

create or replace function public.gestlok_chat_admin_cobro_ajustes(p_cuota numeric, p_adaptacion numeric, p_gracia integer)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_admin uuid := gestlok_platform.exigir_creadora_microapps();
begin
  update gestlok_chat_private.cobro_ajustes set cuota = coalesce(round(p_cuota, 2), cuota),
    adaptacion = coalesce(round(p_adaptacion, 2), adaptacion), gracia_dias = coalesce(p_gracia, gracia_dias), actualizada_at = now()
   where id;
  insert into gestlok_platform.admin_audit(actor, action, tenant_id, detail)
  values (v_admin, 'chat_cobro_ajustes', null, jsonb_build_object('cuota', p_cuota, 'adaptacion', p_adaptacion, 'gracia', p_gracia));
  return (select to_jsonb(a) - 'id' from gestlok_chat_private.cobro_ajustes a where a.id);
end $function$;

-- La función gestlok-cobros pregunta, con la sesión de quien toca el botón, si puede generar el link y con qué datos.
create or replace function public.gestlok_chat_cobro_preparar(p_tenant uuid, p_tipo text, p_email text default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_ok boolean := false; v_email text; v_empresa text; a gestlok_chat_private.cobro_ajustes; s gestlok_chat_private.suscripciones;
begin
  if p_tipo not in ('cuota', 'adaptacion') then raise exception 'Tipo de cobro inválido' using errcode = '22023'; end if;
  begin perform gestlok_platform.exigir_creadora_microapps(); v_ok := true; exception when others then v_ok := false; end;
  if not v_ok then
    v_ok := exists (select 1 from gestlok_chat_private.sucursales x where x.tenant_id = p_tenant
                     and gestlok_chat_private.nivel(x.id) = 'configurar');
  end if;
  if not v_ok then raise exception 'No tenés permiso para pagar GESTLOK Chat de esta empresa' using errcode = '42501'; end if;
  select nombre_publico into v_empresa from gestlok_chat_private.empresas where tenant_id = p_tenant;
  if v_empresa is null then raise exception 'La empresa no tiene GESTLOK Chat' using errcode = '22023'; end if;
  select * into s from gestlok_chat_private.suscripciones where tenant_id = p_tenant;
  if p_tipo = 'cuota' and (s.tenant_id is null or not s.requiere_cobro) then
    raise exception 'Esta empresa no tiene cobro de cuota' using errcode = '22023';
  end if;
  if p_tipo = 'cuota' and s.estado = 'activa' then raise exception 'La suscripción ya está activa' using errcode = '22023'; end if;
  select * into a from gestlok_chat_private.cobro_ajustes where id;
  v_email := lower(btrim(coalesce(nullif(p_email, ''),
    (select c.owner_email from gestlok_platform.companies c where c.tenant_id = p_tenant), '')));
  if v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)+$' or length(v_email) > 254 then
    raise exception 'Escribí el email de la cuenta de Mercado Pago que va a pagar' using errcode = '22023';
  end if;
  return jsonb_build_object('tenant_id', p_tenant, 'empresa', v_empresa, 'tipo', p_tipo, 'payer_email', v_email,
    'monto', case when p_tipo = 'cuota' then a.cuota else a.adaptacion end);
end $function$;

-- ---------- Solo para la función gestlok-cobros (service_role) ----------
create or replace function public.gestlok_cobros_srv_link(p_tenant uuid, p_tipo text, p_mp_id text, p_link text, p_monto numeric, p_email text)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if p_link !~ '^https://([a-z0-9-]+\.)*mercadopago\.com(\.ar)?/' then raise exception 'Link de Mercado Pago inválido' using errcode = '22023'; end if;
  insert into gestlok_chat_private.suscripciones (tenant_id, requiere_cobro) values (p_tenant, p_tipo = 'cuota')
  on conflict (tenant_id) do nothing;
  if p_tipo = 'cuota' then
    update gestlok_chat_private.suscripciones set mp_preapproval_id = p_mp_id, link_cuota = p_link, monto = p_monto,
      payer_email = p_email, estado = case when estado = 'activa' then estado else 'pendiente' end, actualizada_at = now()
     where tenant_id = p_tenant;
  else
    update gestlok_chat_private.suscripciones set link_adaptacion = p_link, actualizada_at = now() where tenant_id = p_tenant;
  end if;
end $function$;

-- Recibe el recurso tal como lo devuelve la API de Mercado Pago (la función lo vuelve a pedir a Mercado Pago con su
-- clave: nunca confía en lo que trae el aviso).
create or replace function public.gestlok_cobros_srv_evento(p_tipo text, p_recurso jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_ref text; v_tenant uuid; v_estado text; v_pago text; v_id text; v_monto numeric;
begin
  if p_tipo = 'preapproval' then
    v_ref := p_recurso->>'external_reference';
    if v_ref !~ '^cuota:[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'motivo', 'referencia ajena'); end if;
    v_tenant := substr(v_ref, 7)::uuid; v_estado := p_recurso->>'status';
    update gestlok_chat_private.suscripciones set
      mp_preapproval_id = coalesce(p_recurso->>'id', mp_preapproval_id),
      estado = case v_estado when 'authorized' then 'activa' when 'pending' then 'pendiente'
                             when 'paused' then 'cancelada' when 'cancelled' then 'cancelada' else estado end,
      mora_desde = case when v_estado = 'authorized' then null
                        when v_estado in ('paused', 'cancelled') then coalesce(mora_desde, now()) else mora_desde end,
      proximo_cobro = coalesce(nullif(p_recurso->>'next_payment_date', '')::timestamptz, proximo_cobro),
      actualizada_at = now()
     where tenant_id = v_tenant;
    if v_estado = 'authorized' then perform gestlok_chat_private.cobro_reanudar(v_tenant); end if;
    return jsonb_build_object('ok', found, 'tenant_id', v_tenant, 'estado', v_estado);
  elsif p_tipo = 'authorized_payment' then
    select tenant_id into v_tenant from gestlok_chat_private.suscripciones where mp_preapproval_id = p_recurso->>'preapproval_id';
    if v_tenant is null then return jsonb_build_object('ok', false, 'motivo', 'suscripción desconocida'); end if;
    v_id := 'ap:' || (p_recurso->>'id'); v_pago := coalesce(p_recurso->'payment'->>'status', p_recurso->>'status');
    v_monto := nullif(p_recurso->>'transaction_amount', '')::numeric;
    insert into gestlok_chat_private.cobros (tenant_id, tipo, mp_id, estado, monto, pagado_at)
    values (v_tenant, 'cuota', v_id, v_pago, v_monto, case when v_pago = 'approved' then now() end)
    on conflict (mp_id) do update set estado = excluded.estado, monto = coalesce(excluded.monto, cobros.monto),
      pagado_at = coalesce(cobros.pagado_at, excluded.pagado_at), actualizado_at = now();
    if v_pago = 'approved' then
      update gestlok_chat_private.suscripciones set estado = 'activa', ultimo_pago_at = now(), mora_desde = null, actualizada_at = now()
       where tenant_id = v_tenant;
      perform gestlok_chat_private.cobro_reanudar(v_tenant);
    elsif v_pago in ('rejected', 'cancelled') or p_recurso->>'status' = 'recycling' then
      update gestlok_chat_private.suscripciones set estado = 'en_mora', mora_desde = coalesce(mora_desde, now()), actualizada_at = now()
       where tenant_id = v_tenant;
    end if;
    return jsonb_build_object('ok', true, 'tenant_id', v_tenant, 'pago', v_pago);
  elsif p_tipo = 'payment' then
    v_ref := p_recurso->>'external_reference';
    if v_ref !~ '^adaptacion:[0-9a-f-]{36}$' then return jsonb_build_object('ok', false, 'motivo', 'referencia ajena'); end if;
    v_tenant := substr(v_ref, 12)::uuid; v_pago := p_recurso->>'status';
    insert into gestlok_chat_private.cobros (tenant_id, tipo, mp_id, estado, monto, pagado_at)
    values (v_tenant, 'adaptacion', 'pay:' || (p_recurso->>'id'), v_pago, nullif(p_recurso->>'transaction_amount', '')::numeric,
            case when v_pago = 'approved' then now() end)
    on conflict (mp_id) do update set estado = excluded.estado, pagado_at = coalesce(cobros.pagado_at, excluded.pagado_at), actualizado_at = now();
    if v_pago = 'approved' then
      insert into gestlok_chat_private.suscripciones (tenant_id, requiere_cobro) values (v_tenant, false) on conflict (tenant_id) do nothing;
      update gestlok_chat_private.suscripciones set adaptacion_pagada_at = coalesce(adaptacion_pagada_at, now()), actualizada_at = now()
       where tenant_id = v_tenant;
    end if;
    return jsonb_build_object('ok', true, 'tenant_id', v_tenant, 'pago', v_pago);
  end if;
  return jsonb_build_object('ok', false, 'motivo', 'tipo desconocido');
end $function$;

revoke all on function public.gestlok_cobros_srv_link(uuid, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.gestlok_cobros_srv_evento(text, jsonb) from public, anon, authenticated;
grant execute on function public.gestlok_cobros_srv_link(uuid, text, text, text, numeric, text) to service_role;
grant execute on function public.gestlok_cobros_srv_evento(text, jsonb) to service_role;
revoke all on function public.gestlok_chat_panel_suscripcion(uuid) from public, anon;
revoke all on function public.gestlok_chat_admin_cobros() from public, anon;
revoke all on function public.gestlok_chat_admin_cobro_requerir(uuid, boolean) from public, anon;
revoke all on function public.gestlok_chat_admin_cobro_ajustes(numeric, numeric, integer) from public, anon;
revoke all on function public.gestlok_chat_cobro_preparar(uuid, text, text) from public, anon;
grant execute on function public.gestlok_chat_panel_suscripcion(uuid) to authenticated;
grant execute on function public.gestlok_chat_admin_cobros() to authenticated;
grant execute on function public.gestlok_chat_admin_cobro_requerir(uuid, boolean) to authenticated;
grant execute on function public.gestlok_chat_admin_cobro_ajustes(numeric, numeric, integer) to authenticated;
grant execute on function public.gestlok_chat_cobro_preparar(uuid, text, text) to authenticated;
revoke all on function gestlok_chat_private.cobro_reanudar(uuid) from public, anon, authenticated;
revoke all on function gestlok_chat_private.cobros_revisar_mora() from public, anon, authenticated;

-- Las empresas nuevas de «alta propia» quedan con cobro (se agrega a la aprobación).
create or replace function gestlok_chat_private.cobro_alta_aprobada()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if new.action = 'chat_alta_aprobada' and new.tenant_id is not null then
    insert into gestlok_chat_private.suscripciones (tenant_id, requiere_cobro) values (new.tenant_id, true)
    on conflict (tenant_id) do update set requiere_cobro = true, actualizada_at = now();
  end if;
  return new;
end $function$;
drop trigger if exists admin_audit_cobro_alta on gestlok_platform.admin_audit;
create trigger admin_audit_cobro_alta after insert on gestlok_platform.admin_audit
  for each row execute function gestlok_chat_private.cobro_alta_aprobada();

-- Revisión de mora cada hora.
do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'gestlok-chat-cobros-mora') then
    perform cron.unschedule('gestlok-chat-cobros-mora');
  end if;
  perform cron.schedule('gestlok-chat-cobros-mora', '17 * * * *', 'select gestlok_chat_private.cobros_revisar_mora()');
end $cron$;
