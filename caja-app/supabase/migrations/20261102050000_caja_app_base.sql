-- Caja app (micro app de caja para cualquier comercio). Nombre comercial pendiente.
-- Esquema propio `caja_app` dentro del mismo proyecto de Supabase que GESTLOK, sin tocar
-- ninguna tabla, función ni dato de GESTLOK. Multiempresa desde el primer día: cada comercio
-- (comercio_id) solo ve lo suyo. Acceso solo por RPC `public.caja_app_*`; RLS como segunda barrera.
--
-- Controla los números, no factura: caja inicial, cobros por medio de pago (o totales al cierre),
-- gastos, ingresos, retiros, correcciones con motivo, fotos antes del cierre, arqueo (saldo teórico
-- vs efectivo contado), retiro y caja para mañana, cierre automático y arqueo tardío.

create schema if not exists caja_app;
revoke all on schema caja_app from public, anon, authenticated;

-- ============================== Tablas ==============================

create table caja_app.comercios(
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 80 and nombre = btrim(nombre)),
  estado text not null default 'activo' check (estado in ('activo','suspendido')),
  creado_por uuid not null,
  creado_at timestamptz not null default now(),
  -- Configuración (la cambia el dueño)
  medios text[] not null default array['Efectivo','Transferencia','Débito','Crédito','Mercado Pago QR'],
  modo_carga text not null default 'cobro' check (modo_carga in ('cobro','totales')),
  hora_cierre time not null default '23:59',
  caja_inicial_habitual numeric(14,2) not null default 0 check (caja_inicial_habitual >= 0),
  inicial_desde_cierre boolean not null default true,
  fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array'),
  bloquear_sin_fotos boolean not null default true,
  categorias_gasto text[] not null default array['Proveedores','Insumos','Delivery','Limpieza','Servicios','Otro'],
  tipos_retiro text[] not null default array['Retiro del dueño','Adelanto a empleado','Depósito en el banco','Caja fuerte'],
  categorias_ingreso text[] not null default array['Aporte de cambio','Cobro de deuda','Otro'],
  check ('Efectivo' = any(medios))
);

create table caja_app.locales(
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references caja_app.comercios(id) on delete restrict,
  nombre text not null check (char_length(nombre) between 2 and 60 and nombre = btrim(nombre)),
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  unique (comercio_id, nombre),
  unique (id, comercio_id)
);

-- Cuentas con acceso (Supabase Auth). El dueño administra; el encargado usa el celular de caja.
create table caja_app.miembros(
  comercio_id uuid not null references caja_app.comercios(id) on delete restrict,
  user_id uuid not null,
  rol text not null check (rol in ('dueno','encargado')),
  creado_at timestamptz not null default now(),
  primary key (comercio_id, user_id)
);

-- Personas que cargan en la caja con su PIN (celulares compartidos).
create table caja_app.personas(
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references caja_app.comercios(id) on delete restrict,
  nombre text not null check (char_length(nombre) between 2 and 60 and nombre = btrim(nombre)),
  rol text not null check (rol in ('dueno','encargado','cajero')),
  locales uuid[] not null default '{}',              -- vacío = todos los locales
  pin_hash text not null,
  activo boolean not null default true,
  gasto_maximo numeric(14,2) check (gasto_maximo is null or gasto_maximo >= 0),
  intentos_fallidos integer not null default 0,
  bloqueado_hasta timestamptz,
  creado_at timestamptz not null default now(),
  unique (comercio_id, nombre),
  unique (id, comercio_id)
);

create table caja_app.sesiones(
  token_hash text primary key,
  persona_id uuid not null references caja_app.personas(id) on delete cascade,
  comercio_id uuid not null,
  local_id uuid not null,
  user_id uuid not null,
  creada_at timestamptz not null default now(),
  expira_at timestamptz not null
);
create index caja_app_sesiones_persona on caja_app.sesiones (persona_id);

create table caja_app.cajas(
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null,
  local_id uuid not null,
  dia date not null,
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  modo_carga text not null check (modo_carga in ('cobro','totales')),
  caja_inicial numeric(14,2) not null check (caja_inicial >= 0),
  caja_inicial_sugerida numeric(14,2),
  inicial_coincide boolean not null,
  abierta_at timestamptz not null default clock_timestamp(),
  abierta_por uuid not null,
  abierta_por_user uuid not null,
  -- Cierre
  venta_total_sistema numeric(14,2) check (venta_total_sistema is null or venta_total_sistema >= 0),
  otros_medios jsonb,
  verificados jsonb,
  totales jsonb,
  total_cobrado numeric(14,2),
  saldo_teorico numeric(14,2),
  arqueo numeric(14,2) check (arqueo is null or arqueo >= 0),
  diferencia numeric(14,2),
  arqueo_tardio boolean not null default false,
  arqueo_por uuid,
  arqueo_at timestamptz,
  retiro_cierre numeric(14,2) check (retiro_cierre is null or retiro_cierre >= 0),
  retiro_destino text check (retiro_destino is null or char_length(retiro_destino) <= 60),
  queda_para_manana numeric(14,2) check (queda_para_manana is null or queda_para_manana >= 0),
  observacion text check (observacion is null or char_length(observacion) <= 300),
  cerrada_at timestamptz,
  cerrada_por uuid,
  tipo_cierre text check (tipo_cierre in ('manual','automatico')),
  constraint caja_app_una_caja_por_dia unique (local_id, dia),
  unique (id, comercio_id),
  foreign key (local_id, comercio_id) references caja_app.locales (id, comercio_id) on delete restrict,
  check ((estado = 'abierta' and cerrada_at is null and tipo_cierre is null and arqueo is null)
      or (estado = 'cerrada' and cerrada_at is not null and tipo_cierre is not null
          and (tipo_cierre = 'automatico' or (cerrada_por is not null and arqueo is not null))))
);
create index caja_app_cajas_abiertas on caja_app.cajas (dia) where estado = 'abierta';
create index caja_app_cajas_historial on caja_app.cajas (comercio_id, dia desc);

create table caja_app.movimientos(
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null,
  comercio_id uuid not null,
  operacion uuid not null,
  tipo text not null check (tipo in ('cobro','gasto','ingreso','retiro')),
  medio text not null check (char_length(medio) between 2 and 40),
  monto numeric(14,2) not null check (monto > 0 and monto < 10000000000),
  categoria text check (categoria is null or char_length(categoria) between 2 and 40),
  detalle text not null default '' check (char_length(detalle) <= 120),
  registrado_por uuid not null,
  registrado_por_user uuid not null,
  registrado_at timestamptz not null default clock_timestamp(),
  anulado_at timestamptz,
  anulado_por uuid,
  motivo_anulacion text check (motivo_anulacion is null or char_length(motivo_anulacion) between 2 and 60),
  comentario_anulacion text check (comentario_anulacion is null or char_length(comentario_anulacion) <= 200),
  corrige uuid references caja_app.movimientos(id),
  constraint caja_app_mov_operacion unique (caja_id, operacion),
  foreign key (caja_id, comercio_id) references caja_app.cajas (id, comercio_id) on delete restrict,
  check ((anulado_at is null) = (anulado_por is null) and (anulado_at is null) = (motivo_anulacion is null))
);
create index caja_app_mov_caja on caja_app.movimientos (caja_id, registrado_at);

create table caja_app.fotos(
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null,
  comercio_id uuid not null,
  pedido text not null check (pedido ~ '^[a-z0-9_-]{1,40}$'),
  path text not null unique,
  subida_por uuid not null,
  subida_at timestamptz not null default clock_timestamp(),
  foreign key (caja_id, comercio_id) references caja_app.cajas (id, comercio_id) on delete restrict
);

