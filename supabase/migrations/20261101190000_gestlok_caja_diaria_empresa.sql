-- GESTLOK · Caja diaria exclusiva por empresa (issue #200; especificación: PR #201,
-- docs/caja-diaria-empresa-camilab-issue-200.md).
--
-- Qué hace
--   * Efectivo y transferencia con importes separados y total del día.
--   * Responsable de caja obligatorio (al abrir y al cerrar) y trazabilidad del usuario.
--   * Un solo turno por empresa y fecha de Argentina (UNIQUE en la base). Al cerrarse no se reabre.
--   * «Cerrar día» manual e idempotente; cierre automático a las 23:59 de Buenos Aires
--     desde pg_cron (servidor), sin depender de ningún navegador abierto.
--   * Sin foto de cierre. Historial inmutable con totales por medio, total y responsable.
--
-- Aislamiento
--   * La empresa se resuelve con la membresía autenticada (public.docs col='equipo' + email
--     verificado en auth.users) y el contexto activo (gestlok_tenancy.current_tenant_id()).
--     El email no autoriza por sí solo: también hace falta que la empresa esté habilitada acá.
--   * Esquema privado sin permisos directos; solo RPC SECURITY DEFINER que filtran por empresa.
--     RLS por empresa en todas las tablas como segunda barrera.
--
-- Qué NO toca: public.docs, Mi Gusto (Munro/Torcuato), Pagos Online, fotos de cierre,
-- otras empresas, ReciboNet. No borra ni modifica datos existentes.

create schema if not exists gestlok_caja_private;
revoke all on schema gestlok_caja_private from public, anon, authenticated;

-- 1) Empresas habilitadas. Solo se escribe desde el servidor (migración o panel de Supabase).
create table gestlok_caja_private.empresas(
  tenant_id uuid primary key,
  habilitada boolean not null default true,
  habilitada_at timestamptz not null default now(),
  nota text not null default '' check (char_length(nota) <= 200)
);

-- 2) Turnos: uno por empresa y día de Argentina. Al cerrarse guarda los totales (instantánea).
create table gestlok_caja_private.turnos(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references gestlok_caja_private.empresas(tenant_id) on delete restrict,
  dia date not null,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  responsable text not null check (char_length(responsable) between 2 and 80 and responsable = btrim(responsable)),
  abierto_at timestamptz not null default now(),
  abierto_por uuid not null,
  cerrado_at timestamptz,
  cerrado_por uuid,
  tipo_cierre text check (tipo_cierre in ('manual','automatico')),
  total_efectivo numeric(18,2),
  total_transferencia numeric(18,2),
  total numeric(18,2),
  ventas integer,
  constraint gl_caja_un_turno_por_dia unique (tenant_id, dia),
  constraint gl_caja_turno_empresa unique (id, tenant_id),
  constraint gl_caja_estado_coherente check (
    (estado = 'abierto' and cerrado_at is null and cerrado_por is null and tipo_cierre is null
      and total_efectivo is null and total_transferencia is null and total is null and ventas is null)
    or
    (estado = 'cerrado' and cerrado_at is not null and tipo_cierre is not null
      and (tipo_cierre = 'automatico' or cerrado_por is not null)
      and total_efectivo >= 0 and total_transferencia >= 0
      and total = total_efectivo + total_transferencia and ventas >= 0)
  )
);
create index gl_caja_turnos_abiertos on gestlok_caja_private.turnos (dia) where estado = 'abierto';

-- 3) Ventas del turno. Nunca se borran: se anulan (queda constancia).
create table gestlok_caja_private.movimientos(
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null,
  tenant_id uuid not null,
  operacion uuid not null,
  metodo text not null check (metodo in ('efectivo','transferencia')),
  monto numeric(14,2) not null check (monto > 0 and monto < 10000000000),
  nota text not null default '' check (char_length(nota) <= 120),
  registrado_at timestamptz not null default now(),
  registrado_por uuid not null,
  anulado_at timestamptz,
  anulado_por uuid,
  constraint gl_caja_mov_turno foreign key (turno_id, tenant_id)
    references gestlok_caja_private.turnos (id, tenant_id) on delete restrict,
  -- Idempotencia: el mismo envío (doble toque, reintento sin señal) no duplica la venta.
  constraint gl_caja_mov_operacion unique (turno_id, operacion),
  constraint gl_caja_mov_anulacion check ((anulado_at is null) = (anulado_por is null))
);

