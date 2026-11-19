-- GESTLOK Chat · etapa 1: atención virtual y pedidos por empresa y sucursal.
-- Esquema NUEVO y aislado (gestlok_chat_private). No modifica tablas ni funciones existentes
-- (Pedidos WhatsApp, Caja, Stock, Empleados, Reseñas, NFC siguen iguales).
-- Repetible: se puede aplicar dos veces sin error.
--
-- Acceso:
--   * Público (clientes): SOLO a través de la función segura «gestlok-chat», que usa service_role.
--     Las funciones public.gestlok_chat_srv_* no se pueden ejecutar desde anon ni authenticated.
--   * Panel (GESTLOK): funciones public.gestlok_chat_panel_* con sesión de GESTLOK. Cada una revisa
--     empresa activa, rol (dueño, gerente, creadora) y sucursal. Nunca devuelven datos de otra empresa.
--   * Precios y totales se calculan SIEMPRE en la base, con el catálogo vigente.

create extension if not exists pgcrypto;
create schema if not exists gestlok_chat_private;
revoke all on schema gestlok_chat_private from public, anon, authenticated;

-- Empresas habilitadas (la creadora enciende el módulo empresa por empresa) ---------------------------------
create table if not exists gestlok_chat_private.empresas (
  tenant_id uuid primary key references gestlok_tenancy.tenants(id) on delete restrict,
  nombre_publico text not null check (length(btrim(nombre_publico)) between 2 and 80),
  habilitada boolean not null default true,
  creada_at timestamptz not null default now(),
  creada_por uuid,
  actualizada_at timestamptz not null default now()
);

create table if not exists gestlok_chat_private.sucursales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references gestlok_chat_private.empresas(tenant_id) on delete restrict,
  local_id text not null check (local_id ~ '^[a-z0-9_-]{2,60}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  activa boolean not null default false,
  bienvenida text not null default '' check (length(bienvenida) <= 500),
  horario text not null default '' check (length(horario) <= 300),
  direccion text not null default '' check (length(direccion) <= 200),
  acepta_retiro boolean not null default true,
  acepta_envio boolean not null default false,
  envio_costo numeric(12,2) not null default 0 check (envio_costo >= 0 and envio_costo < 1000000),
  envio_zona text not null default '' check (length(envio_zona) <= 300),
  pedido_minimo numeric(12,2) not null default 0 check (pedido_minimo >= 0 and pedido_minimo < 10000000),
  medios_pago text[] not null default array['efectivo']::text[]
    check (cardinality(medios_pago) between 1 and 5
      and medios_pago <@ array['efectivo','transferencia','mercado_pago','debito','credito']::text[]),
  prefijo text not null default 'P' check (prefijo ~ '^[A-Z0-9]{1,6}$'),
  ultimo_numero integer not null default 0 check (ultimo_numero >= 0),
  tope_pedidos_dia integer not null default 200 check (tope_pedidos_dia between 1 and 5000),
  tope_mensajes_dia integer not null default 3000 check (tope_mensajes_dia between 50 and 100000),
  version integer not null default 1,
  actualizada_at timestamptz not null default now(),
  actualizada_por uuid,
  unique (tenant_id, local_id),
  unique (tenant_id, id),
  check (acepta_retiro or acepta_envio)
);

create table if not exists gestlok_chat_private.categorias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sucursal_id uuid not null,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  orden integer not null default 0 check (orden between 0 and 10000),
  activa boolean not null default true,
  foreign key (tenant_id, sucursal_id) references gestlok_chat_private.sucursales(tenant_id, id) on delete restrict,
  unique (sucursal_id, nombre),
  unique (tenant_id, sucursal_id, id)
);

-- Opciones de un producto (por ejemplo «Sabor», «Tamaño»): validadas en la base.
create or replace function gestlok_chat_private.opciones_validas(p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare g jsonb; v jsonb; ids text[] := '{}'; vids text[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 8 then return false; end if;
  for g in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(g) <> 'object'
       or coalesce(g->>'id','') !~ '^[a-z0-9_]{1,30}$' or g->>'id' = any(ids)
       or length(btrim(coalesce(g->>'nombre',''))) not between 1 and 60
       or coalesce(g->>'tipo','') not in ('una','varias')
       or jsonb_typeof(coalesce(g->'obligatorio','false'::jsonb)) <> 'boolean'
       or jsonb_typeof(g->'valores') is distinct from 'array'
       or jsonb_array_length(g->'valores') not between 1 and 30 then
      return false;
    end if;
    if g->>'tipo' = 'varias' and (jsonb_typeof(g->'max') is distinct from 'number'
       or (g->>'max')::numeric not between 1 and 30 or (g->>'max')::numeric <> floor((g->>'max')::numeric)) then
      return false;
    end if;
    ids := ids || (g->>'id');
    vids := '{}';
    for v in select value from jsonb_array_elements(g->'valores') loop
      if jsonb_typeof(v) <> 'object'
         or coalesce(v->>'id','') !~ '^[a-z0-9_]{1,30}$' or v->>'id' = any(vids)
         or length(btrim(coalesce(v->>'nombre',''))) not between 1 and 60
         or jsonb_typeof(coalesce(v->'extra','0'::jsonb)) <> 'number'
         or coalesce((v->>'extra')::numeric,0) not between 0 and 999999 then
        return false;
      end if;
      vids := vids || (v->>'id');
    end loop;
  end loop;
  return true;
end $$;
revoke all on function gestlok_chat_private.opciones_validas(jsonb) from public, anon, authenticated;

create table if not exists gestlok_chat_private.productos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sucursal_id uuid not null,
  categoria_id uuid,
  nombre text not null check (length(btrim(nombre)) between 2 and 120),
  descripcion text not null default '' check (length(descripcion) <= 300),
  precio numeric(12,2) not null check (precio > 0 and precio < 10000000),
  activo boolean not null default true,       -- figura en la carta
  disponible boolean not null default true,   -- hay hoy (el gerente lo marca agotado)
  orden integer not null default 0 check (orden between 0 and 10000),
  opciones jsonb not null default '[]'::jsonb check (gestlok_chat_private.opciones_validas(opciones)),
  actualizado_at timestamptz not null default now(),
  foreign key (tenant_id, sucursal_id) references gestlok_chat_private.sucursales(tenant_id, id) on delete restrict,
  foreign key (tenant_id, sucursal_id, categoria_id) references gestlok_chat_private.categorias(tenant_id, sucursal_id, id) on delete restrict,
  unique (sucursal_id, nombre)
);
create index if not exists gchat_productos_sucursal on gestlok_chat_private.productos(sucursal_id, orden, nombre) where activo;

create table if not exists gestlok_chat_private.conversaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sucursal_id uuid not null,
  token_hash bytea not null unique check (length(token_hash) = 32),
  ip_hash text not null default '' check (length(ip_hash) <= 64),
  estado jsonb not null default '{}'::jsonb check (jsonb_typeof(estado) = 'object' and pg_column_size(estado) < 24000),
  mensajes integer not null default 0 check (mensajes >= 0),
  creada_at timestamptz not null default now(),
  ultima_at timestamptz not null default now(),
  foreign key (tenant_id, sucursal_id) references gestlok_chat_private.sucursales(tenant_id, id) on delete restrict
);
create index if not exists gchat_conv_sucursal on gestlok_chat_private.conversaciones(sucursal_id, ultima_at desc);
create index if not exists gchat_conv_vieja on gestlok_chat_private.conversaciones(ultima_at);