create table caja_app.auditoria(
  id bigint generated always as identity primary key,
  comercio_id uuid not null,
  caja_id uuid,
  accion text not null,
  persona_id uuid,
  user_id uuid,
  datos jsonb not null default '{}'::jsonb,
  at timestamptz not null default clock_timestamp()
);
create index caja_app_auditoria_comercio on caja_app.auditoria (comercio_id, at desc);

-- ============================== Utilidades ==============================

create function caja_app.dia_ar(p timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select (p at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create function caja_app.limite(p_dia date, p_hora time) returns timestamptz
language sql stable set search_path = '' as $$
  select (p_dia + p_hora) at time zone 'America/Argentina/Buenos_Aires'
$$;

create function caja_app.texto_ok(p text, p_min int, p_max int) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and p = btrim(p) and char_length(p) between p_min and p_max
$$;

create function caja_app.lista_ok(p text[], p_max int) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and coalesce(array_length(p, 1), 0) between 1 and p_max
    and (select bool_and(caja_app.texto_ok(x, 2, 40)) and count(distinct lower(x)) = count(*) from unnest(p) x)
$$;

create function caja_app.nombre(p_persona uuid) returns text
language sql stable security definer set search_path = '' as $$
  select nombre from caja_app.personas where id = p_persona
$$;

create function caja_app.auditar(p_comercio uuid, p_caja uuid, p_accion text, p_persona uuid, p_datos jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into caja_app.auditoria (comercio_id, caja_id, accion, persona_id, user_id, datos)
  values (p_comercio, p_caja, p_accion, p_persona, auth.uid(), coalesce(p_datos, '{}'::jsonb))
$$;

-- Rol de la cuenta en un comercio activo (null = sin acceso).
create function caja_app.rol(p_comercio uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.rol from caja_app.miembros m join caja_app.comercios c on c.id = m.comercio_id
  where m.comercio_id = p_comercio and m.user_id = auth.uid() and c.estado = 'activo' and auth.uid() is not null
$$;

create function caja_app.exigir_dueno(p_comercio uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if caja_app.rol(p_comercio) is distinct from 'dueno' then
    raise exception 'Solo el dueño puede hacer esto' using errcode = '42501';
  end if;
end $$;

-- Sesión del operador: token del PIN + misma cuenta del celular + comercio activo.
create function caja_app.operador(p_token text) returns caja_app.sesiones
language plpgsql stable security definer set search_path = '' as $$
declare s caja_app.sesiones;
begin
  select x.* into s
  from caja_app.sesiones x
  join caja_app.personas p on p.id = x.persona_id and p.activo
  join caja_app.miembros m on m.comercio_id = x.comercio_id and m.user_id = auth.uid()
  join caja_app.comercios c on c.id = x.comercio_id and c.estado = 'activo'
  join caja_app.locales l on l.id = x.local_id and l.activo
  where auth.uid() is not null and x.user_id = auth.uid() and x.expira_at > now()
    and x.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and (cardinality(p.locales) = 0 or x.local_id = any(p.locales));
  if s.token_hash is null then
    raise exception 'Tu sesión de caja venció. Ingresá tu PIN de nuevo.' using errcode = '42501';
  end if;
  return s;
end $$;

-- Totales de una caja. Con p_venta_total y p_otros calcula el modo «totales al cierre».
create function caja_app.calcular(p_caja uuid, p_venta_total numeric default null, p_otros jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c caja_app.cajas; r record;
  v_venta numeric(14,2); v_otros numeric(14,2) := 0; v_ef numeric(14,2); v_saldo numeric(14,2);
  v_otros_json jsonb;
begin
  select * into c from caja_app.cajas where id = p_caja;
  select
    coalesce(sum(monto) filter (where tipo = 'cobro'), 0) as cobrado,
    count(*) filter (where tipo = 'cobro') as cobros,
    coalesce(sum(monto) filter (where tipo = 'cobro' and medio = 'Efectivo'), 0) as cobro_ef,
    coalesce(sum(monto) filter (where tipo = 'ingreso' and medio = 'Efectivo'), 0) as ingresos_ef,
    coalesce(sum(monto) filter (where tipo = 'gasto' and medio = 'Efectivo'), 0) as gastos_ef,
    coalesce(sum(monto) filter (where tipo = 'retiro' and medio = 'Efectivo'), 0) as retiros_ef,
    coalesce(sum(monto) filter (where tipo = 'ingreso'), 0) as ingresos,
    coalesce(sum(monto) filter (where tipo = 'gasto'), 0) as gastos,
    coalesce(sum(monto) filter (where tipo = 'retiro'), 0) as retiros,
    count(*) filter (where tipo = 'gasto') as n_gastos,
    count(*) filter (where tipo = 'retiro') as n_retiros,
    count(*) filter (where tipo = 'ingreso') as n_ingresos
  into r from caja_app.movimientos where caja_id = p_caja and anulado_at is null;

  if c.modo_carga = 'cobro' then
    v_venta := r.cobrado;
    v_ef := r.cobro_ef;
    v_otros_json := coalesce((select jsonb_object_agg(medio, total) from (
      select medio, sum(monto) as total from caja_app.movimientos
      where caja_id = p_caja and anulado_at is null and tipo = 'cobro' group by medio) z), '{}'::jsonb);
  else
    v_venta := coalesce(p_venta_total, c.venta_total_sistema);
    v_otros_json := coalesce(p_otros, c.otros_medios, '{}'::jsonb);
    select coalesce(sum(value::numeric), 0) into v_otros from jsonb_each_text(v_otros_json);
    v_ef := case when v_venta is null then null else v_venta - v_otros end;
  end if;
  v_saldo := case when v_ef is null then null
                  else c.caja_inicial + v_ef + r.ingresos_ef - r.gastos_ef - r.retiros_ef end;
  return jsonb_build_object(
    'total_cobrado', v_venta, 'cobros', r.cobros, 'por_medio', v_otros_json,
    'efectivo_ventas', v_ef, 'ingresos_efectivo', r.ingresos_ef, 'gastos_efectivo', r.gastos_ef,
    'retiros_efectivo', r.retiros_ef, 'ingresos', r.ingresos, 'gastos', r.gastos, 'retiros', r.retiros,
    'n_gastos', r.n_gastos, 'n_retiros', r.n_retiros, 'n_ingresos', r.n_ingresos,
    'caja_inicial', c.caja_inicial, 'saldo_teorico', v_saldo,
    'en_caja_sin_ventas', c.caja_inicial + r.ingresos_ef - r.gastos_ef - r.retiros_ef);
end $$;

create function caja_app.caja_json(p_caja uuid, p_detalle boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'local_id', c.local_id, 'local', l.nombre, 'dia', c.dia, 'estado', c.estado, 'modo_carga', c.modo_carga,
    'caja_inicial', c.caja_inicial, 'caja_inicial_sugerida', c.caja_inicial_sugerida, 'inicial_coincide', c.inicial_coincide,
    'abierta_at', c.abierta_at, 'abierta_por', caja_app.nombre(c.abierta_por),
    'totales', case when c.estado = 'cerrada' and c.totales is not null then c.totales else caja_app.calcular(c.id) end,
    'venta_total_sistema', c.venta_total_sistema, 'otros_medios', c.otros_medios, 'verificados', c.verificados,
    'arqueo', c.arqueo, 'diferencia', c.diferencia, 'arqueo_tardio', c.arqueo_tardio,
    'arqueo_por', caja_app.nombre(c.arqueo_por), 'arqueo_at', c.arqueo_at,
    'retiro_cierre', c.retiro_cierre, 'retiro_destino', c.retiro_destino, 'queda_para_manana', c.queda_para_manana,
    'observacion', c.observacion, 'cerrada_at', c.cerrada_at, 'cerrada_por', caja_app.nombre(c.cerrada_por),
    'tipo_cierre', c.tipo_cierre, 'limite', caja_app.limite(c.dia, co.hora_cierre),
    'fotos', (select count(*) from caja_app.fotos f where f.caja_id = c.id)
  ) || case when not p_detalle then '{}'::jsonb else jsonb_build_object(
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'medio', m.medio, 'monto', m.monto, 'categoria', m.categoria, 'detalle', m.detalle,
        'registrado_at', m.registrado_at, 'registrado_por', caja_app.nombre(m.registrado_por),
        'anulado', m.anulado_at is not null, 'anulado_at', m.anulado_at, 'anulado_por', caja_app.nombre(m.anulado_por),
        'motivo_anulacion', m.motivo_anulacion, 'comentario_anulacion', m.comentario_anulacion, 'corrige', m.corrige
      ) order by m.registrado_at desc, m.id) from caja_app.movimientos m where m.caja_id = c.id), '[]'::jsonb),
    'fotos_detalle', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'pedido', f.pedido, 'path', f.path,
        'subida_at', f.subida_at, 'subida_por', caja_app.nombre(f.subida_por)) order by f.subida_at)
      from caja_app.fotos f where f.caja_id = c.id), '[]'::jsonb)) end
  from caja_app.cajas c
  join caja_app.locales l on l.id = c.local_id
  join caja_app.comercios co on co.id = c.comercio_id
  where c.id = p_caja
