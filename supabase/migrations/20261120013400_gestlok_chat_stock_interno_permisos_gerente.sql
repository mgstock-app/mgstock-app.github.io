-- GESTLOK Chat: stock interno por sucursal, adicionales globales y gerentes con permisos de dueño dentro de su local.
-- Mantener cerrados los chats públicos actuales. No modifica Stock Local ni Pedidos WhatsApp.
create table if not exists gestlok_chat_private.opciones_stock (
  tenant_id uuid not null,
  sucursal_id uuid not null,
  grupo_id text not null check (grupo_id ~ '^[a-z0-9_]{1,30}$'),
  valor_id text not null check (valor_id ~ '^[a-z0-9_]{1,30}$'),
  disponible boolean not null default true,
  actualizado_at timestamptz not null default now(),
  primary key (sucursal_id, grupo_id, valor_id),
  foreign key (tenant_id, sucursal_id) references gestlok_chat_private.sucursales(tenant_id,id) on delete restrict
);
alter table gestlok_chat_private.opciones_stock enable row level security;
revoke all on gestlok_chat_private.opciones_stock from public, anon, authenticated;

-- Para el cliente se eliminan del menú las opciones agotadas, nunca los botones internos.
create or replace function gestlok_chat_private.opciones_visibles(p_sucursal uuid, p_opciones jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    jsonb_set(g.item, '{valores}', (
      select coalesce(jsonb_agg(v.item order by v.orden), '[]'::jsonb)
      from jsonb_array_elements(g.item->'valores') with ordinality v(item,orden)
      where not exists (
        select 1 from gestlok_chat_private.opciones_stock o
        where o.sucursal_id=p_sucursal and o.grupo_id=g.item->>'id' and o.valor_id=v.item->>'id'
          and not o.disponible
      )
    ), true) order by g.orden), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_opciones,'[]'::jsonb)) with ordinality g(item,orden)
  where exists (
    select 1 from jsonb_array_elements(g.item->'valores') v
    where not exists (
      select 1 from gestlok_chat_private.opciones_stock o
      where o.sucursal_id=p_sucursal and o.grupo_id=g.item->>'id' and o.valor_id=v->>'id'
        and not o.disponible
    )
  )
$$;
revoke all on function gestlok_chat_private.opciones_visibles(uuid,jsonb) from public,anon,authenticated;

-- Gerente y dueña tienen iguales permisos de GESTLOK Chat en la sucursal autorizada.
CREATE OR REPLACE FUNCTION gestlok_chat_private.nivel(p_sucursal uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_rol in ('gerente','editor') and public.puede_editar_local(v_local) then return 'configurar'; end if;
  if v_rol = 'lectura' and gestlok_platform.support_tenant() is not distinct from v_t then return 'ver'; end if;
  return null;
end $function$
;

-- El catálogo interno mantiene opciones para reactivarlas; el público ve solo las disponibles.
CREATE OR REPLACE FUNCTION gestlok_chat_private.catalogo(p_sucursal uuid, p_publico boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre,
        'orden', c.orden, 'activa', c.activa) order by c.orden, c.nombre)
      from gestlok_chat_private.categorias c
      where c.sucursal_id = p_sucursal and (not p_publico or c.activa)), '[]'::jsonb),
    'productos', coalesce((select jsonb_agg(case when p_publico
          then jsonb_set(gestlok_chat_private.producto_json(p), '{opciones}',
            gestlok_chat_private.opciones_visibles(p_sucursal, p.opciones), true)
          else gestlok_chat_private.producto_json(p) end order by p.orden, p.nombre)
      from gestlok_chat_private.productos p
      left join gestlok_chat_private.categorias c on c.id = p.categoria_id
      where p.sucursal_id = p_sucursal
        and (not p_publico or (p.activo and coalesce(c.activa, true)))), '[]'::jsonb))
$function$
;