create table if not exists gestlok_chat_private.mensajes (
  id bigint generated always as identity primary key,
  conversacion_id uuid not null references gestlok_chat_private.conversaciones(id) on delete cascade,
  rol text not null check (rol in ('cliente','asistente','local')),
  texto text not null check (length(texto) between 1 and 2000),
  creado_at timestamptz not null default now()
);
create index if not exists gchat_mensajes_conv on gestlok_chat_private.mensajes(conversacion_id, id);

create table if not exists gestlok_chat_private.pedidos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sucursal_id uuid not null,
  conversacion_id uuid references gestlok_chat_private.conversaciones(id) on delete set null,
  numero integer not null check (numero > 0),
  codigo text not null check (length(codigo) between 3 and 20),
  cliente_nombre text not null check (length(btrim(cliente_nombre)) between 2 and 80),
  cliente_telefono text not null check (cliente_telefono ~ '^[0-9]{8,15}$'),
  entrega text not null check (entrega in ('retiro','envio')),
  direccion text not null default '' check (length(direccion) <= 200),
  horario text not null default '' check (length(horario) <= 60),
  medio_pago text not null check (medio_pago in ('efectivo','transferencia','mercado_pago','debito','credito')),
  nota text not null default '' check (length(nota) <= 500),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  subtotal numeric(12,2) not null check (subtotal > 0),
  envio numeric(12,2) not null default 0 check (envio >= 0),
  total numeric(12,2) not null check (total > 0 and total < 100000000),
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmado','rechazado','cancelado')),
  motivo text not null default '' check (length(motivo) <= 300),
  creado_at timestamptz not null default now(),
  decidido_at timestamptz,
  decidido_por uuid,
  foreign key (tenant_id, sucursal_id) references gestlok_chat_private.sucursales(tenant_id, id) on delete restrict,
  unique (sucursal_id, numero),
  check (entrega = 'retiro' or length(btrim(direccion)) >= 5),
  check ((estado = 'pendiente') = (decidido_at is null))
);
create index if not exists gchat_pedidos_sucursal on gestlok_chat_private.pedidos(sucursal_id, creado_at desc);
create index if not exists gchat_pedidos_pendientes on gestlok_chat_private.pedidos(sucursal_id, creado_at) where estado = 'pendiente';
create index if not exists gchat_pedidos_conv on gestlok_chat_private.pedidos(conversacion_id, creado_at desc);

create table if not exists gestlok_chat_private.pedido_eventos (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references gestlok_chat_private.pedidos(id) on delete restrict,
  evento text not null check (evento in ('creado','confirmado','rechazado','cancelado')),
  actor uuid,
  detalle text not null default '' check (length(detalle) <= 300),
  creado_at timestamptz not null default now()
);
create unique index if not exists gchat_evento_decision_unica on gestlok_chat_private.pedido_eventos(pedido_id)
  where evento in ('confirmado','rechazado','cancelado');

create table if not exists gestlok_chat_private.auditoria (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  sucursal_id uuid,
  actor uuid,
  accion text not null check (length(accion) between 2 and 60),
  detalle jsonb not null default '{}'::jsonb,
  creado_at timestamptz not null default now()
);
create index if not exists gchat_auditoria on gestlok_chat_private.auditoria(tenant_id, creado_at desc);

create table if not exists gestlok_chat_private.limites (
  clave text not null check (length(clave) between 3 and 120),
  ventana timestamptz not null,
  cantidad integer not null default 0,
  primary key (clave, ventana)
);