$$;

-- Caja inicial sugerida: lo que quedó al último cierre del local, o la caja inicial habitual.
create function caja_app.sugerida(p_local uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when co.inicial_desde_cierre and u.queda_para_manana is not null
      then jsonb_build_object('monto', u.queda_para_manana, 'origen', 'cierre', 'dia', u.dia)
    else jsonb_build_object('monto', co.caja_inicial_habitual, 'origen', 'habitual', 'dia', null) end
  from caja_app.locales l
  join caja_app.comercios co on co.id = l.comercio_id
  left join lateral (select c.queda_para_manana, c.dia from caja_app.cajas c
    where c.local_id = l.id and c.estado = 'cerrada' order by c.dia desc limit 1) u on true
  where l.id = p_local
$$;

-- Cierre (manual o automático). Bloquea la caja; si ya estaba cerrada, no hace nada.
create function caja_app.cerrar_interno(
  p_caja uuid, p_tipo text, p_persona uuid, p_arqueo numeric, p_venta_total numeric, p_otros jsonb,
  p_verificados jsonb, p_retiro numeric, p_destino text, p_observacion text)
returns caja_app.cajas language plpgsql security definer set search_path = '' as $$
declare c caja_app.cajas; co caja_app.comercios; t jsonb; v_saldo numeric(14,2);
begin
  select * into c from caja_app.cajas where id = p_caja for update;
  if c.id is null then raise exception 'Caja inexistente' using errcode = '22023'; end if;
  if c.estado = 'cerrada' then return c; end if;
  select * into co from caja_app.comercios where id = c.comercio_id;
  t := caja_app.calcular(c.id, p_venta_total, p_otros);
  v_saldo := (t->>'saldo_teorico')::numeric;
  update caja_app.cajas set
    estado = 'cerrada',
    tipo_cierre = p_tipo,
    cerrada_at = case when p_tipo = 'automatico' then caja_app.limite(c.dia, co.hora_cierre) else clock_timestamp() end,
    cerrada_por = case when p_tipo = 'manual' then p_persona end,
    venta_total_sistema = case when c.modo_carga = 'totales' then p_venta_total end,
    otros_medios = case when c.modo_carga = 'totales' then p_otros else t->'por_medio' end,
    verificados = p_verificados,
    totales = t,
    total_cobrado = (t->>'total_cobrado')::numeric,
    saldo_teorico = v_saldo,
    arqueo = p_arqueo,
    diferencia = case when p_arqueo is null or v_saldo is null then null else p_arqueo - v_saldo end,
    arqueo_por = case when p_arqueo is not null then p_persona end,
    arqueo_at = case when p_arqueo is not null then clock_timestamp() end,
    retiro_cierre = case when p_arqueo is not null then coalesce(p_retiro, 0) end,
    retiro_destino = nullif(btrim(coalesce(p_destino, '')), ''),
    queda_para_manana = case when p_arqueo is not null then p_arqueo - coalesce(p_retiro, 0) end,
    observacion = nullif(btrim(coalesce(p_observacion, '')), '')
  where id = c.id returning * into c;
  perform caja_app.auditar(c.comercio_id, c.id, case when p_tipo = 'manual' then 'cierre_manual' else 'cierre_automatico' end,
    p_persona, jsonb_build_object('saldo', c.saldo_teorico, 'arqueo', c.arqueo, 'diferencia', c.diferencia,
      'retiro', c.retiro_cierre, 'queda', c.queda_para_manana, 'ejecutado_at', now()));
  return c;
end $$;

-- Cierre automático: toda caja abierta cuyo horario de cierre ya pasó. Idempotente.
create function caja_app.cerrar_vencidos(p_comercio uuid default null, p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; c caja_app.cajas;
begin
  for r in
    select x.id from caja_app.cajas x join caja_app.comercios co on co.id = x.comercio_id
    where x.estado = 'abierta' and (p_comercio is null or x.comercio_id = p_comercio)
      and caja_app.limite(x.dia, co.hora_cierre) <= p_ahora
    order by x.dia, x.id for update of x
  loop
    c := caja_app.cerrar_interno(r.id, 'automatico', null, null, null, null, null, null, null, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============================== Inmutabilidad ==============================

create function caja_app.proteger_caja() returns trigger
language plpgsql set search_path = '' as $$
declare libres text[] := array['arqueo','diferencia','arqueo_tardio','arqueo_por','arqueo_at','queda_para_manana',
  'retiro_cierre','retiro_destino','saldo_teorico','totales','total_cobrado','venta_total_sistema','otros_medios','observacion'];
begin
  if tg_op = 'DELETE' then raise exception 'Las cajas no se eliminan' using errcode = '42501'; end if;
  if (new.id, new.comercio_id, new.local_id, new.dia, new.abierta_at, new.abierta_por, new.abierta_por_user, new.caja_inicial, new.modo_carga)
     is distinct from (old.id, old.comercio_id, old.local_id, old.dia, old.abierta_at, old.abierta_por, old.abierta_por_user, old.caja_inicial, old.modo_carga) then
    raise exception 'Los datos de apertura no se modifican' using errcode = '42501';
  end if;
  if old.estado = 'cerrada' then
    -- Única excepción: completar una sola vez el arqueo de una caja que se cerró sola.
    if old.tipo_cierre = 'automatico' and old.arqueo is null and new.arqueo is not null and new.arqueo_tardio
       and (to_jsonb(new) - libres) = (to_jsonb(old) - libres) then
      return new;
    end if;
    raise exception 'El cierre de caja es definitivo y no se modifica' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger caja_app_proteger_caja before update or delete on caja_app.cajas
  for each row execute function caja_app.proteger_caja();

create function caja_app.proteger_movimiento() returns trigger
language plpgsql set search_path = '' as $$
declare v_estado text;
begin
  if tg_op = 'DELETE' then raise exception 'Los movimientos no se borran: se anulan' using errcode = '42501'; end if;
  select estado into v_estado from caja_app.cajas where id = new.caja_id;
  if v_estado is distinct from 'abierta' then raise exception 'La caja de ese día está cerrada' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and (old.anulado_at is not null or new.anulado_at is null
     or (to_jsonb(new) - array['anulado_at','anulado_por','motivo_anulacion','comentario_anulacion'])
        <> (to_jsonb(old) - array['anulado_at','anulado_por','motivo_anulacion','comentario_anulacion'])) then
    raise exception 'Un movimiento solo se puede anular una vez' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger caja_app_proteger_movimiento before insert or update or delete on caja_app.movimientos
  for each row execute function caja_app.proteger_movimiento();

create function caja_app.proteger_foto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Las fotos de caja no se modifican ni se borran' using errcode = '42501'; end if;
  if (select estado from caja_app.cajas where id = new.caja_id) is distinct from 'abierta' then
    raise exception 'La caja de ese día está cerrada' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger caja_app_proteger_foto before insert or update or delete on caja_app.fotos
  for each row execute function caja_app.proteger_foto();

create function caja_app.solo_agregar() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Registro inmutable de la caja' using errcode = '42501'; end $$;
create trigger caja_app_auditoria_inmutable before update or delete on caja_app.auditoria
  for each row execute function caja_app.solo_agregar();
create trigger caja_app_cajas_sin_truncate before truncate on caja_app.cajas for each statement execute function caja_app.solo_agregar();
create trigger caja_app_mov_sin_truncate before truncate on caja_app.movimientos for each statement execute function caja_app.solo_agregar();
create trigger caja_app_aud_sin_truncate before truncate on caja_app.auditoria for each statement execute function caja_app.solo_agregar();

-- ============================== RLS (segunda barrera) ==============================

create function caja_app.mis_comercios() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.comercio_id from caja_app.miembros m join caja_app.comercios c on c.id = m.comercio_id
  where m.user_id = auth.uid() and c.estado = 'activo'
$$;
alter table caja_app.comercios enable row level security;
alter table caja_app.locales enable row level security;
alter table caja_app.miembros enable row level security;
alter table caja_app.personas enable row level security;
alter table caja_app.sesiones enable row level security;
alter table caja_app.cajas enable row level security;
alter table caja_app.movimientos enable row level security;
alter table caja_app.fotos enable row level security;
alter table caja_app.auditoria enable row level security;
create policy caja_app_comercios_propios on caja_app.comercios for select to authenticated using (id in (select caja_app.mis_comercios()));
create policy caja_app_locales_propios on caja_app.locales for select to authenticated using (comercio_id in (select caja_app.mis_comercios()));
create policy caja_app_miembros_propios on caja_app.miembros for select to authenticated using (comercio_id in (select caja_app.mis_comercios()));
create policy caja_app_cajas_propias on caja_app.cajas for select to authenticated using (comercio_id in (select caja_app.mis_comercios()));
create policy caja_app_mov_propios on caja_app.movimientos for select to authenticated using (comercio_id in (select caja_app.mis_comercios()));
create policy caja_app_fotos_propias on caja_app.fotos for select to authenticated using (comercio_id in (select caja_app.mis_comercios()));
create policy caja_app_aud_propia on caja_app.auditoria for select to authenticated using (comercio_id in (select caja_app.mis_comercios()));
-- personas (hash del PIN) y sesiones: sin política, nunca legibles fuera de las RPC.

-- ============================== RPC del dueño ==============================

-- Alta de comercio: quien la hace queda como dueño, con su primer local y su PIN.
create function public.caja_app_crear_comercio(p_nombre text, p_local text, p_mi_nombre text, p_mi_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_c uuid; v_l uuid; v_p uuid;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión' using errcode = '42501'; end if;
  if not caja_app.texto_ok(p_nombre, 2, 80) or not caja_app.texto_ok(p_local, 2, 60) or not caja_app.texto_ok(p_mi_nombre, 2, 60) then
    raise exception 'Revisá el nombre del comercio, del local y el tuyo' using errcode = '22023';
  end if;
  if coalesce(p_mi_pin, '') !~ '^[0-9]{4}$' then raise exception 'El PIN tiene que tener 4 números' using errcode = '22023'; end if;
  if (select count(*) from caja_app.miembros where user_id = auth.uid() and rol = 'dueno') >= 3 then
    raise exception 'Llegaste al máximo de comercios por cuenta' using errcode = '22023';
  end if;
  insert into caja_app.comercios (nombre, creado_por) values (p_nombre, auth.uid()) returning id into v_c;
  insert into caja_app.locales (comercio_id, nombre) values (v_c, p_local) returning id into v_l;
  insert into caja_app.miembros (comercio_id, user_id, rol) values (v_c, auth.uid(), 'dueno');
  insert into caja_app.personas (comercio_id, nombre, rol, pin_hash)
  values (v_c, p_mi_nombre, 'dueno', extensions.crypt(p_mi_pin, extensions.gen_salt('bf', 8))) returning id into v_p;
  perform caja_app.auditar(v_c, null, 'comercio_creado', v_p, jsonb_build_object('nombre', p_nombre));
  return jsonb_build_object('comercio_id', v_c, 'local_id', v_l, 'persona_id', v_p);
end $$;

create function public.caja_app_mis_comercios() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'rol', m.rol,
    'locales', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre) order by l.nombre)
      from caja_app.locales l where l.comercio_id = c.id and l.activo), '[]'::jsonb)) order by c.nombre), '[]'::jsonb)
  from caja_app.miembros m join caja_app.comercios c on c.id = m.comercio_id
  where m.user_id = auth.uid() and c.estado = 'activo'