-- Incluso si un cliente manipula el carrito, el pedido valida stock otra vez al confirmar.
CREATE OR REPLACE FUNCTION public.gestlok_chat_srv_pedido(p_conversacion uuid, p_token_hash bytea, p_pedido jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Cada sucursal define qué medios admite según retiro o delivery.
  if v_entrega = 'envio' and s.medios_pago_envio is not null
     and not (v_pago = any(s.medios_pago_envio)) then
    raise exception 'Ese medio de pago no está disponible para delivery' using errcode = '22023';
  end if;
  if v_entrega = 'retiro' and s.medios_pago_retiro is not null
     and not (v_pago = any(s.medios_pago_retiro)) then
    raise exception 'Ese medio de pago no está disponible para retiro en el local' using errcode = '22023';
  end if;

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
      -- Un adicional deshabilitado por el gerente no puede cobrarse ni enviarse.
      if exists (
        select 1 from unnest(v_ids) as elegido(id)
        join gestlok_chat_private.opciones_stock st
          on st.sucursal_id=s.id and st.grupo_id=g->>'id' and st.valor_id=elegido.id
        where not st.disponible
      ) then
        raise exception 'Un adicional de % está agotado. Volvé a revisar tu selección.', p.nombre using errcode='P0001';
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
end $function$
;

create or replace function public.gestlok_chat_panel_stock_adicionales(p_sucursal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform gestlok_chat_private.exigir(p_sucursal, 'gestionar');
  return coalesce((
    select jsonb_agg(jsonb_build_object('grupo_id',d.grupo_id,'valor_id',d.valor_id,
      'nombre',d.nombre,'extra_min',d.extra_min,'extra_max',d.extra_max,
      'disponible',coalesce(o.disponible,true)) order by d.nombre)
    from (
      select g.val->>'id' grupo_id,v.val->>'id' valor_id,max(v.val->>'nombre') nombre,
          min((v.val->>'extra')::numeric) extra_min,max((v.val->>'extra')::numeric) extra_max
      from gestlok_chat_private.productos p
      cross join lateral jsonb_array_elements(p.opciones) g(val)
      cross join lateral jsonb_array_elements(g.val->'valores') v(val)
      where p.sucursal_id=p_sucursal and p.activo
        and coalesce((g.val->>'obligatorio')::boolean,false)=false
        and (v.val->>'extra')::numeric>0
      group by g.val->>'id',v.val->>'id'
    ) d
    left join gestlok_chat_private.opciones_stock o
      on o.sucursal_id=p_sucursal and o.grupo_id=d.grupo_id and o.valor_id=d.valor_id
  ),'[]'::jsonb);
end $$;

create or replace function public.gestlok_chat_panel_stock_adicional(
  p_sucursal uuid,p_grupo text,p_valor text,p_disponible boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
  select tenant_id into t from gestlok_chat_private.sucursales where id=p_sucursal;
  if p_disponible is null or p_grupo is null or p_valor is null or not exists (
      select 1 from gestlok_chat_private.productos p
      cross join lateral jsonb_array_elements(p.opciones) g(val)
      cross join lateral jsonb_array_elements(g.val->'valores') v(val)
      where p.sucursal_id=p_sucursal and p.activo and g.val->>'id'=p_grupo
        and v.val->>'id'=p_valor and (v.val->>'extra')::numeric>0
        and coalesce((g.val->>'obligatorio')::boolean,false)=false
    ) then raise exception 'Adicional no encontrado para este local' using errcode='22023';
  end if;
  insert into gestlok_chat_private.opciones_stock(tenant_id,sucursal_id,grupo_id,valor_id,disponible)
  values(t,p_sucursal,p_grupo,p_valor,p_disponible)
  on conflict(sucursal_id,grupo_id,valor_id)
    do update set disponible=excluded.disponible,actualizado_at=now();
  perform gestlok_chat_private.auditar(p_sucursal,'adicional_stock',
    jsonb_build_object('grupo',p_grupo,'valor',p_valor,'disponible',p_disponible));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.gestlok_chat_panel_stock_categoria(
  p_sucursal uuid,p_categoria uuid,p_disponible boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare afectadas int;
begin
  perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
  if p_disponible is null or not exists (
    select 1 from gestlok_chat_private.categorias
    where id=p_categoria and sucursal_id=p_sucursal
  ) then raise exception 'Categoría no encontrada para este local' using errcode='22023'; end if;
  update gestlok_chat_private.productos
  set disponible=p_disponible,actualizado_at=now()
  where sucursal_id=p_sucursal and categoria_id=p_categoria and activo;
  get diagnostics afectadas=row_count;
  perform gestlok_chat_private.auditar(p_sucursal,'categoria_stock',
    jsonb_build_object('categoria',p_categoria,'disponible',p_disponible,'afectadas',afectadas));
  return jsonb_build_object('ok',true,'actualizadas',afectadas);
end $$;

revoke all on function public.gestlok_chat_panel_stock_adicionales(uuid),
 public.gestlok_chat_panel_stock_adicional(uuid,text,text,boolean),
 public.gestlok_chat_panel_stock_categoria(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.gestlok_chat_panel_stock_adicionales(uuid),
 public.gestlok_chat_panel_stock_adicional(uuid,text,text,boolean),
 public.gestlok_chat_panel_stock_categoria(uuid,uuid,boolean) to authenticated;
