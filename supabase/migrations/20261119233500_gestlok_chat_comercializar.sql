-- GESTLOK Chat · micro app general para comercializar.
-- La administradora la enciende empresa por empresa desde su panel (sin SQL); cada local queda con su propio chat
-- y su enlace, APAGADO hasta que el dueño o el gerente carguen la carta, los mensajes y los ajustes.
-- Solo agrega/reemplaza funciones de GESTLOK Chat. No toca datos ni otros módulos. Repetible.

-- Texto → enlace: «Café Lola · Centro» → «cafe-lola-centro».
create or replace function gestlok_chat_private.slug(p text)
returns text language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(regexp_replace(translate(lower(coalesce(p, '')),
    'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g'), '-'), 50)
$$;

-- Primer enlace libre a partir de una base (agrega -2, -3… si ya existe).
create or replace function gestlok_chat_private.slug_libre(p_base text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare b text := btrim(gestlok_chat_private.slug(p_base), '-'); v text; n integer := 1;
begin
  if length(b) < 3 then b := 'chat-' || coalesce(nullif(b, ''), 'local'); end if;
  v := b;
  while exists (select 1 from gestlok_chat_private.sucursales where slug = v) loop
    n := n + 1; v := left(b, 56) || '-' || n;
  end loop;
  return v;
end $$;

-- Prefijo de los números de pedido: iniciales del local («Don Torcuato» → «DT»).
create or replace function gestlok_chat_private.prefijo_de(p_nombre text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(left(upper((select string_agg(left(w, 1), '' order by o)
    from regexp_split_to_table(gestlok_chat_private.slug(p_nombre), '-') with ordinality t(w, o) where w <> '')), 3), ''), 'P')
$$;

-- Alta (o reactivación) de una empresa. Sin lista de locales = todos los locales de la empresa.
-- Cada local recibe nombre, enlace y prefijo automáticos si no se indican. Los que ya existían no cambian.
create or replace function public.gestlok_chat_admin_habilitar(p_tenant uuid, p_nombre text, p_sucursales jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare x jsonb; n integer := 0; v_lista jsonb; v_local text; v_nombre text; v_slug text; v_pref text;
begin
  perform gestlok_platform.require_admin();
  if not exists (select 1 from gestlok_tenancy.tenants where id = p_tenant) then raise exception 'Empresa inexistente' using errcode = 'P0002'; end if;
  if length(btrim(coalesce(p_nombre, ''))) not between 2 and 80 then raise exception 'Falta el nombre de la empresa' using errcode = '22023'; end if;
  if p_sucursales is not null and jsonb_typeof(p_sucursales) <> 'array' then raise exception 'Lista de locales inválida' using errcode = '22023'; end if;
  v_lista := case when p_sucursales is null or jsonb_array_length(p_sucursales) = 0 then
    (select coalesce(jsonb_agg(jsonb_build_object('local_id', d.id) order by d.id), '[]'::jsonb)
       from public.docs d where d.tenant_id = p_tenant and d.col = 'locales')
    else p_sucursales end;
  if jsonb_array_length(v_lista) = 0 then raise exception 'La empresa no tiene locales cargados' using errcode = 'P0001'; end if;

  insert into gestlok_chat_private.empresas(tenant_id, nombre_publico, creada_por) values (p_tenant, btrim(p_nombre), auth.uid())
  on conflict (tenant_id) do update set nombre_publico = excluded.nombre_publico, habilitada = true, actualizada_at = now();

  for x in select value from jsonb_array_elements(v_lista) loop
    v_local := x->>'local_id';
    select coalesce(nullif(btrim(x->>'nombre'), ''), nullif(btrim(d.data->>'nombre'), ''), d.id) into v_nombre
      from public.docs d where d.tenant_id = p_tenant and d.col = 'locales' and d.id = v_local;
    if v_nombre is null then raise exception 'El local % no pertenece a esa empresa', v_local using errcode = '42501'; end if;
    if exists (select 1 from gestlok_chat_private.sucursales where tenant_id = p_tenant and local_id = v_local) then continue; end if;
    v_slug := case when coalesce(x->>'slug', '') ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(x->>'slug') between 3 and 60
                    and not exists (select 1 from gestlok_chat_private.sucursales where slug = x->>'slug')
               then x->>'slug' else gestlok_chat_private.slug_libre(btrim(p_nombre) || '-' || v_nombre) end;
    v_pref := case when coalesce(x->>'prefijo', '') ~ '^[A-Z0-9]{1,6}$' then x->>'prefijo' else gestlok_chat_private.prefijo_de(v_nombre) end;
    insert into gestlok_chat_private.sucursales(tenant_id, local_id, slug, nombre, prefijo)
    values (p_tenant, v_local, v_slug, left(v_nombre, 80), v_pref);
    n := n + 1;
  end loop;
  insert into gestlok_chat_private.auditoria(tenant_id, actor, accion, detalle)
  values (p_tenant, auth.uid(), 'empresa_habilitar', jsonb_build_object('nombre', btrim(p_nombre), 'nuevas', n));
  return jsonb_build_object('ok', true, 'sucursales', n);
end $$;

-- Pausa o reactiva la micro app en una empresa (los datos quedan; con la empresa pausada nadie entra al chat ni al panel).
create or replace function public.gestlok_chat_admin_estado(p_tenant uuid, p_habilitada boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform gestlok_platform.require_admin();
  update gestlok_chat_private.empresas set habilitada = coalesce(p_habilitada, false), actualizada_at = now() where tenant_id = p_tenant;
  if not found then raise exception 'Esa empresa no tiene GESTLOK Chat' using errcode = 'P0002'; end if;
  insert into gestlok_chat_private.auditoria(tenant_id, actor, accion, detalle)
  values (p_tenant, auth.uid(), case when p_habilitada then 'empresa_reactivar' else 'empresa_pausar' end, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'habilitada', coalesce(p_habilitada, false));
end $$;

-- Resumen para la administradora: empresas con la micro app, sus chats y pedidos en preparación. Sin datos de clientes.
create or replace function public.gestlok_chat_admin_empresas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform gestlok_platform.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('tenant_id', e.tenant_id, 'nombre', e.nombre_publico, 'habilitada', e.habilitada,
      'sucursales', coalesce((select jsonb_agg(jsonb_build_object('local_id', s.local_id, 'nombre', s.nombre, 'slug', s.slug, 'activa', s.activa,
          'productos', (select count(*) from gestlok_chat_private.productos p where p.sucursal_id = s.id and p.activo),
          'pendientes', (select count(*) from gestlok_chat_private.pedidos p where p.sucursal_id = s.id and p.estado = 'pendiente'))
        order by s.nombre) from gestlok_chat_private.sucursales s where s.tenant_id = e.tenant_id), '[]'::jsonb))
    order by e.nombre_publico) from gestlok_chat_private.empresas e), '[]'::jsonb);
end $$;

-- La firma anterior de admin_habilitar (sin valor por defecto) queda reemplazada por la nueva.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, n.nspname as esquema, p.proname as nombre
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'gestlok_chat_private' and p.proname in ('slug','slug_libre','prefijo_de'))
               or (n.nspname = 'public' and p.proname like 'gestlok\_chat\_admin\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.esquema = 'public' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