do $$
declare t text;
begin
  foreach t in array array['empresas','sucursales','categorias','productos','conversaciones','mensajes',
                           'pedidos','pedido_eventos','auditoria','limites'] loop
    execute format('alter table gestlok_chat_private.%I enable row level security', t);
    execute format('revoke all on gestlok_chat_private.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Ayudas internas ---------------------------------------------------------------------------------------------
-- Suma un uso en una ventana (minuto o día) y dice si todavía está dentro del tope.
create or replace function gestlok_chat_private.consumir(p_clave text, p_ventana text, p_max integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_v timestamptz; v_n integer;
begin
  v_v := date_trunc(case when p_ventana = 'dia' then 'day' else 'minute' end, now());
  insert into gestlok_chat_private.limites(clave, ventana, cantidad) values (p_clave, v_v, 1)
  on conflict (clave, ventana) do update set cantidad = gestlok_chat_private.limites.cantidad + 1
  returning cantidad into v_n;
  return v_n <= p_max;
end $$;

-- Nivel del usuario del panel en una sucursal: configurar (dueño/creadora), gestionar (gerente de esa
-- sucursal), ver (creadora en modo soporte, solo lectura) o null. Siempre dentro de la empresa activa.
create or replace function gestlok_chat_private.nivel(p_sucursal uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_t uuid; v_local text; v_rol text;
begin
  if auth.uid() is null or p_sucursal is null then return null; end if;
  select s.tenant_id, s.local_id into v_t, v_local
    from gestlok_chat_private.sucursales s
    join gestlok_chat_private.empresas e on e.tenant_id = s.tenant_id and e.habilitada
   where s.id = p_sucursal;
  if v_t is null or gestlok_tenancy.current_tenant_id() is distinct from v_t then return null; end if;
  v_rol := public.mi_rol();
  if v_rol = 'creadora' then perform gestlok_platform.require_admin(); return 'configurar'; end if;
  if v_rol = 'dueno' and public.puede_editar_local(v_local) then return 'configurar'; end if;
  if v_rol in ('gerente','editor') and public.puede_editar_local(v_local) then return 'gestionar'; end if;
  if v_rol = 'lectura' and gestlok_platform.support_tenant() is not distinct from v_t then return 'ver'; end if;
  return null;
end $$;

create or replace function gestlok_chat_private.exigir(p_sucursal uuid, p_minimo text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text := gestlok_chat_private.nivel(p_sucursal);
begin
  if v is null
     or (p_minimo = 'gestionar' and v not in ('gestionar','configurar'))
     or (p_minimo = 'configurar' and v <> 'configurar') then
    raise exception 'No tenés permiso para esta acción de GESTLOK Chat' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function gestlok_chat_private.auditar(p_sucursal uuid, p_accion text, p_detalle jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into gestlok_chat_private.auditoria(tenant_id, sucursal_id, actor, accion, detalle)
  select s.tenant_id, s.id, auth.uid(), p_accion, coalesce(p_detalle, '{}'::jsonb)
    from gestlok_chat_private.sucursales s where s.id = p_sucursal
$$;

create or replace function gestlok_chat_private.producto_json(p gestlok_chat_private.productos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'categoria_id', p.categoria_id, 'nombre', p.nombre,
    'descripcion', p.descripcion, 'precio', p.precio, 'activo', p.activo, 'disponible', p.disponible,
    'orden', p.orden, 'opciones', p.opciones)
$$;

create or replace function gestlok_chat_private.catalogo(p_sucursal uuid, p_publico boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre,
        'orden', c.orden, 'activa', c.activa) order by c.orden, c.nombre)
      from gestlok_chat_private.categorias c
      where c.sucursal_id = p_sucursal and (not p_publico or c.activa)), '[]'::jsonb),
    'productos', coalesce((select jsonb_agg(gestlok_chat_private.producto_json(p) order by p.orden, p.nombre)
      from gestlok_chat_private.productos p
      left join gestlok_chat_private.categorias c on c.id = p.categoria_id
      where p.sucursal_id = p_sucursal
        and (not p_publico or (p.activo and coalesce(c.activa, true)))), '[]'::jsonb))
$$;

create or replace function gestlok_chat_private.sucursal_publica(s gestlok_chat_private.sucursales)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('slug', s.slug, 'nombre', s.nombre,
    'empresa', (select e.nombre_publico from gestlok_chat_private.empresas e where e.tenant_id = s.tenant_id),
    'bienvenida', s.bienvenida, 'horario', s.horario, 'direccion', s.direccion,
    'acepta_retiro', s.acepta_retiro, 'acepta_envio', s.acepta_envio, 'envio_costo', s.envio_costo,
    'envio_zona', s.envio_zona, 'pedido_minimo', s.pedido_minimo, 'medios_pago', to_jsonb(s.medios_pago))
$$;

create or replace function gestlok_chat_private.pedido_publico(p gestlok_chat_private.pedidos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('codigo', p.codigo, 'estado', p.estado, 'motivo', p.motivo, 'total', p.total,
    'subtotal', p.subtotal, 'envio', p.envio, 'items', p.items, 'entrega', p.entrega,
    'medio_pago', p.medio_pago, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at)
$$;

-- Sesión anónima del cliente: el token vive solo en su teléfono; la base guarda su hash.
create or replace function gestlok_chat_private.conversacion_de(p_conversacion uuid, p_token_hash bytea)
returns gestlok_chat_private.conversaciones language plpgsql stable security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones;
begin
  select * into c from gestlok_chat_private.conversaciones
   where id = p_conversacion and token_hash = p_token_hash;
  if c.id is null then raise exception 'Conversación no encontrada' using errcode = '42501'; end if;
  return c;
end $$;

create or replace function gestlok_chat_private.sucursal_abierta(p_sucursal uuid)
returns gestlok_chat_private.sucursales language plpgsql stable security definer set search_path = '' as $$
declare s gestlok_chat_private.sucursales;
begin
  select x.* into s from gestlok_chat_private.sucursales x
    join gestlok_chat_private.empresas e on e.tenant_id = x.tenant_id and e.habilitada
   where x.id = p_sucursal and x.activa;
  if s.id is null then raise exception 'Este chat no está disponible en este momento' using errcode = 'P0001'; end if;
  return s;
end $$;

-- ============================================================================================================
-- Funciones de servicio: SOLO las llama la función segura «gestlok-chat» (service_role).
-- ============================================================================================================
create or replace function public.gestlok_chat_srv_sucursal(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s gestlok_chat_private.sucursales; v_hab boolean;
begin
  select x.* into s from gestlok_chat_private.sucursales x where x.slug = lower(btrim(coalesce(p_slug, '')));
  select e.habilitada into v_hab from gestlok_chat_private.empresas e where e.tenant_id = s.tenant_id;
  -- Sin distinguir entre «no existe» y «apagado» para empresas no habilitadas.
  if s.id is null or not v_hab then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if not s.activa then
    return jsonb_build_object('ok', false, 'motivo', 'pausado', 'sucursal', jsonb_build_object('nombre', s.nombre,
      'empresa', (select e.nombre_publico from gestlok_chat_private.empresas e where e.tenant_id = s.tenant_id)));
  end if;
  return jsonb_build_object('ok', true, 'id', s.id, 'sucursal', gestlok_chat_private.sucursal_publica(s),
    'catalogo', gestlok_chat_private.catalogo(s.id, true));
end $$;

-- Abre o retoma la conversación de este teléfono. Topes: conversaciones nuevas por IP y día.
create or replace function public.gestlok_chat_srv_conversacion(p_sucursal uuid, p_token_hash bytea, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s gestlok_chat_private.sucursales; c gestlok_chat_private.conversaciones;
begin
  s := gestlok_chat_private.sucursal_abierta(p_sucursal);
  if p_token_hash is null or length(p_token_hash) <> 32 then
    raise exception 'Sesión inválida' using errcode = '22023';
  end if;
  select * into c from gestlok_chat_private.conversaciones where token_hash = p_token_hash;
  if c.id is not null and c.sucursal_id <> s.id then
    raise exception 'Sesión de otra sucursal' using errcode = '42501';
  end if;
  if c.id is null then
    if not gestlok_chat_private.consumir('conv:ip:' || left(coalesce(p_ip_hash, ''), 64), 'dia', 30) then
      raise exception 'Demasiadas conversaciones nuevas. Probá más tarde.' using errcode = 'P0001';
    end if;
    insert into gestlok_chat_private.conversaciones(tenant_id, sucursal_id, token_hash, ip_hash)
    values (s.tenant_id, s.id, p_token_hash, left(coalesce(p_ip_hash, ''), 64)) returning * into c;
  end if;
  return jsonb_build_object('id', c.id, 'estado', c.estado, 'nueva', c.mensajes = 0,
    'mensajes', coalesce((select jsonb_agg(jsonb_build_object('rol', m.rol, 'texto', m.texto, 'at', m.creado_at) order by m.id)
       from (select * from gestlok_chat_private.mensajes where conversacion_id = c.id order by id desc limit 40) m), '[]'::jsonb),
    'pedidos', coalesce((select jsonb_agg(gestlok_chat_private.pedido_publico(p) order by p.creado_at desc)
       from (select * from gestlok_chat_private.pedidos where conversacion_id = c.id order by creado_at desc limit 5) p), '[]'::jsonb));
end $$;

-- Guarda un turno (mensaje del cliente + respuesta) y el estado del asistente.
create or replace function public.gestlok_chat_srv_turno(
  p_conversacion uuid, p_token_hash bytea, p_ip_hash text, p_cliente text, p_respuesta text, p_estado jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if c.mensajes >= 400 then
    raise exception 'Esta conversación llegó a su límite. Abrí una nueva.' using errcode = 'P0001';
  end if;
  if not gestlok_chat_private.consumir('msg:ip:' || left(coalesce(p_ip_hash, ''), 64), 'minuto', 20)
     or not gestlok_chat_private.consumir('msg:conv:' || c.id::text, 'minuto', 15)
     or not gestlok_chat_private.consumir('msg:suc:' || s.id::text, 'dia', s.tope_mensajes_dia) then
    raise exception 'Estás escribiendo muy rápido. Esperá un momento.' using errcode = 'P0001';
  end if;
  if p_estado is null or jsonb_typeof(p_estado) <> 'object' or pg_column_size(p_estado) >= 24000 then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_cliente, ''))) > 0 then
    insert into gestlok_chat_private.mensajes(conversacion_id, rol, texto) values (c.id, 'cliente', left(btrim(p_cliente), 2000));
  end if;
  if length(btrim(coalesce(p_respuesta, ''))) > 0 then
    insert into gestlok_chat_private.mensajes(conversacion_id, rol, texto) values (c.id, 'asistente', left(btrim(p_respuesta), 2000));
  end if;
  update gestlok_chat_private.conversaciones
     set estado = p_estado, ultima_at = now(),
         mensajes = mensajes + (case when length(btrim(coalesce(p_cliente, ''))) > 0 then 1 else 0 end)
                             + (case when length(btrim(coalesce(p_respuesta, ''))) > 0 then 1 else 0 end)
   where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

-- Crea el pedido: valida productos, opciones, disponibilidad, mínimos y topes; calcula los importes.
create or replace function public.gestlok_chat_srv_pedido(p_conversacion uuid, p_token_hash bytea, p_pedido jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c gestlok_chat_private.conversaciones; s gestlok_chat_private.sucursales; p gestlok_chat_private.productos;
  it jsonb; g jsonb; sel jsonb; v jsonb; items jsonb := '[]'::jsonb; elegidas jsonb; nombres jsonb;
  v_cant integer; v_extra numeric; v_unit numeric; v_sub numeric := 0; v_envio numeric := 0; v_total numeric;
  v_nombre text; v_tel text; v_entrega text; v_dir text; v_pago text; v_num integer; v_ped gestlok_chat_private.pedidos;
  v_ids text[];
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  s := gestlok_chat_private.sucursal_abierta(c.sucursal_id);
  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' or jsonb_typeof(p_pedido->'items') is distinct from 'array'
     or jsonb_array_length(p_pedido->'items') not between 1 and 30 then
    raise exception 'El pedido no tiene productos' using errcode = '22023';
  end if;
  if exists (select 1 from gestlok_chat_private.pedidos x where x.conversacion_id = c.id and x.estado = 'pendiente') then
    raise exception 'Ya tenés un pedido esperando confirmación del local' using errcode = 'P0001';
  end if;

  v_nombre := btrim(regexp_replace(coalesce(p_pedido->>'nombre', ''), '\s+', ' ', 'g'));
  v_tel := regexp_replace(coalesce(p_pedido->>'telefono', ''), '[^0-9]', '', 'g');
  v_entrega := coalesce(p_pedido->>'entrega', '');
  v_dir := btrim(coalesce(p_pedido->>'direccion', ''));
  v_pago := coalesce(p_pedido->>'medio_pago', '');
  if length(v_nombre) not between 2 and 80 then raise exception 'Falta el nombre' using errcode = '22023'; end if;
  if v_tel !~ '^[0-9]{8,15}$' then raise exception 'El teléfono no es válido' using errcode = '22023'; end if;
  if v_entrega not in ('retiro','envio') or (v_entrega = 'retiro' and not s.acepta_retiro)
     or (v_entrega = 'envio' and not s.acepta_envio) then
    raise exception 'Esa forma de entrega no está disponible' using errcode = '22023';
  end if;
  if v_entrega = 'envio' and length(v_dir) < 5 then raise exception 'Falta la dirección de envío' using errcode = '22023'; end if;
  if not (v_pago = any(s.medios_pago)) then raise exception 'Ese medio de pago no está disponible' using errcode = '22023'; end if;

  for it in select value from jsonb_array_elements(p_pedido->'items') loop
    v_cant := case when jsonb_typeof(it->'cantidad') = 'number' then (it->>'cantidad')::numeric::integer end;
    if v_cant is null or v_cant not between 1 and 50 or (it->>'cantidad')::numeric <> v_cant then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;
    select x.* into p from gestlok_chat_private.productos x
      left join gestlok_chat_private.categorias k on k.id = x.categoria_id
     where x.id = case when coalesce(it->>'producto_id','') ~ '^[0-9a-f-]{36}$' then (it->>'producto_id')::uuid end
       and x.sucursal_id = s.id and x.activo and coalesce(k.activa, true);
    if p.id is null then raise exception 'Un producto ya no está en la carta' using errcode = 'P0001'; end if;
    if not p.disponible then raise exception '% no está disponible ahora', p.nombre using errcode = 'P0001'; end if;
    sel := coalesce(it->'opciones', '{}'::jsonb);
    if jsonb_typeof(sel) <> 'object' then raise exception 'Opciones inválidas' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_object_keys(sel) k
               where not exists (select 1 from jsonb_array_elements(p.opciones) gg where gg->>'id' = k)) then
      raise exception 'Opciones inválidas para %', p.nombre using errcode = '22023';
    end if;
    v_extra := 0; elegidas := '[]'::jsonb;
    for g in select value from jsonb_array_elements(p.opciones) loop
      v := coalesce(sel->(g->>'id'), '[]'::jsonb);
      if jsonb_typeof(v) <> 'array' then raise exception 'Opciones inválidas' using errcode = '22023'; end if;
      select array_agg(value) into v_ids from jsonb_array_elements_text(v);
      v_ids := coalesce(v_ids, '{}');
      if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x)
         or exists (select 1 from unnest(v_ids) x
                    where not exists (select 1 from jsonb_array_elements(g->'valores') vv where vv->>'id' = x))
         or (coalesce((g->>'obligatorio')::boolean, false) and cardinality(v_ids) = 0)
         or (g->>'tipo' = 'una' and cardinality(v_ids) > 1)
         or (g->>'tipo' = 'varias' and cardinality(v_ids) > (g->>'max')::integer) then
        raise exception 'Elegí bien «%» en %', g->>'nombre', p.nombre using errcode = '22023';
      end if;
      if cardinality(v_ids) > 0 then
        select coalesce(sum(coalesce((vv->>'extra')::numeric, 0)), 0), jsonb_agg(vv->>'nombre' order by vv->>'nombre')
          into v_unit, nombres
          from jsonb_array_elements(g->'valores') vv where vv->>'id' = any(v_ids);
        v_extra := v_extra + v_unit;
        elegidas := elegidas || jsonb_build_array(jsonb_build_object('grupo', g->>'nombre', 'valores', nombres));
      end if;
    end loop;
    v_unit := p.precio + v_extra;
    v_sub := v_sub + v_unit * v_cant;
    items := items || jsonb_build_array(jsonb_build_object('producto_id', p.id, 'nombre', p.nombre, 'cantidad', v_cant,
      'precio_unitario', v_unit, 'opciones', elegidas, 'nota', left(btrim(coalesce(it->>'nota', '')), 200),
      'importe', v_unit * v_cant));
  end loop;

  if v_sub < s.pedido_minimo then
    raise exception 'El pedido mínimo es de $ %', replace(to_char(round(s.pedido_minimo), 'FM999,999,990'), ',', '.') using errcode = 'P0001';
  end if;
  if v_entrega = 'envio' then v_envio := s.envio_costo; end if;
  v_total := v_sub + v_envio;

  if not gestlok_chat_private.consumir('ped:suc:' || s.id::text, 'dia', s.tope_pedidos_dia)
     or not gestlok_chat_private.consumir('ped:tel:' || s.id::text || ':' || v_tel, 'dia', 5)
     or not gestlok_chat_private.consumir('ped:conv:' || c.id::text, 'dia', 5) then
    raise exception 'Se alcanzó el límite de pedidos por hoy. Comunicate con el local.' using errcode = 'P0001';
  end if;

  update gestlok_chat_private.sucursales set ultimo_numero = ultimo_numero + 1 where id = s.id returning ultimo_numero into v_num;
  insert into gestlok_chat_private.pedidos(tenant_id, sucursal_id, conversacion_id, numero, codigo, cliente_nombre,
    cliente_telefono, entrega, direccion, horario, medio_pago, nota, items, subtotal, envio, total)
  values (s.tenant_id, s.id, c.id, v_num, s.prefijo || '-' || lpad(v_num::text, 4, '0'), v_nombre, v_tel, v_entrega,
    case when v_entrega = 'envio' then left(v_dir, 200) else '' end, left(btrim(coalesce(p_pedido->>'horario', '')), 60),
    v_pago, left(btrim(coalesce(p_pedido->>'nota', '')), 500), items, v_sub, v_envio, v_total)
  returning * into v_ped;
  insert into gestlok_chat_private.pedido_eventos(pedido_id, evento) values (v_ped.id, 'creado');
  return jsonb_build_object('ok', true, 'pedido', gestlok_chat_private.pedido_publico(v_ped));
end $$;

create or replace function public.gestlok_chat_srv_cancelar(p_conversacion uuid, p_token_hash bytea)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones; v_ped gestlok_chat_private.pedidos;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  update gestlok_chat_private.pedidos set estado = 'cancelado', decidido_at = now(), motivo = 'Cancelado por el cliente'
   where conversacion_id = c.id and estado = 'pendiente' returning * into v_ped;
  if v_ped.id is null then raise exception 'No hay un pedido pendiente para cancelar' using errcode = 'P0001'; end if;
  insert into gestlok_chat_private.pedido_eventos(pedido_id, evento, detalle) values (v_ped.id, 'cancelado', 'cliente');
  return jsonb_build_object('ok', true, 'pedido', gestlok_chat_private.pedido_publico(v_ped));
end $$;

create or replace function public.gestlok_chat_srv_estado(p_conversacion uuid, p_token_hash bytea)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c gestlok_chat_private.conversaciones;
begin
  c := gestlok_chat_private.conversacion_de(p_conversacion, p_token_hash);
  return jsonb_build_object('pedidos', coalesce((select jsonb_agg(gestlok_chat_private.pedido_publico(p) order by p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos where conversacion_id = c.id order by creado_at desc limit 5) p), '[]'::jsonb));
end $$;

-- ============================================================================================================
-- Panel de GESTLOK (sesión de dueño, gerente o creadora)
-- ============================================================================================================
create or replace function public.gestlok_chat_panel_inicio()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_t uuid := gestlok_tenancy.current_tenant_id(); e gestlok_chat_private.empresas;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión en GESTLOK' using errcode = '42501'; end if;
  select * into e from gestlok_chat_private.empresas where tenant_id = v_t and habilitada;
  if e.tenant_id is null then return jsonb_build_object('habilitado', false); end if;
  return jsonb_build_object('habilitado', true, 'empresa', e.nombre_publico,
    'sucursales', coalesce((select jsonb_agg(x order by x->>'nombre') from (
      select jsonb_build_object('id', s.id, 'nombre', s.nombre, 'slug', s.slug, 'activa', s.activa,
        'nivel', gestlok_chat_private.nivel(s.id),
        'pendientes', (select count(*) from gestlok_chat_private.pedidos p where p.sucursal_id = s.id and p.estado = 'pendiente')) x
      from gestlok_chat_private.sucursales s where s.tenant_id = e.tenant_id and gestlok_chat_private.nivel(s.id) is not null) q), '[]'::jsonb));
end $$;

create or replace function public.gestlok_chat_panel_pedidos(p_sucursal uuid, p_estado text default 'pendiente', p_limite integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_nivel text := gestlok_chat_private.exigir(p_sucursal, 'ver');
begin
  if coalesce(p_estado, '') not in ('pendiente','confirmado','rechazado','cancelado','todos') then
    raise exception 'Filtro inválido' using errcode = '22023';
  end if;
  return jsonb_build_object('nivel', v_nivel, 'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'codigo', p.codigo, 'estado', p.estado, 'motivo', p.motivo, 'cliente_nombre', p.cliente_nombre,
      'cliente_telefono', p.cliente_telefono, 'entrega', p.entrega, 'direccion', p.direccion, 'horario', p.horario,
      'medio_pago', p.medio_pago, 'nota', p.nota, 'items', p.items, 'subtotal', p.subtotal, 'envio', p.envio,
      'total', p.total, 'creado_at', p.creado_at, 'decidido_at', p.decidido_at) order by
        case when p.estado = 'pendiente' then p.creado_at end asc nulls last, p.creado_at desc)
    from (select * from gestlok_chat_private.pedidos x where x.sucursal_id = p_sucursal
            and (p_estado = 'todos' or x.estado = p_estado)
          order by x.creado_at desc limit least(greatest(coalesce(p_limite, 50), 1), 200)) p), '[]'::jsonb));