$$;

create function public.caja_app_config(p_comercio uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare co caja_app.comercios;
begin
  if caja_app.rol(p_comercio) is null then raise exception 'Sin acceso a este comercio' using errcode = '42501'; end if;
  select * into co from caja_app.comercios where id = p_comercio;
  return jsonb_build_object('id', co.id, 'nombre', co.nombre, 'medios', to_jsonb(co.medios), 'modo_carga', co.modo_carga,
    'hora_cierre', to_char(co.hora_cierre, 'HH24:MI'), 'caja_inicial_habitual', co.caja_inicial_habitual,
    'inicial_desde_cierre', co.inicial_desde_cierre, 'fotos', co.fotos, 'bloquear_sin_fotos', co.bloquear_sin_fotos,
    'categorias_gasto', to_jsonb(co.categorias_gasto), 'tipos_retiro', to_jsonb(co.tipos_retiro),
    'categorias_ingreso', to_jsonb(co.categorias_ingreso),
    'locales', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre, 'activo', l.activo) order by l.nombre)
      from caja_app.locales l where l.comercio_id = co.id), '[]'::jsonb),
    'personas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'locales', to_jsonb(p.locales),
        'activo', p.activo, 'gasto_maximo', p.gasto_maximo) order by p.nombre)
      from caja_app.personas p where p.comercio_id = co.id), '[]'::jsonb));
end $$;