-- 4) Registro de acciones (solo agrega). actor nulo únicamente en el cierre automático.
create table gestlok_caja_private.auditoria(
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  turno_id uuid not null,
  movimiento_id uuid,
  accion text not null check (accion in ('apertura','venta','anulacion','responsable','cierre_manual','cierre_automatico')),
  actor uuid,
  datos jsonb not null default '{}'::jsonb,
  at timestamptz not null default clock_timestamp(),
  check (accion = 'cierre_automatico' or actor is not null)
);
create index gl_caja_auditoria_empresa on gestlok_caja_private.auditoria (tenant_id, at desc);

-- Fecha y límite de cierre siempre en hora de Buenos Aires (independiente del huso del servidor).
create function gestlok_caja_private.dia_ar(p_ahora timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (p_ahora at time zone 'America/Argentina/Buenos_Aires')::date
$$;
create function gestlok_caja_private.limite(p_dia date) returns timestamptz
language sql stable set search_path = '' as $$
  select (p_dia + time '23:59') at time zone 'America/Argentina/Buenos_Aires'
$$;

-- Empresa autorizada de la sesión: contexto activo + membresía verificada + empresa habilitada.
-- Dueño, o gerente/editor con al menos un local de esa empresa. La consulta de soporte de la
-- creadora no habilita esta caja. Devuelve NULL si no corresponde.
create function gestlok_caja_private.empresa_autorizada() returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id
  from (select gestlok_tenancy.current_tenant_id() as id) t
  where auth.uid() is not null and t.id is not null
    and gestlok_platform.support_tenant() is null
    and exists (select 1 from gestlok_caja_private.empresas c where c.tenant_id = t.id and c.habilitada)
    and exists (
      select 1 from public.docs e
      where e.col = 'equipo' and e.tenant_id = t.id
        and lower(e.data->>'email') = gestlok_tenancy.verified_role_context_email()
        and (e.data->>'rol' = 'dueno'
          or (e.data->>'rol' in ('gerente','editor') and exists (
            select 1 from public.docs l
            where l.col = 'locales' and l.tenant_id = t.id
              and coalesce(e.data->'locales', '[]'::jsonb) ? l.id))))
$$;

create function gestlok_caja_private.email_de(p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = p_uid
$$;

create function gestlok_caja_private.payload(t gestlok_caja_private.turnos, p_detalle boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'dia', t.dia, 'estado', t.estado, 'responsable', t.responsable,
    'abierto_at', t.abierto_at, 'abierto_por', gestlok_caja_private.email_de(t.abierto_por),
    'cerrado_at', t.cerrado_at, 'cerrado_por', gestlok_caja_private.email_de(t.cerrado_por),
    'tipo_cierre', t.tipo_cierre, 'limite', gestlok_caja_private.limite(t.dia),
    'efectivo', coalesce(t.total_efectivo, z.efectivo),
    'transferencia', coalesce(t.total_transferencia, z.transferencia),
    'total', coalesce(t.total, z.efectivo + z.transferencia),
    'ventas', coalesce(t.ventas, z.ventas)
  ) || case when p_detalle then jsonb_build_object('movimientos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id, 'metodo', m.metodo, 'monto', m.monto, 'nota', m.nota,
          'registrado_at', m.registrado_at, 'registrado_por', gestlok_caja_private.email_de(m.registrado_por),
          'anulado', m.anulado_at is not null, 'anulado_at', m.anulado_at
        ) order by m.registrado_at, m.id)
        from gestlok_caja_private.movimientos m where m.turno_id = t.id), '[]'::jsonb))
      else '{}'::jsonb end
  from (
    select coalesce(sum(m.monto) filter (where m.metodo = 'efectivo'), 0)::numeric(18,2) as efectivo,
           coalesce(sum(m.monto) filter (where m.metodo = 'transferencia'), 0)::numeric(18,2) as transferencia,
           count(*)::integer as ventas
    from gestlok_caja_private.movimientos m
    where m.turno_id = t.id and m.anulado_at is null and t.estado = 'abierto'
  ) z