end $$;

create or replace function public.gestlok_chat_panel_decidir(p_pedido uuid, p_decision text, p_motivo text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_suc uuid; v_ped gestlok_chat_private.pedidos;
begin
  select sucursal_id into v_suc from gestlok_chat_private.pedidos where id = p_pedido;
  perform gestlok_chat_private.exigir(v_suc, 'gestionar');
  if p_decision not in ('confirmado','rechazado') then raise exception 'Decisión inválida' using errcode = '22023'; end if;
  if p_decision = 'rechazado' and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribí el motivo del rechazo para el cliente' using errcode = '22023';
  end if;
  update gestlok_chat_private.pedidos
     set estado = p_decision, motivo = left(btrim(coalesce(p_motivo, '')), 300), decidido_at = now(), decidido_por = auth.uid()
   where id = p_pedido and estado = 'pendiente' returning * into v_ped;
  if v_ped.id is null then raise exception 'Este pedido ya fue resuelto' using errcode = 'P0001'; end if;
  insert into gestlok_chat_private.pedido_eventos(pedido_id, evento, actor, detalle)
  values (v_ped.id, p_decision, auth.uid(), left(btrim(coalesce(p_motivo, '')), 300));
  return jsonb_build_object('ok', true, 'codigo', v_ped.codigo, 'estado', v_ped.estado);
end $$;

create or replace function public.gestlok_chat_panel_catalogo(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_nivel text := gestlok_chat_private.exigir(p_sucursal, 'ver');
begin
  return gestlok_chat_private.catalogo(p_sucursal, false) || jsonb_build_object('nivel', v_nivel);
end $$;

create or replace function public.gestlok_chat_panel_categoria_guardar(
  p_sucursal uuid, p_id uuid, p_nombre text, p_orden integer default 0, p_activa boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s gestlok_chat_private.sucursales; v_id uuid;
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'configurar');
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  if p_id is null then
    insert into gestlok_chat_private.categorias(tenant_id, sucursal_id, nombre, orden, activa)
    values (s.tenant_id, s.id, btrim(p_nombre), coalesce(p_orden, 0), coalesce(p_activa, true)) returning id into v_id;
  else
    update gestlok_chat_private.categorias set nombre = btrim(p_nombre), orden = coalesce(p_orden, 0), activa = coalesce(p_activa, true)
     where id = p_id and sucursal_id = s.id returning id into v_id;
    if v_id is null then raise exception 'Categoría no encontrada' using errcode = 'P0002'; end if;
  end if;
  perform gestlok_chat_private.auditar(s.id, 'categoria_guardar', jsonb_build_object('id', v_id, 'nombre', btrim(p_nombre)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.gestlok_chat_panel_producto_guardar(p_sucursal uuid, p_producto jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s gestlok_chat_private.sucursales; v_id uuid; v_cat uuid; v_antes jsonb; v_precio numeric;
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'configurar');
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  if p_producto is null or jsonb_typeof(p_producto) <> 'object' then raise exception 'Datos inválidos' using errcode = '22023'; end if;
  v_cat := case when coalesce(p_producto->>'categoria_id', '') ~ '^[0-9a-f-]{36}$' then (p_producto->>'categoria_id')::uuid end;
  if v_cat is not null and not exists (select 1 from gestlok_chat_private.categorias where id = v_cat and sucursal_id = s.id) then
    raise exception 'Categoría de otra sucursal' using errcode = '42501';
  end if;
  v_precio := case when jsonb_typeof(p_producto->'precio') = 'number' then (p_producto->>'precio')::numeric end;
  if v_precio is null then raise exception 'Falta el precio' using errcode = '22023'; end if;
  if coalesce(p_producto->>'id', '') ~ '^[0-9a-f-]{36}$' then
    select gestlok_chat_private.producto_json(p) into v_antes from gestlok_chat_private.productos p
     where p.id = (p_producto->>'id')::uuid and p.sucursal_id = s.id;
    if v_antes is null then raise exception 'Producto no encontrado' using errcode = 'P0002'; end if;
    update gestlok_chat_private.productos set categoria_id = v_cat, nombre = btrim(p_producto->>'nombre'),
      descripcion = btrim(coalesce(p_producto->>'descripcion', '')), precio = round(v_precio, 2),
      activo = coalesce((p_producto->>'activo')::boolean, true), disponible = coalesce((p_producto->>'disponible')::boolean, true),
      orden = coalesce((p_producto->>'orden')::integer, 0), opciones = coalesce(p_producto->'opciones', '[]'::jsonb), actualizado_at = now()
     where id = (p_producto->>'id')::uuid and sucursal_id = s.id returning id into v_id;
  else
    insert into gestlok_chat_private.productos(tenant_id, sucursal_id, categoria_id, nombre, descripcion, precio, activo, disponible, orden, opciones)
    values (s.tenant_id, s.id, v_cat, btrim(p_producto->>'nombre'), btrim(coalesce(p_producto->>'descripcion', '')), round(v_precio, 2),
      coalesce((p_producto->>'activo')::boolean, true), coalesce((p_producto->>'disponible')::boolean, true),
      coalesce((p_producto->>'orden')::integer, 0), coalesce(p_producto->'opciones', '[]'::jsonb))
    returning id into v_id;
  end if;
  perform gestlok_chat_private.auditar(s.id, 'producto_guardar', jsonb_build_object('id', v_id, 'antes', v_antes,
    'despues', (select gestlok_chat_private.producto_json(p) from gestlok_chat_private.productos p where p.id = v_id)));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- El gerente puede marcar «agotado» o «disponible» sin tocar precios.
create or replace function public.gestlok_chat_panel_disponible(p_producto uuid, p_disponible boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_suc uuid;
begin
  select sucursal_id into v_suc from gestlok_chat_private.productos where id = p_producto;
  perform gestlok_chat_private.exigir(v_suc, 'gestionar');
  update gestlok_chat_private.productos set disponible = coalesce(p_disponible, true), actualizado_at = now() where id = p_producto;
  perform gestlok_chat_private.auditar(v_suc, 'producto_disponible', jsonb_build_object('id', p_producto, 'disponible', p_disponible));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.gestlok_chat_panel_config(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_nivel text := gestlok_chat_private.exigir(p_sucursal, 'ver'); s gestlok_chat_private.sucursales;
begin
  select * into s from gestlok_chat_private.sucursales where id = p_sucursal;
  return gestlok_chat_private.sucursal_publica(s) || jsonb_build_object('id', s.id, 'activa', s.activa, 'prefijo', s.prefijo,
    'tope_pedidos_dia', s.tope_pedidos_dia, 'version', s.version, 'nivel', v_nivel);
end $$;

create or replace function public.gestlok_chat_panel_config_guardar(p_sucursal uuid, p_config jsonb, p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s gestlok_chat_private.sucursales; v_medios text[];
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'configurar');
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Datos inválidos' using errcode = '22023'; end if;
  if jsonb_typeof(p_config->'medios_pago') = 'array' then
    select array_agg(distinct x) into v_medios from jsonb_array_elements_text(p_config->'medios_pago') x;
  end if;
  update gestlok_chat_private.sucursales set
    activa = coalesce((p_config->>'activa')::boolean, activa),
    bienvenida = coalesce(left(p_config->>'bienvenida', 500), bienvenida),
    horario = coalesce(left(p_config->>'horario', 300), horario),
    direccion = coalesce(left(p_config->>'direccion', 200), direccion),
    acepta_retiro = coalesce((p_config->>'acepta_retiro')::boolean, acepta_retiro),
    acepta_envio = coalesce((p_config->>'acepta_envio')::boolean, acepta_envio),
    envio_costo = coalesce((p_config->>'envio_costo')::numeric, envio_costo),
    envio_zona = coalesce(left(p_config->>'envio_zona', 300), envio_zona),
    pedido_minimo = coalesce((p_config->>'pedido_minimo')::numeric, pedido_minimo),
    medios_pago = coalesce(v_medios, medios_pago),
    version = version + 1, actualizada_at = now(), actualizada_por = auth.uid()
   where id = p_sucursal and version = p_version returning * into s;
  if s.id is null then raise exception 'Otra persona cambió la configuración. Volvé a abrirla.' using errcode = '40001'; end if;
  perform gestlok_chat_private.auditar(s.id, 'config_guardar', p_config);
  return jsonb_build_object('ok', true, 'version', s.version);
end $$;

create or replace function public.gestlok_chat_panel_conversaciones(p_sucursal uuid, p_limite integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'creada_at', c.creada_at, 'ultima_at', c.ultima_at,
      'mensajes', c.mensajes,
      'ultimo', (select m.texto from gestlok_chat_private.mensajes m where m.conversacion_id = c.id order by m.id desc limit 1),
      'pedido', (select p.codigo || ' · ' || p.estado from gestlok_chat_private.pedidos p where p.conversacion_id = c.id order by p.creado_at desc limit 1))
      order by c.ultima_at desc)
    from (select * from gestlok_chat_private.conversaciones x where x.sucursal_id = p_sucursal and x.mensajes > 0
          order by x.ultima_at desc limit least(greatest(coalesce(p_limite, 30), 1), 100)) c), '[]'::jsonb);
end $$;

create or replace function public.gestlok_chat_panel_conversacion(p_conversacion uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_suc uuid;
begin
  select sucursal_id into v_suc from gestlok_chat_private.conversaciones where id = p_conversacion;
  perform gestlok_chat_private.exigir(v_suc, 'gestionar');
  return coalesce((select jsonb_agg(jsonb_build_object('rol', m.rol, 'texto', m.texto, 'at', m.creado_at) order by m.id)
    from (select * from gestlok_chat_private.mensajes where conversacion_id = p_conversacion order by id desc limit 200) m), '[]'::jsonb);
end $$;

-- Alta de una empresa (solo la creadora). Las sucursales quedan APAGADAS hasta que el dueño las configure.
create or replace function public.gestlok_chat_admin_habilitar(p_tenant uuid, p_nombre text, p_sucursales jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x jsonb; n integer := 0;
begin
  perform gestlok_platform.require_admin();
  if not exists (select 1 from gestlok_tenancy.tenants where id = p_tenant) then raise exception 'Empresa inexistente' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_sucursales) is distinct from 'array' then raise exception 'Faltan las sucursales' using errcode = '22023'; end if;
  insert into gestlok_chat_private.empresas(tenant_id, nombre_publico, creada_por) values (p_tenant, btrim(p_nombre), auth.uid())
  on conflict (tenant_id) do update set nombre_publico = excluded.nombre_publico, habilitada = true, actualizada_at = now();
  for x in select value from jsonb_array_elements(p_sucursales) loop
    if not exists (select 1 from public.docs d where d.tenant_id = p_tenant and d.col = 'locales' and d.id = x->>'local_id') then
      raise exception 'El local % no pertenece a esa empresa', x->>'local_id' using errcode = '42501';
    end if;
    insert into gestlok_chat_private.sucursales(tenant_id, local_id, slug, nombre, prefijo)
    values (p_tenant, x->>'local_id', x->>'slug', btrim(x->>'nombre'), coalesce(x->>'prefijo', 'P'))
    on conflict (tenant_id, local_id) do nothing;
    n := n + 1;
  end loop;
  insert into gestlok_chat_private.auditoria(tenant_id, actor, accion, detalle)
  values (p_tenant, auth.uid(), 'empresa_habilitar', jsonb_build_object('nombre', p_nombre, 'sucursales', p_sucursales));
  return jsonb_build_object('ok', true, 'sucursales', n);
end $$;

-- Mantenimiento: conversaciones sin movimiento por 60 días se borran (los pedidos quedan, sin el chat).
create or replace function gestlok_chat_private.purgar()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_conv integer; n_lim integer;
begin
  delete from gestlok_chat_private.conversaciones where ultima_at < now() - interval '60 days';
  get diagnostics n_conv = row_count;
  delete from gestlok_chat_private.limites where ventana < now() - interval '2 days';
  get diagnostics n_lim = row_count;
  return jsonb_build_object('conversaciones', n_conv, 'limites', n_lim);
end $$;

-- Permisos de ejecución ---------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, n.nspname as esquema, p.proname as nombre
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'gestlok_chat_private')
               or (n.nspname = 'public' and (p.proname like 'gestlok\_chat\_srv\_%' or p.proname like 'gestlok\_chat\_panel\_%'
                   or p.proname like 'gestlok\_chat\_admin\_%')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.esquema = 'public' and (f.nombre like 'gestlok\_chat\_panel\_%' or f.nombre like 'gestlok\_chat\_admin\_%') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.esquema = 'public' and f.nombre like 'gestlok\_chat\_srv\_%' and exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- Borrado diario a las 04:17 (si pg_cron está disponible).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gestlok-chat-purgar';
    perform cron.schedule('gestlok-chat-purgar', '17 7 * * *', 'select gestlok_chat_private.purgar()');
  end if;
end $$;