create function public.caja_app_guardar_config(p_comercio uuid, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  co caja_app.comercios;
  v_medios text[]; v_gasto text[]; v_retiro text[]; v_ingreso text[]; f jsonb;
begin
  perform caja_app.exigir_dueno(p_comercio);
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'Configuración inválida' using errcode = '22023'; end if;
  select * into co from caja_app.comercios where id = p_comercio for update;
  if p_config ? 'nombre' then co.nombre := p_config->>'nombre'; end if;
  if p_config ? 'medios' then select array_agg(x) into v_medios from jsonb_array_elements_text(p_config->'medios') x; co.medios := v_medios; end if;
  if p_config ? 'modo_carga' then co.modo_carga := p_config->>'modo_carga'; end if;
  if p_config ? 'hora_cierre' then
    if coalesce(p_config->>'hora_cierre', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hora de cierre inválida' using errcode = '22023'; end if;
    co.hora_cierre := (p_config->>'hora_cierre')::time;
  end if;
  if p_config ? 'caja_inicial_habitual' then co.caja_inicial_habitual := (p_config->>'caja_inicial_habitual')::numeric; end if;
  if p_config ? 'inicial_desde_cierre' then co.inicial_desde_cierre := (p_config->>'inicial_desde_cierre')::boolean; end if;
  if p_config ? 'bloquear_sin_fotos' then co.bloquear_sin_fotos := (p_config->>'bloquear_sin_fotos')::boolean; end if;
  if p_config ? 'fotos' then
    if jsonb_typeof(p_config->'fotos') <> 'array' or jsonb_array_length(p_config->'fotos') > 8 then raise exception 'Fotos inválidas' using errcode = '22023'; end if;
    for f in select * from jsonb_array_elements(p_config->'fotos') loop
      if coalesce(f->>'id', '') !~ '^[a-z0-9_-]{1,40}$' or not caja_app.texto_ok(f->>'nombre', 2, 60)
         or jsonb_typeof(f->'obligatoria') is distinct from 'boolean' then
        raise exception 'Cada foto necesita id, nombre y si es obligatoria' using errcode = '22023';
      end if;
    end loop;
    if (select count(distinct x->>'id') from jsonb_array_elements(p_config->'fotos') x) <> jsonb_array_length(p_config->'fotos') then
      raise exception 'Hay fotos repetidas' using errcode = '22023';
    end if;
    co.fotos := (select coalesce(jsonb_agg(jsonb_build_object('id', x->>'id', 'nombre', x->>'nombre', 'obligatoria', (x->>'obligatoria')::boolean)), '[]'::jsonb)
      from jsonb_array_elements(p_config->'fotos') x);
  end if;
  if p_config ? 'categorias_gasto' then select array_agg(x) into v_gasto from jsonb_array_elements_text(p_config->'categorias_gasto') x; co.categorias_gasto := v_gasto; end if;
  if p_config ? 'tipos_retiro' then select array_agg(x) into v_retiro from jsonb_array_elements_text(p_config->'tipos_retiro') x; co.tipos_retiro := v_retiro; end if;
  if p_config ? 'categorias_ingreso' then select array_agg(x) into v_ingreso from jsonb_array_elements_text(p_config->'categorias_ingreso') x; co.categorias_ingreso := v_ingreso; end if;
  if not caja_app.texto_ok(co.nombre, 2, 80) or not caja_app.lista_ok(co.medios, 15) or not ('Efectivo' = any(co.medios))
     or co.modo_carga not in ('cobro','totales') or co.caja_inicial_habitual is null or co.caja_inicial_habitual < 0
     or co.inicial_desde_cierre is null or co.bloquear_sin_fotos is null
     or not caja_app.lista_ok(co.categorias_gasto, 20) or not caja_app.lista_ok(co.tipos_retiro, 20) or not caja_app.lista_ok(co.categorias_ingreso, 20) then
    raise exception 'Revisá la configuración: nombres de 2 a 40 letras, sin repetir, y «Efectivo» siempre activo' using errcode = '22023';
  end if;
  update caja_app.comercios set nombre = co.nombre, medios = co.medios, modo_carga = co.modo_carga, hora_cierre = co.hora_cierre,
    caja_inicial_habitual = co.caja_inicial_habitual, inicial_desde_cierre = co.inicial_desde_cierre, fotos = co.fotos,
    bloquear_sin_fotos = co.bloquear_sin_fotos, categorias_gasto = co.categorias_gasto, tipos_retiro = co.tipos_retiro,
    categorias_ingreso = co.categorias_ingreso
  where id = p_comercio;
  perform caja_app.auditar(p_comercio, null, 'config', null, p_config);
  return public.caja_app_config(p_comercio);
end $$;

create function public.caja_app_guardar_local(p_comercio uuid, p_id uuid, p_nombre text, p_activo boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform caja_app.exigir_dueno(p_comercio);
  if not caja_app.texto_ok(p_nombre, 2, 60) then raise exception 'Nombre de local inválido' using errcode = '22023'; end if;
  if p_id is null then
    if (select count(*) from caja_app.locales where comercio_id = p_comercio) >= 20 then raise exception 'Máximo 20 locales' using errcode = '22023'; end if;
    insert into caja_app.locales (comercio_id, nombre, activo) values (p_comercio, p_nombre, coalesce(p_activo, true)) returning id into v;
  else
    update caja_app.locales set nombre = p_nombre, activo = coalesce(p_activo, activo)
    where id = p_id and comercio_id = p_comercio returning id into v;
    if v is null then raise exception 'Local inexistente' using errcode = '22023'; end if;
  end if;
  perform caja_app.auditar(p_comercio, null, 'local', null, jsonb_build_object('id', v, 'nombre', p_nombre, 'activo', p_activo));
  return public.caja_app_config(p_comercio);
end $$;

create function public.caja_app_guardar_persona(p_comercio uuid, p_id uuid, p_nombre text, p_rol text, p_locales uuid[],
  p_pin text, p_activo boolean, p_gasto_maximo numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid; v_locales uuid[] := coalesce(p_locales, '{}');
begin
  perform caja_app.exigir_dueno(p_comercio);
  if not caja_app.texto_ok(p_nombre, 2, 60) or p_rol not in ('dueno','encargado','cajero')
     or (p_gasto_maximo is not null and p_gasto_maximo < 0) then
    raise exception 'Revisá nombre, rol y límite de gasto' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_locales) x where x not in (select id from caja_app.locales where comercio_id = p_comercio)) then
    raise exception 'Hay locales que no son de tu comercio' using errcode = '42501';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'El PIN tiene que tener 4 números' using errcode = '22023'; end if;
  if p_id is null then
    if p_pin is null then raise exception 'Asigná un PIN de 4 números' using errcode = '22023'; end if;
    if (select count(*) from caja_app.personas where comercio_id = p_comercio) >= 60 then raise exception 'Máximo 60 personas' using errcode = '22023'; end if;
    insert into caja_app.personas (comercio_id, nombre, rol, locales, pin_hash, activo, gasto_maximo)
    values (p_comercio, p_nombre, p_rol, v_locales, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), coalesce(p_activo, true), p_gasto_maximo)
    returning id into v;
  else
    update caja_app.personas set nombre = p_nombre, rol = p_rol, locales = v_locales, activo = coalesce(p_activo, activo),
      gasto_maximo = p_gasto_maximo,
      pin_hash = case when p_pin is null then pin_hash else extensions.crypt(p_pin, extensions.gen_salt('bf', 8)) end,
      intentos_fallidos = case when p_pin is null then intentos_fallidos else 0 end,
      bloqueado_hasta = case when p_pin is null then bloqueado_hasta end
    where id = p_id and comercio_id = p_comercio returning id into v;
    if v is null then raise exception 'Persona inexistente' using errcode = '22023'; end if;
    if p_activo is false or p_pin is not null then delete from caja_app.sesiones where persona_id = v; end if;
  end if;
  perform caja_app.auditar(p_comercio, null, 'persona', null,
    jsonb_build_object('id', v, 'nombre', p_nombre, 'rol', p_rol, 'activo', p_activo, 'pin_cambiado', p_pin is not null));
  return public.caja_app_config(p_comercio);
end $$;

-- Hoy: estado de cada local, pendientes y últimos movimientos de todos los locales.
create function public.caja_app_hoy(p_comercio uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_hoy date;
begin
  perform caja_app.exigir_dueno(p_comercio);
  perform caja_app.cerrar_vencidos(p_comercio);
  v_hoy := caja_app.dia_ar();
  return jsonb_build_object('hoy', v_hoy, 'ahora', now(),
    'locales', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nombre', l.nombre,
        'caja', (select caja_app.caja_json(c.id, false) from caja_app.cajas c where c.local_id = l.id and c.dia = v_hoy))
      order by l.nombre) from caja_app.locales l where l.comercio_id = p_comercio and l.activo), '[]'::jsonb),
    'pendientes', coalesce((select jsonb_agg(jsonb_build_object('caja_id', c.id, 'local', l.nombre, 'dia', c.dia,
        'motivo', 'cierre_automatico_sin_arqueo') order by c.dia desc)
      from caja_app.cajas c join caja_app.locales l on l.id = c.local_id
      where c.comercio_id = p_comercio and c.estado = 'cerrada' and c.tipo_cierre = 'automatico' and c.arqueo is null), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(x order by x->>'registrado_at' desc) from (
        select jsonb_build_object('id', m.id, 'local', l.nombre, 'tipo', m.tipo, 'medio', m.medio, 'monto', m.monto,
          'categoria', m.categoria, 'detalle', m.detalle, 'registrado_at', m.registrado_at,
          'registrado_por', caja_app.nombre(m.registrado_por), 'anulado', m.anulado_at is not null,
          'motivo_anulacion', m.motivo_anulacion) as x
        from caja_app.movimientos m join caja_app.cajas c on c.id = m.caja_id join caja_app.locales l on l.id = c.local_id
        where m.comercio_id = p_comercio and c.dia = v_hoy order by m.registrado_at desc limit 30) z), '[]'::jsonb));