$$;

-- Cierre interno (manual o automático). Bloquea el turno; si ya estaba cerrado no hace nada.
create function gestlok_caja_private.cerrar(p_turno uuid, p_tipo text, p_actor uuid, p_responsable text)
returns gestlok_caja_private.turnos
language plpgsql security definer set search_path = '' as $$
declare
  t gestlok_caja_private.turnos;
  v_ef numeric(18,2); v_tr numeric(18,2); v_n integer;
begin
  if p_tipo not in ('manual','automatico') or (p_tipo = 'manual' and p_actor is null) then
    raise exception 'Tipo de cierre inválido' using errcode = '22023';
  end if;
  select * into t from gestlok_caja_private.turnos where id = p_turno for update;
  if t.id is null then raise exception 'Turno inexistente' using errcode = '22023'; end if;
  if t.estado = 'cerrado' then return t; end if;
  select coalesce(sum(monto) filter (where metodo = 'efectivo'), 0),
         coalesce(sum(monto) filter (where metodo = 'transferencia'), 0),
         count(*)
    into v_ef, v_tr, v_n
    from gestlok_caja_private.movimientos where turno_id = t.id and anulado_at is null;
  update gestlok_caja_private.turnos set
      estado = 'cerrado',
      -- Hora real del cierre (no la del inicio de la transacción): ninguna venta queda después.
      cerrado_at = case when p_tipo = 'automatico' then gestlok_caja_private.limite(t.dia) else clock_timestamp() end,
      cerrado_por = case when p_tipo = 'manual' then p_actor end,
      tipo_cierre = p_tipo,
      responsable = coalesce(nullif(btrim(p_responsable), ''), t.responsable),
      total_efectivo = v_ef, total_transferencia = v_tr, total = v_ef + v_tr, ventas = v_n
    where id = t.id returning * into t;
  insert into gestlok_caja_private.auditoria (tenant_id, turno_id, accion, actor, datos)
  values (t.tenant_id, t.id, case when p_tipo = 'manual' then 'cierre_manual' else 'cierre_automatico' end,
          case when p_tipo = 'manual' then p_actor end,
          jsonb_build_object('responsable', t.responsable, 'efectivo', t.total_efectivo,
            'transferencia', t.total_transferencia, 'total', t.total, 'ventas', t.ventas,
            'ejecutado_at', now()));
  return t;
end $$;

