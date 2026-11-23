-- GESTLOK Chat · el descuento por pago en efectivo es configuración de cada local, no de la app general.
-- Antes: la base aplicaba el descuento solo con envío (regla de Mi Gusto) y el chat mostraba el precio en efectivo
-- en amarillo solo para los locales de Mi Gusto escritos en el código.
-- Ahora cada local define: descuento_efectivo_pct (0 = sin descuento, por defecto), descuento_efectivo_entrega
-- ('envio' | 'retiro' | 'ambas') y precio_efectivo_en_carta (mostrar el precio en efectivo de las promos en la carta).
-- Mi Gusto Munro y Don Torcuato quedan exactamente igual: 10 %, solo envío y precio en efectivo visible.
-- Lo cambian el dueño y la administradora desde Ajustes (el gerente no).

alter table gestlok_chat_private.sucursales
  add column if not exists descuento_efectivo_entrega text not null default 'ambas',
  add column if not exists precio_efectivo_en_carta boolean not null default false;
alter table gestlok_chat_private.sucursales drop constraint if exists sucursales_descuento_efectivo_entrega_check;
alter table gestlok_chat_private.sucursales add constraint sucursales_descuento_efectivo_entrega_check
  check (descuento_efectivo_entrega in ('envio', 'retiro', 'ambas'));

-- Personalización de Mi Gusto (dato, no código).
update gestlok_chat_private.sucursales
   set descuento_efectivo_entrega = 'envio', precio_efectivo_en_carta = true
 where slug in ('mi-gusto-munro', 'mi-gusto-torcuato');


-- sucursal_publica, srv_pedido y panel_config_guardar se ajustan en el lugar (solo el fragmento indicado); si el
-- fragmento no está tal cual, la migración se detiene sin cambiar nada. Es repetible.
do $parche$
declare d text;
begin
  d := pg_get_functiondef('gestlok_chat_private.sucursal_publica(gestlok_chat_private.sucursales)'::regprocedure);
  if position('descuento_efectivo_entrega' in d) = 0 then
    if position('''descuento_efectivo_pct'', s.descuento_efectivo_pct,' in d) = 0 then
      raise exception 'gestlok_chat_private.sucursal_publica cambió: revisar antes de aplicar';
    end if;
    d := replace(d, '''descuento_efectivo_pct'', s.descuento_efectivo_pct,',
      '''descuento_efectivo_pct'', s.descuento_efectivo_pct,
    ''descuento_efectivo_entrega'', s.descuento_efectivo_entrega, ''precio_efectivo_en_carta'', s.precio_efectivo_en_carta,');
    execute d;
  end if;

  d := pg_get_functiondef('public.gestlok_chat_srv_pedido(uuid,bytea,jsonb)'::regprocedure);
  if position('s.descuento_efectivo_entrega' in d) > 0 then
    null; -- ya aplicada (la migración es repetible)
  elsif position('v_descuento := case when v_entrega=''envio'' and v_pago=''efectivo''' in d) = 0 then
    raise exception 'gestlok_chat_srv_pedido cambió: revisar el cálculo del descuento antes de aplicar';
  else
    d := replace(d, 'v_descuento := case when v_entrega=''envio'' and v_pago=''efectivo''',
      'v_descuento := case when v_pago=''efectivo'' and s.descuento_efectivo_entrega in (''ambas'', v_entrega)');
    execute d;
  end if;

  d := pg_get_functiondef('public.gestlok_chat_panel_config_guardar(uuid,jsonb,integer)'::regprocedure);
  if position('descuento_efectivo_entrega' in d) > 0 then
    return; -- ya aplicada
  end if;
  -- Cada fragmento tiene que aparecer una sola vez.
  if (length(d) - length(replace(d, 'update gestlok_chat_private.sucursales set', ''))) <> length('update gestlok_chat_private.sucursales set')
     or (length(d) - length(replace(d, 'activa = coalesce((p_config->>''activa'')::boolean, activa),', '')))
        <> length('activa = coalesce((p_config->>''activa'')::boolean, activa),') then
    raise exception 'gestlok_chat_panel_config_guardar cambió: revisar antes de aplicar';
  end if;
  d := replace(d, 'update gestlok_chat_private.sucursales set',
    '-- Descuento por efectivo del local (dueño y administradora).
  if p_config ? ''descuento_efectivo_pct'' and (jsonb_typeof(p_config->''descuento_efectivo_pct'') <> ''number''
     or (p_config->>''descuento_efectivo_pct'')::numeric not between 0 and 50) then
    raise exception ''El descuento por pago en efectivo tiene que ser de 0 a 50 %%'' using errcode = ''22023'';
  end if;
  if p_config ? ''descuento_efectivo_entrega'' and coalesce(p_config->>''descuento_efectivo_entrega'', '''') not in (''envio'', ''retiro'', ''ambas'') then
    raise exception ''Elegí si el descuento por efectivo vale con envío, retiro o ambos'' using errcode = ''22023'';
  end if;
  update gestlok_chat_private.sucursales set');
  d := replace(d, 'activa = coalesce((p_config->>''activa'')::boolean, activa),',
    'activa = coalesce((p_config->>''activa'')::boolean, activa),
    descuento_efectivo_pct = coalesce(round((p_config->>''descuento_efectivo_pct'')::numeric, 2), descuento_efectivo_pct),
    descuento_efectivo_entrega = coalesce(p_config->>''descuento_efectivo_entrega'', descuento_efectivo_entrega),
    precio_efectivo_en_carta = coalesce((p_config->>''precio_efectivo_en_carta'')::boolean, precio_efectivo_en_carta),');
  execute d;
end $parche$;