end $$;

create function public.caja_app_historial(p_comercio uuid, p_local uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform caja_app.exigir_dueno(p_comercio);
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'Elegí un período de hasta 400 días' using errcode = '22023';
  end if;
  perform caja_app.cerrar_vencidos(p_comercio);
  return coalesce((select jsonb_agg(caja_app.caja_json(c.id, false) order by c.dia desc, c.local_id)
    from caja_app.cajas c
    where c.comercio_id = p_comercio and c.estado = 'cerrada' and c.dia between p_desde and p_hasta
      and (p_local is null or c.local_id = p_local)), '[]'::jsonb);
end $$;

create function public.caja_app_detalle(p_comercio uuid, p_caja uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform caja_app.exigir_dueno(p_comercio);
  if not exists (select 1 from caja_app.cajas where id = p_caja and comercio_id = p_comercio) then
    raise exception 'La caja no es de tu comercio' using errcode = '42501';
  end if;
  return caja_app.caja_json(p_caja, true);
end $$;

-- Arqueo tardío: el dueño carga el conteo de una caja que se cerró sola.
create function public.caja_app_completar_arqueo(p_comercio uuid, p_caja uuid, p_arqueo numeric, p_venta_total numeric,
  p_otros jsonb, p_queda numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c caja_app.cajas; t jsonb; v_saldo numeric(14,2); v_persona uuid;
begin
  perform caja_app.exigir_dueno(p_comercio);
  select * into c from caja_app.cajas where id = p_caja and comercio_id = p_comercio for update;
  if c.id is null then raise exception 'La caja no es de tu comercio' using errcode = '42501'; end if;
  if c.estado <> 'cerrada' or c.tipo_cierre <> 'automatico' or c.arqueo is not null then
    raise exception 'Solo se completa el arqueo de una caja que se cerró sola y no tiene conteo' using errcode = '22023';
  end if;
  if p_arqueo is null or p_arqueo < 0 or p_arqueo <> round(p_arqueo, 2) or p_queda is null or p_queda < 0 or p_queda > p_arqueo then
    raise exception 'Revisá el efectivo contado y lo que queda en la caja' using errcode = '22023';
  end if;
  if c.modo_carga = 'totales' then
    perform caja_app.validar_totales(c.comercio_id, p_venta_total, p_otros);
  end if;
  select id into v_persona from caja_app.personas
   where comercio_id = p_comercio and rol = 'dueno' and activo order by creado_at limit 1;
  t := caja_app.calcular(c.id, p_venta_total, p_otros);
  v_saldo := (t->>'saldo_teorico')::numeric;
  update caja_app.cajas set arqueo = p_arqueo, diferencia = p_arqueo - v_saldo, arqueo_tardio = true,
    arqueo_por = v_persona, arqueo_at = clock_timestamp(), queda_para_manana = p_queda, retiro_cierre = p_arqueo - p_queda,
    saldo_teorico = v_saldo, totales = t, total_cobrado = (t->>'total_cobrado')::numeric,
    venta_total_sistema = case when c.modo_carga = 'totales' then p_venta_total else venta_total_sistema end,
    otros_medios = case when c.modo_carga = 'totales' then p_otros else otros_medios end
  where id = c.id returning * into c;
  perform caja_app.auditar(c.comercio_id, c.id, 'arqueo_tardio', v_persona,
    jsonb_build_object('arqueo', p_arqueo, 'diferencia', c.diferencia, 'queda', p_queda));
  return caja_app.caja_json(c.id, true);
end $$;

-- ============================== RPC del celular de caja ==============================

create function caja_app.validar_totales(p_comercio uuid, p_venta_total numeric, p_otros jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_medios text[]; v_suma numeric := 0; k text; v text;
begin
  select medios into v_medios from caja_app.comercios where id = p_comercio;
  if p_venta_total is null or p_venta_total < 0 or p_venta_total <> round(p_venta_total, 2) or p_venta_total >= 10000000000 then
    raise exception 'Cargá la venta total del sistema' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_otros, '{}'::jsonb)) <> 'object' then raise exception 'Otros medios inválidos' using errcode = '22023'; end if;
  for k, v in select key, value from jsonb_each_text(coalesce(p_otros, '{}'::jsonb)) loop
    if k = 'Efectivo' or not (k = any(v_medios)) or v !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      raise exception 'Revisá los importes de otros medios (%).', k using errcode = '22023';
    end if;
    v_suma := v_suma + v::numeric;
  end loop;
  if v_suma > p_venta_total then
    raise exception 'Los otros medios suman más que la venta total del sistema' using errcode = '22023';
  end if;
end $$;

create function public.caja_app_personas_local(p_local uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_c uuid;
begin
  select comercio_id into v_c from caja_app.locales where id = p_local and activo;
  if v_c is null or caja_app.rol(v_c) is null then raise exception 'Sin acceso a este local' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol) order by p.nombre)
    from caja_app.personas p
    where p.comercio_id = v_c and p.activo and (cardinality(p.locales) = 0 or p_local = any(p.locales))), '[]'::jsonb);
end $$;

-- PIN: 5 intentos fallidos bloquean a esa persona 10 minutos.
create function public.caja_app_entrar(p_local uuid, p_persona uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_c uuid; p caja_app.personas; v_token text;
begin
  select comercio_id into v_c from caja_app.locales where id = p_local and activo;
  if v_c is null or caja_app.rol(v_c) is null then raise exception 'Sin acceso a este local' using errcode = '42501'; end if;
  select * into p from caja_app.personas where id = p_persona and comercio_id = v_c and activo
    and (cardinality(locales) = 0 or p_local = any(locales)) for update;
  if p.id is null then raise exception 'Esa persona no trabaja en este local' using errcode = '42501'; end if;
  if p.bloqueado_hasta is not null and p.bloqueado_hasta > now() then
    raise exception 'Demasiados intentos. Probá de nuevo en unos minutos.' using errcode = '42501';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' or extensions.crypt(p_pin, p.pin_hash) <> p.pin_hash then
    update caja_app.personas set
      intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
      bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '10 minutes' else bloqueado_hasta end
    where id = p.id;
    perform caja_app.auditar(v_c, null, 'pin_incorrecto', p.id, '{}'::jsonb);
    return jsonb_build_object('ok', false, 'mensaje', 'PIN incorrecto');
  end if;
  update caja_app.personas set intentos_fallidos = 0, bloqueado_hasta = null where id = p.id;
  delete from caja_app.sesiones where persona_id = p.id and (expira_at < now() or user_id = auth.uid());
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into caja_app.sesiones (token_hash, persona_id, comercio_id, local_id, user_id, expira_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p.id, v_c, p_local, auth.uid(), now() + interval '14 hours');
  return jsonb_build_object('ok', true, 'token', v_token,
    'persona', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'gasto_maximo', p.gasto_maximo));
end $$;