-- Cierre automático: cierra todo turno abierto cuyo límite (23:59 de su día) ya pasó.
-- Idempotente y tolerante a demoras, repeticiones y cambios de fecha: lo ejecuta pg_cron
-- y también cada RPC de la caja antes de leer o escribir (por si el servidor estuvo caído).
create function gestlok_caja_private.cerrar_vencidos(p_tenant uuid default null, p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; t gestlok_caja_private.turnos;
begin
  for r in
    select id from gestlok_caja_private.turnos
    where estado = 'abierto' and (p_tenant is null or tenant_id = p_tenant)
      and gestlok_caja_private.limite(dia) <= p_ahora
    order by dia, id
    for update
  loop
    t := gestlok_caja_private.cerrar(r.id, 'automatico', null, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Inmutabilidad en la base (vale también fuera de las RPC).
create function gestlok_caja_private.proteger_turno() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Los turnos de caja no se eliminan' using errcode = '42501'; end if;
  if old.estado = 'cerrado' then raise exception 'El cierre de caja es definitivo y no se modifica' using errcode = '42501'; end if;
  if new.id <> old.id or new.tenant_id <> old.tenant_id or new.dia <> old.dia
     or new.abierto_at <> old.abierto_at or new.abierto_por <> old.abierto_por then
    raise exception 'Los datos de apertura no se modifican' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger gl_caja_proteger_turno before update or delete on gestlok_caja_private.turnos
  for each row execute function gestlok_caja_private.proteger_turno();

create function gestlok_caja_private.proteger_movimiento() returns trigger
language plpgsql set search_path = '' as $$
declare v_estado text;
begin
  if tg_op = 'DELETE' then raise exception 'Las ventas no se eliminan: se anulan' using errcode = '42501'; end if;
  select estado into v_estado from gestlok_caja_private.turnos where id = new.turno_id;
  if v_estado is distinct from 'abierto' then
    raise exception 'La caja de ese día está cerrada' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (old.anulado_at is not null or new.anulado_at is null
     or (new.id, new.turno_id, new.tenant_id, new.operacion, new.metodo, new.monto, new.nota, new.registrado_at, new.registrado_por)
        is distinct from
        (old.id, old.turno_id, old.tenant_id, old.operacion, old.metodo, old.monto, old.nota, old.registrado_at, old.registrado_por)) then
    raise exception 'Una venta solo se puede anular una vez' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger gl_caja_proteger_movimiento before insert or update or delete on gestlok_caja_private.movimientos
  for each row execute function gestlok_caja_private.proteger_movimiento();

create function gestlok_caja_private.solo_agregar() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Registro inmutable de la caja' using errcode = '42501';
end $$;
create trigger gl_caja_auditoria_inmutable before update or delete on gestlok_caja_private.auditoria
  for each row execute function gestlok_caja_private.solo_agregar();
create trigger gl_caja_turnos_sin_truncate before truncate on gestlok_caja_private.turnos
  for each statement execute function gestlok_caja_private.solo_agregar();
create trigger gl_caja_movimientos_sin_truncate before truncate on gestlok_caja_private.movimientos
  for each statement execute function gestlok_caja_private.solo_agregar();
create trigger gl_caja_auditoria_sin_truncate before truncate on gestlok_caja_private.auditoria
  for each statement execute function gestlok_caja_private.solo_agregar();

-- RLS por empresa (segunda barrera: hoy no hay permisos directos sobre estas tablas).
alter table gestlok_caja_private.empresas enable row level security;
alter table gestlok_caja_private.turnos enable row level security;
alter table gestlok_caja_private.movimientos enable row level security;
alter table gestlok_caja_private.auditoria enable row level security;
create policy gl_caja_empresas_propia on gestlok_caja_private.empresas for select to authenticated
  using (tenant_id = (select gestlok_caja_private.empresa_autorizada()));
create policy gl_caja_turnos_propios on gestlok_caja_private.turnos for select to authenticated
  using (tenant_id = (select gestlok_caja_private.empresa_autorizada()));
create policy gl_caja_movimientos_propios on gestlok_caja_private.movimientos for select to authenticated
  using (tenant_id = (select gestlok_caja_private.empresa_autorizada()));
create policy gl_caja_auditoria_propia on gestlok_caja_private.auditoria for select to authenticated
  using (tenant_id = (select gestlok_caja_private.empresa_autorizada()));

-- ===================== RPC públicas (solo usuarios con sesión) =====================

-- Liviana, sin escrituras: decide si la app muestra el acceso. Nunca da error.
create function public.gestlok_caja_acceso() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when x.t is null then jsonb_build_object('habilitada', false)
    else jsonb_build_object('habilitada', true, 'tenant_id', x.t, 'hoy', gestlok_caja_private.dia_ar()) end
  from (select gestlok_caja_private.empresa_autorizada() as t) x
$$;

create function public.gestlok_caja_estado() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t uuid := gestlok_caja_private.empresa_autorizada(); v_hoy date; h gestlok_caja_private.turnos;
begin
  if v_t is null then raise exception 'Sin permiso para la caja de esta empresa' using errcode = '42501'; end if;
  perform gestlok_caja_private.cerrar_vencidos(v_t);
  v_hoy := gestlok_caja_private.dia_ar();
  select * into h from gestlok_caja_private.turnos where tenant_id = v_t and dia = v_hoy;
  return jsonb_build_object(
    'tenant_id', v_t, 'hoy', v_hoy, 'ahora', now(), 'limite', gestlok_caja_private.limite(v_hoy),
    'puede_abrir', h.id is null and now() < gestlok_caja_private.limite(v_hoy),
    'turno', case when h.id is null then null else gestlok_caja_private.payload(h, true) end,
    'historial', coalesce((
      select jsonb_agg(gestlok_caja_private.payload(x, false) order by x.dia desc)
      from (select * from gestlok_caja_private.turnos
            where tenant_id = v_t and estado = 'cerrado' order by dia desc limit 400) x), '[]'::jsonb));
end $$;

-- Abre la caja del día con su responsable. Dos equipos a la vez: se crea una sola.
-- Si la caja de hoy ya se cerró, no se reabre.
create function public.gestlok_caja_abrir(p_responsable text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t uuid := gestlok_caja_private.empresa_autorizada();
  v_resp text := btrim(coalesce(p_responsable, ''));
  v_hoy date; h gestlok_caja_private.turnos;
begin
  if v_t is null then raise exception 'Sin permiso para la caja de esta empresa' using errcode = '42501'; end if;
  if char_length(v_resp) not between 2 and 80 then
    raise exception 'Escribí el nombre de la persona responsable de la caja' using errcode = '22023';
  end if;
  perform gestlok_caja_private.cerrar_vencidos(v_t);
  v_hoy := gestlok_caja_private.dia_ar();
  if now() >= gestlok_caja_private.limite(v_hoy) then
    raise exception 'La caja de hoy ya cerró a las 23:59. Podés abrir la de mañana desde las 00:00.' using errcode = '22023';
  end if;
  insert into gestlok_caja_private.turnos (tenant_id, dia, responsable, abierto_por)
  values (v_t, v_hoy, v_resp, auth.uid())
  on conflict on constraint gl_caja_un_turno_por_dia do nothing
  returning * into h;
  if h.id is not null then
    insert into gestlok_caja_private.auditoria (tenant_id, turno_id, accion, actor, datos)
    values (v_t, h.id, 'apertura', auth.uid(), jsonb_build_object('responsable', v_resp));
    return jsonb_build_object('nuevo', true, 'turno', gestlok_caja_private.payload(h, true));
  end if;
  select * into h from gestlok_caja_private.turnos where tenant_id = v_t and dia = v_hoy;
  return jsonb_build_object('nuevo', false, 'turno', gestlok_caja_private.payload(h, true));
end $$;

create function public.gestlok_caja_responsable(p_turno uuid, p_responsable text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t uuid := gestlok_caja_private.empresa_autorizada();
  v_resp text := btrim(coalesce(p_responsable, ''));
  h gestlok_caja_private.turnos; v_antes text;
begin
  if v_t is null then raise exception 'Sin permiso para la caja de esta empresa' using errcode = '42501'; end if;
  if char_length(v_resp) not between 2 and 80 then
    raise exception 'Escribí el nombre de la persona responsable de la caja' using errcode = '22023';
  end if;
  perform gestlok_caja_private.cerrar_vencidos(v_t);
  select * into h from gestlok_caja_private.turnos where id = p_turno and tenant_id = v_t for update;
  if h.id is null then raise exception 'La caja no corresponde a tu empresa' using errcode = '42501'; end if;
  if h.estado <> 'abierto' then raise exception 'La caja de ese día ya está cerrada' using errcode = '22023'; end if;
  v_antes := h.responsable;
  if v_antes <> v_resp then
    update gestlok_caja_private.turnos set responsable = v_resp where id = h.id returning * into h;
    insert into gestlok_caja_private.auditoria (tenant_id, turno_id, accion, actor, datos)
    values (v_t, h.id, 'responsable', auth.uid(), jsonb_build_object('antes', v_antes, 'despues', v_resp));
  end if;
  return jsonb_build_object('turno', gestlok_caja_private.payload(h, true));
end $$;

-- Registra una venta. p_operacion la genera el equipo: si se repite, no se duplica.
create function public.gestlok_caja_registrar(p_turno uuid, p_metodo text, p_monto numeric, p_nota text, p_operacion uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_t uuid := gestlok_caja_private.empresa_autorizada();
  v_nota text := btrim(coalesce(p_nota, ''));
  h gestlok_caja_private.turnos; m gestlok_caja_private.movimientos;
begin
  if v_t is null then raise exception 'Sin permiso para la caja de esta empresa' using errcode = '42501'; end if;
  if p_operacion is null or p_metodo is null or p_metodo not in ('efectivo','transferencia')
     or p_monto is null or p_monto <= 0 or p_monto >= 10000000000 or p_monto <> round(p_monto, 2)
     or char_length(v_nota) > 120 then
    raise exception 'Revisá el medio de pago y el importe (mayor a 0, hasta 2 decimales)' using errcode = '22023';
  end if;
  perform gestlok_caja_private.cerrar_vencidos(v_t);
  select * into h from gestlok_caja_private.turnos where id = p_turno and tenant_id = v_t for update;
  if h.id is null then raise exception 'La caja no corresponde a tu empresa' using errcode = '42501'; end if;
  select * into m from gestlok_caja_private.movimientos where turno_id = h.id and operacion = p_operacion;
  if m.id is not null then
    return jsonb_build_object('repetida', true, 'movimiento_id', m.id, 'turno', gestlok_caja_private.payload(h, true));
  end if;
  if h.estado <> 'abierto' then raise exception 'La caja de ese día ya está cerrada' using errcode = '22023'; end if;
  if h.dia <> gestlok_caja_private.dia_ar(clock_timestamp()) or clock_timestamp() >= gestlok_caja_private.limite(h.dia) then
    raise exception 'Ya pasó el cierre de las 23:59 de ese día. Actualizá la caja.' using errcode = '22023';
  end if;
  insert into gestlok_caja_private.movimientos (turno_id, tenant_id, operacion, metodo, monto, nota, registrado_at, registrado_por)
  values (h.id, v_t, p_operacion, p_metodo, p_monto, v_nota, clock_timestamp(), auth.uid())
  returning * into m;
  insert into gestlok_caja_private.auditoria (tenant_id, turno_id, movimiento_id, accion, actor, datos)
  values (v_t, h.id, m.id, 'venta', auth.uid(), jsonb_build_object('metodo', m.metodo, 'monto', m.monto));
  return jsonb_build_object('repetida', false, 'movimiento_id', m.id, 'turno', gestlok_caja_private.payload(h, true));
end $$;

create function public.gestlok_caja_anular(p_turno uuid, p_movimiento uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t uuid := gestlok_caja_private.empresa_autorizada();
  h gestlok_caja_private.turnos; m gestlok_caja_private.movimientos;
begin
  if v_t is null then raise exception 'Sin permiso para la caja de esta empresa' using errcode = '42501'; end if;
  perform gestlok_caja_private.cerrar_vencidos(v_t);
  select * into h from gestlok_caja_private.turnos where id = p_turno and tenant_id = v_t for update;
  if h.id is null then raise exception 'La caja no corresponde a tu empresa' using errcode = '42501'; end if;
  select * into m from gestlok_caja_private.movimientos where id = p_movimiento and turno_id = h.id;
  if m.id is null then raise exception 'La venta no existe en esta caja' using errcode = '22023'; end if;
  if m.anulado_at is not null then
    return jsonb_build_object('repetida', true, 'turno', gestlok_caja_private.payload(h, true));
  end if;
  if h.estado <> 'abierto' then raise exception 'La caja de ese día ya está cerrada' using errcode = '22023'; end if;
  update gestlok_caja_private.movimientos set anulado_at = clock_timestamp(), anulado_por = auth.uid()
    where id = m.id returning * into m;
  insert into gestlok_caja_private.auditoria (tenant_id, turno_id, movimiento_id, accion, actor, datos)
  values (v_t, h.id, m.id, 'anulacion', auth.uid(), jsonb_build_object('metodo', m.metodo, 'monto', m.monto));
  return jsonb_build_object('repetida', false, 'turno', gestlok_caja_private.payload(h, true));
end $$;

-- «Cerrar día»: idempotente. Doble toque o dos equipos: un solo cierre, el resto recibe ya_cerrado.
create function public.gestlok_caja_cerrar(p_turno uuid, p_responsable text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t uuid := gestlok_caja_private.empresa_autorizada();
  v_resp text := btrim(coalesce(p_responsable, ''));
  h gestlok_caja_private.turnos;
begin
  if v_t is null then raise exception 'Sin permiso para la caja de esta empresa' using errcode = '42501'; end if;
  if char_length(v_resp) not between 2 and 80 then
    raise exception 'Escribí el nombre de la persona responsable del cierre' using errcode = '22023';
  end if;
  perform gestlok_caja_private.cerrar_vencidos(v_t);
  select * into h from gestlok_caja_private.turnos where id = p_turno and tenant_id = v_t for update;
  if h.id is null then raise exception 'La caja no corresponde a tu empresa' using errcode = '42501'; end if;
  if h.estado = 'cerrado' then
    return jsonb_build_object('ya_cerrado', true, 'turno', gestlok_caja_private.payload(h, true));
  end if;
  h := gestlok_caja_private.cerrar(h.id, 'manual', auth.uid(), v_resp);
  return jsonb_build_object('ya_cerrado', false, 'turno', gestlok_caja_private.payload(h, true));
end $$;

create function public.gestlok_caja_detalle(p_turno uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_t uuid := gestlok_caja_private.empresa_autorizada(); h gestlok_caja_private.turnos;
begin
  if v_t is null then raise exception 'Sin permiso para la caja de esta empresa' using errcode = '42501'; end if;
  select * into h from gestlok_caja_private.turnos where id = p_turno and tenant_id = v_t;
  if h.id is null then raise exception 'La caja no corresponde a tu empresa' using errcode = '42501'; end if;
  return gestlok_caja_private.payload(h, true);
end $$;

-- Permisos: nada directo sobre el esquema privado; solo las RPC para usuarios con sesión.
revoke all on all tables in schema gestlok_caja_private from public, anon, authenticated;
revoke all on all sequences in schema gestlok_caja_private from public, anon, authenticated;
revoke all on all functions in schema gestlok_caja_private from public, anon, authenticated;
revoke all on function public.gestlok_caja_acceso(), public.gestlok_caja_estado(),
  public.gestlok_caja_abrir(text), public.gestlok_caja_responsable(uuid, text),
  public.gestlok_caja_registrar(uuid, text, numeric, text, uuid), public.gestlok_caja_anular(uuid, uuid),
  public.gestlok_caja_cerrar(uuid, text), public.gestlok_caja_detalle(uuid)
  from public, anon;
grant execute on function public.gestlok_caja_acceso(), public.gestlok_caja_estado(),
  public.gestlok_caja_abrir(text), public.gestlok_caja_responsable(uuid, text),
  public.gestlok_caja_registrar(uuid, text, numeric, text, uuid), public.gestlok_caja_anular(uuid, uuid),
  public.gestlok_caja_cerrar(uuid, text), public.gestlok_caja_detalle(uuid)
  to authenticated;

-- Habilitar SOLO la empresa del pedido #200: tenant Perfumes, resuelto por la membresía de dueña
-- de la cuenta solicitante (no se guarda su email). Si no existe, la caja queda sin habilitar.
do $$
declare v_t constant uuid := '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
begin
  if exists (select 1 from public.docs e where e.col = 'equipo' and e.tenant_id = v_t and e.data->>'rol' = 'dueno') then
    insert into gestlok_caja_private.empresas (tenant_id, nota)
    values (v_t, 'Perfumes · pedido #200') on conflict (tenant_id) do nothing;
  else
    raise notice 'Empresa del pedido #200 no encontrada: la caja diaria queda sin habilitar.';
  end if;
end $$;

-- Cierre automático en el servidor: minuto 59 de cada hora. La función solo cierra turnos cuyo
-- límite (23:59 de Buenos Aires) ya pasó, así que el cierre real ocurre a las 23:59 y las demás
-- ejecuciones sirven de respaldo si alguna falló. Sin pg_cron (pruebas locales) se omite.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gestlok-caja-diaria-cierre-2359-ar', '59 * * * *',
      'select gestlok_caja_private.cerrar_vencidos();');
  end if;
end $$;

comment on schema gestlok_caja_private is
  'Caja diaria por empresa (issue #200). Solo RPC gestlok_caja_*; cierre automático 23:59 AR por pg_cron.';