create function public.caja_app_salir(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from caja_app.sesiones
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and user_id = auth.uid()
$$;

create function public.caja_app_estado(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s caja_app.sesiones; co caja_app.comercios; v_hoy date; v_caja uuid;
begin
  s := caja_app.operador(p_token);
  perform caja_app.cerrar_vencidos(s.comercio_id);
  select * into co from caja_app.comercios where id = s.comercio_id;
  v_hoy := caja_app.dia_ar();
  select id into v_caja from caja_app.cajas where local_id = s.local_id and dia = v_hoy;
  return jsonb_build_object(
    'hoy', v_hoy, 'ahora', now(), 'limite', caja_app.limite(v_hoy, co.hora_cierre),
    'comercio', jsonb_build_object('id', co.id, 'nombre', co.nombre),
    'local', (select jsonb_build_object('id', l.id, 'nombre', l.nombre) from caja_app.locales l where l.id = s.local_id),
    'persona', (select jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'gasto_maximo', p.gasto_maximo)
      from caja_app.personas p where p.id = s.persona_id),
    'config', jsonb_build_object('medios', to_jsonb(co.medios), 'modo_carga', co.modo_carga, 'fotos', co.fotos,
      'bloquear_sin_fotos', co.bloquear_sin_fotos, 'categorias_gasto', to_jsonb(co.categorias_gasto),
      'tipos_retiro', to_jsonb(co.tipos_retiro), 'categorias_ingreso', to_jsonb(co.categorias_ingreso),
      'hora_cierre', to_char(co.hora_cierre, 'HH24:MI')),
    'sugerida', caja_app.sugerida(s.local_id),
    'puede_abrir', v_caja is null and now() < caja_app.limite(v_hoy, co.hora_cierre),
    'caja', case when v_caja is null then null else caja_app.caja_json(v_caja, true) end);
end $$;

create function public.caja_app_abrir(p_token text, p_caja_inicial numeric, p_coincide boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s caja_app.sesiones; co caja_app.comercios; v_hoy date; v_sug jsonb; c caja_app.cajas;
begin
  s := caja_app.operador(p_token);
  if p_caja_inicial is null or p_caja_inicial < 0 or p_caja_inicial <> round(p_caja_inicial, 2) or p_caja_inicial >= 10000000000
     or p_coincide is null then
    raise exception 'Revisá la caja inicial' using errcode = '22023';
  end if;
  perform caja_app.cerrar_vencidos(s.comercio_id);
  select * into co from caja_app.comercios where id = s.comercio_id;
  v_hoy := caja_app.dia_ar();
  if now() >= caja_app.limite(v_hoy, co.hora_cierre) then
    raise exception 'La caja de hoy ya cerró. Podés abrir la de mañana desde las 00:00.' using errcode = '22023';
  end if;
  v_sug := caja_app.sugerida(s.local_id);
  insert into caja_app.cajas (comercio_id, local_id, dia, modo_carga, caja_inicial, caja_inicial_sugerida, inicial_coincide,
    abierta_por, abierta_por_user)
  values (s.comercio_id, s.local_id, v_hoy, co.modo_carga, p_caja_inicial, (v_sug->>'monto')::numeric,
    p_coincide and p_caja_inicial = (v_sug->>'monto')::numeric, s.persona_id, auth.uid())
  on conflict on constraint caja_app_una_caja_por_dia do nothing
  returning * into c;
  if c.id is not null then
    perform caja_app.auditar(s.comercio_id, c.id, 'apertura', s.persona_id,
      jsonb_build_object('caja_inicial', p_caja_inicial, 'sugerida', v_sug->'monto', 'coincide', c.inicial_coincide));
    return jsonb_build_object('nueva', true, 'caja', caja_app.caja_json(c.id, true));
  end if;
  select * into c from caja_app.cajas where local_id = s.local_id and dia = v_hoy;
  return jsonb_build_object('nueva', false, 'caja', caja_app.caja_json(c.id, true));
end $$;

-- Lock + controles comunes de las operaciones sobre una caja abierta del día.
create function caja_app.caja_operable(s caja_app.sesiones, p_caja uuid) returns caja_app.cajas
language plpgsql security definer set search_path = '' as $$
declare c caja_app.cajas; co caja_app.comercios;
begin
  perform caja_app.cerrar_vencidos(s.comercio_id);
  select * into c from caja_app.cajas where id = p_caja and comercio_id = s.comercio_id and local_id = s.local_id for update;
  if c.id is null then raise exception 'La caja no corresponde a tu local' using errcode = '42501'; end if;
  return c;
end $$;

create function caja_app.registrar_interno(p_token text, p_caja uuid, p_operacion uuid, p_tipo text, p_medio text,
  p_monto numeric, p_categoria text, p_detalle text, p_corrige uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s caja_app.sesiones; c caja_app.cajas; co caja_app.comercios; p caja_app.personas; m caja_app.movimientos;
  v_detalle text := btrim(coalesce(p_detalle, ''));
  v_cat text := nullif(btrim(coalesce(p_categoria, '')), '');
begin
  s := caja_app.operador(p_token);
  if p_operacion is null or p_tipo not in ('cobro','gasto','ingreso','retiro') or p_monto is null or p_monto <= 0
     or p_monto >= 10000000000 or p_monto <> round(p_monto, 2) or char_length(v_detalle) > 120 then
    raise exception 'Revisá el tipo y el importe (mayor a 0, hasta 2 decimales)' using errcode = '22023';
  end if;
  c := caja_app.caja_operable(s, p_caja);
  select * into m from caja_app.movimientos where caja_id = c.id and operacion = p_operacion;
  if m.id is not null then
    return jsonb_build_object('repetida', true, 'movimiento_id', m.id, 'caja', caja_app.caja_json(c.id, true));
  end if;
  if c.estado <> 'abierta' then raise exception 'La caja de ese día ya está cerrada' using errcode = '22023'; end if;
  select * into co from caja_app.comercios where id = c.comercio_id;
  if c.dia <> caja_app.dia_ar(clock_timestamp()) or clock_timestamp() >= caja_app.limite(c.dia, co.hora_cierre) then
    raise exception 'Ya pasó el horario de cierre de esa caja' using errcode = '22023';
  end if;
  if p_medio is null or not (p_medio = any(co.medios)) then raise exception 'Medio de pago no habilitado' using errcode = '22023'; end if;
  if p_tipo = 'cobro' then
    if c.modo_carga = 'totales' then
      raise exception 'Este comercio carga las ventas con los totales al cierre' using errcode = '22023';
    end if;
    v_cat := null;
  elsif p_tipo = 'gasto' and (v_cat is null or not (v_cat = any(co.categorias_gasto))) then
    raise exception 'Elegí una categoría de gasto' using errcode = '22023';
  elsif p_tipo = 'retiro' and (v_cat is null or not (v_cat = any(co.tipos_retiro))) then
    raise exception 'Elegí el tipo de retiro' using errcode = '22023';
  elsif p_tipo = 'ingreso' and (v_cat is null or not (v_cat = any(co.categorias_ingreso))) then
    raise exception 'Elegí el tipo de ingreso' using errcode = '22023';
  end if;
  select * into p from caja_app.personas where id = s.persona_id;
  if p_tipo = 'gasto' and p.rol = 'cajero' and p.gasto_maximo is not null and p_monto > p.gasto_maximo then
    raise exception 'Ese gasto supera tu límite. Pedile al encargado que lo cargue.' using errcode = '42501';
  end if;
  insert into caja_app.movimientos (caja_id, comercio_id, operacion, tipo, medio, monto, categoria, detalle, registrado_por,
    registrado_por_user, corrige)
  values (c.id, c.comercio_id, p_operacion, p_tipo, p_medio, p_monto, v_cat, v_detalle, s.persona_id, auth.uid(), p_corrige)
  returning * into m;
  perform caja_app.auditar(c.comercio_id, c.id, p_tipo, s.persona_id,
    jsonb_build_object('movimiento', m.id, 'medio', p_medio, 'monto', p_monto, 'categoria', v_cat, 'corrige', p_corrige));
  return jsonb_build_object('repetida', false, 'movimiento_id', m.id, 'caja', caja_app.caja_json(c.id, true));
end $$;

create function public.caja_app_registrar(p_token text, p_caja uuid, p_operacion uuid, p_tipo text, p_medio text,
  p_monto numeric, p_categoria text, p_detalle text)
returns jsonb language sql security definer set search_path = '' as $$
  select caja_app.registrar_interno(p_token, p_caja, p_operacion, p_tipo, p_medio, p_monto, p_categoria, p_detalle, null)
$$;

create function public.caja_app_anular(p_token text, p_caja uuid, p_movimiento uuid, p_motivo text, p_comentario text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s caja_app.sesiones; c caja_app.cajas; m caja_app.movimientos;
begin
  s := caja_app.operador(p_token);
  if not caja_app.texto_ok(p_motivo, 2, 60) or char_length(coalesce(p_comentario, '')) > 200 then
    raise exception 'Elegí el motivo' using errcode = '22023';
  end if;
  c := caja_app.caja_operable(s, p_caja);
  select * into m from caja_app.movimientos where id = p_movimiento and caja_id = c.id;
  if m.id is null then raise exception 'El movimiento no es de esta caja' using errcode = '22023'; end if;
  if m.anulado_at is not null then return jsonb_build_object('repetida', true, 'caja', caja_app.caja_json(c.id, true)); end if;
  if c.estado <> 'abierta' then raise exception 'La caja de ese día ya está cerrada' using errcode = '22023'; end if;
  update caja_app.movimientos set anulado_at = clock_timestamp(), anulado_por = s.persona_id, motivo_anulacion = p_motivo,
    comentario_anulacion = nullif(btrim(coalesce(p_comentario, '')), '')
  where id = m.id;
  perform caja_app.auditar(c.comercio_id, c.id, 'anulacion', s.persona_id,
    jsonb_build_object('movimiento', m.id, 'monto', m.monto, 'motivo', p_motivo));
  return jsonb_build_object('repetida', false, 'caja', caja_app.caja_json(c.id, true));
end $$;

-- Corregir = anular el original con motivo y registrar el correcto (queda el vínculo).
create function public.caja_app_corregir(p_token text, p_caja uuid, p_movimiento uuid, p_operacion uuid, p_medio text,
  p_monto numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s caja_app.sesiones; c caja_app.cajas; m caja_app.movimientos; n caja_app.movimientos; r jsonb;
begin
  s := caja_app.operador(p_token);
  c := caja_app.caja_operable(s, p_caja);
  select * into n from caja_app.movimientos where caja_id = c.id and operacion = p_operacion;
  if n.id is not null then return jsonb_build_object('repetida', true, 'movimiento_id', n.id, 'caja', caja_app.caja_json(c.id, true)); end if;
  select * into m from caja_app.movimientos where id = p_movimiento and caja_id = c.id;
  if m.id is null or m.anulado_at is not null then raise exception 'Ese movimiento no se puede corregir' using errcode = '22023'; end if;
  if not caja_app.texto_ok(p_motivo, 2, 60) then raise exception 'Elegí el motivo' using errcode = '22023'; end if;
  r := caja_app.registrar_interno(p_token, c.id, p_operacion, m.tipo, p_medio, p_monto, m.categoria, m.detalle, m.id);
  perform public.caja_app_anular(p_token, c.id, m.id, p_motivo, 'Corregido');
  return jsonb_build_object('repetida', false, 'movimiento_id', r->>'movimiento_id', 'corrige', m.id,
    'caja', caja_app.caja_json(c.id, true));
end $$;

create function public.caja_app_registrar_foto(p_token text, p_caja uuid, p_pedido text, p_path text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s caja_app.sesiones; c caja_app.cajas; co caja_app.comercios; f caja_app.fotos;
begin
  s := caja_app.operador(p_token);
  c := caja_app.caja_operable(s, p_caja);
  if c.estado <> 'abierta' then raise exception 'La caja de ese día ya está cerrada' using errcode = '22023'; end if;
  select * into co from caja_app.comercios where id = c.comercio_id;
  if p_pedido <> 'otra' and not exists (select 1 from jsonb_array_elements(co.fotos) x where x->>'id' = p_pedido) then
    raise exception 'Esa foto no está pedida' using errcode = '22023';
  end if;
  if coalesce(p_path, '') !~ ('^' || c.comercio_id || '/' || c.id || '/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp)$') then
    raise exception 'Ubicación de foto inválida' using errcode = '22023';
  end if;
  select * into f from caja_app.fotos where path = p_path;
  if f.id is null then
    insert into caja_app.fotos (caja_id, comercio_id, pedido, path, subida_por) values (c.id, c.comercio_id, p_pedido, p_path, s.persona_id)
    returning * into f;
    perform caja_app.auditar(c.comercio_id, c.id, 'foto', s.persona_id, jsonb_build_object('pedido', p_pedido));
  end if;
  return caja_app.caja_json(c.id, true);
end $$;

create function public.caja_app_cerrar(p_token text, p_caja uuid, p_arqueo numeric, p_venta_total numeric, p_otros jsonb,
  p_verificados jsonb, p_retiro numeric, p_destino text, p_observacion text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s caja_app.sesiones; c caja_app.cajas; co caja_app.comercios; v_faltan text;
begin
  s := caja_app.operador(p_token);
  c := caja_app.caja_operable(s, p_caja);
  if c.estado = 'cerrada' then return jsonb_build_object('ya_cerrada', true, 'caja', caja_app.caja_json(c.id, true)); end if;
  select * into co from caja_app.comercios where id = c.comercio_id;
  if p_arqueo is null or p_arqueo < 0 or p_arqueo <> round(p_arqueo, 2) or p_arqueo >= 10000000000 then
    raise exception 'Cargá el arqueo: el efectivo contado' using errcode = '22023';
  end if;
  if coalesce(p_retiro, 0) < 0 or coalesce(p_retiro, 0) > p_arqueo or coalesce(p_retiro, 0) <> round(coalesce(p_retiro, 0), 2) then
    raise exception 'El retiro no puede ser mayor que el efectivo contado' using errcode = '22023';
  end if;
  if coalesce(p_retiro, 0) > 0 and not caja_app.texto_ok(p_destino, 2, 60) then
    raise exception 'Indicá a dónde va el retiro' using errcode = '22023';
  end if;
  if char_length(coalesce(p_observacion, '')) > 300 or (p_verificados is not null and jsonb_typeof(p_verificados) <> 'object') then
    raise exception 'Revisá la observación' using errcode = '22023';
  end if;
  if c.modo_carga = 'totales' then perform caja_app.validar_totales(c.comercio_id, p_venta_total, p_otros); end if;
  if co.bloquear_sin_fotos then
    select string_agg(x->>'nombre', ', ') into v_faltan from jsonb_array_elements(co.fotos) x
    where (x->>'obligatoria')::boolean and not exists (select 1 from caja_app.fotos f where f.caja_id = c.id and f.pedido = x->>'id');
    if v_faltan is not null then raise exception 'Faltan fotos obligatorias: %', v_faltan using errcode = '22023'; end if;
  end if;
  c := caja_app.cerrar_interno(c.id, 'manual', s.persona_id, p_arqueo,
    case when c.modo_carga = 'totales' then p_venta_total end,
    case when c.modo_carga = 'totales' then coalesce(p_otros, '{}'::jsonb) end,
    p_verificados, coalesce(p_retiro, 0), p_destino, p_observacion);
  return jsonb_build_object('ya_cerrada', false, 'caja', caja_app.caja_json(c.id, true));
end $$;

-- ============================== Permisos ==============================

revoke all on all tables in schema caja_app from public, anon, authenticated;
revoke all on all sequences in schema caja_app from public, anon, authenticated;
revoke all on all functions in schema caja_app from public, anon, authenticated;
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'caja\_app\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Cierre automático en el servidor cada 15 minutos (solo cierra lo vencido). Sin pg_cron se omite.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('caja-app-cierre-automatico', '*/15 * * * *', 'select caja_app.cerrar_vencidos();');
  end if;
end $$;

comment on schema caja_app is 'Micro app de caja (nombre pendiente), separada de GESTLOK. Solo RPC public.caja_app_*.';
