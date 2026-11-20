-- Mi Gusto · GESTLOK Chat · carta de Munro y Don Torcuato (20/11/2026). Pedido de la dueña: corregir productos
-- ocultos y repetidos, y armar las promos para que el cliente elija gustos y salsas.
-- 1) Munro: borra los productos OCULTOS y SIN CATEGORÍA (copias viejas de packs, «Gratinada · …», combos y una pizza
--    repetida). Antes guarda una copia completa de cada uno en gestlok_chat_private.auditoria (accion 'producto_borrado').
-- 2) Munro: el «Pack 12» pasa a «Promociones de empanadas» (como en Torcuato) y se borra la categoría que queda vacía.
-- 3) Ambos locales: cada «Pack N empanadas + M salsa(s)» queda con sus grupos «elegir N unidades»:
--    Empanadas (clásicas y premium, todas entran sin recargo), Salsas (6) y, si lleva lata, Bebida (1 lata).
--    Las promos siguen OCULTAS: se muestran recién cuando el chat nuevo está publicado (paso aparte).
-- Repetible.
do $$
declare
  t uuid := 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
  rs record; rp record; v_emp jsonb; v_lata jsonb; v_cat_promo uuid; v_ops jsonb; n_emp int; n_sal int;
  v_salsas jsonb := jsonb_build_array(
    jsonb_build_object('id','criolla','nombre','Criolla','extra',0),
    jsonb_build_object('id','chimichurri','nombre','Chimichurri','extra',0),
    jsonb_build_object('id','crema_de_ajo','nombre','Crema de ajo','extra',0),
    jsonb_build_object('id','barbacoa','nombre','Barbacoa','extra',0),
    jsonb_build_object('id','cheddar','nombre','Cheddar','extra',0),
    jsonb_build_object('id','american_ketchup','nombre','American ketchup','extra',0));
begin
  -- 1) Copia y borrado de los ocultos sin categoría de Munro.
  insert into gestlok_chat_private.auditoria(tenant_id, sucursal_id, accion, detalle)
  select p.tenant_id, p.sucursal_id, 'producto_borrado', jsonb_build_object('motivo', 'oculto y repetido (limpieza 20/11)',
         'producto', gestlok_chat_private.producto_json(p))
    from gestlok_chat_private.productos p join gestlok_chat_private.sucursales s on s.id = p.sucursal_id
   where s.tenant_id = t and s.local_id = 'munro' and p.categoria_id is null and not p.activo;
  delete from gestlok_chat_private.productos p using gestlok_chat_private.sucursales s
   where s.id = p.sucursal_id and s.tenant_id = t and s.local_id = 'munro' and p.categoria_id is null and not p.activo;

  for rs in select * from gestlok_chat_private.sucursales where tenant_id = t and local_id in ('munro','torcuato') loop
    -- 2) Una sola categoría de promos.
    select id into v_cat_promo from gestlok_chat_private.categorias where sucursal_id = rs.id and nombre = 'Promociones de empanadas';
    if v_cat_promo is not null then
      update gestlok_chat_private.productos set categoria_id = v_cat_promo
       where sucursal_id = rs.id and nombre ilike 'Pack %' and categoria_id is distinct from v_cat_promo;
      delete from gestlok_chat_private.categorias c where c.sucursal_id = rs.id and c.nombre = 'Promociones para compartir'
         and not exists (select 1 from gestlok_chat_private.productos x where x.categoria_id = c.id);
    end if;

    -- 3) Variedades: empanadas clásicas y premium (enlazadas a su producto) y latas de la carta.
    select coalesce(jsonb_agg(jsonb_build_object('id', left(replace(gestlok_chat_private.slug(x.nombre), '-', '_'), 30),
             'nombre', x.nombre, 'extra', 0, 'producto_id', x.id) order by k.orden, x.orden, x.nombre), '[]'::jsonb)
      into v_emp
      from gestlok_chat_private.productos x join gestlok_chat_private.categorias k on k.id = x.categoria_id
     where x.sucursal_id = rs.id and x.activo and k.nombre in ('Empanadas clásicas','Empanadas premium');
    select coalesce(jsonb_agg(jsonb_build_object('id', left(replace(gestlok_chat_private.slug(x.nombre), '-', '_'), 30),
             'nombre', x.nombre, 'extra', 0, 'producto_id', x.id) order by x.orden, x.nombre), '[]'::jsonb)
      into v_lata
      from gestlok_chat_private.productos x join gestlok_chat_private.categorias k on k.id = x.categoria_id
     where x.sucursal_id = rs.id and x.activo and k.nombre = 'Bebidas' and x.nombre ilike '%lata%';

    for rp in select * from gestlok_chat_private.productos where sucursal_id = rs.id and nombre ~* '^Pack [0-9]+ empanadas' loop
      n_emp := (regexp_match(rp.nombre, '^Pack ([0-9]+) empanadas', 'i'))[1]::int;
      n_sal := coalesce((regexp_match(rp.nombre, '([0-9]+) salsas?', 'i'))[1]::int, 0);
      v_ops := jsonb_build_array(jsonb_build_object('id','empanadas','nombre','Empanadas','tipo','cantidad','total',n_emp,
                 'obligatorio',true,'valores',v_emp));
      if n_sal > 0 then
        v_ops := v_ops || jsonb_build_array(jsonb_build_object('id','salsas','nombre','Salsas','tipo','cantidad','total',n_sal,
                 'obligatorio',true,'valores',v_salsas));
      end if;
      if rp.nombre ilike '%lata%' and jsonb_array_length(v_lata) > 0 then
        v_ops := v_ops || jsonb_build_array(jsonb_build_object('id','bebida','nombre','Bebida','tipo','cantidad','total',1,
                 'obligatorio',true,'valores',v_lata));
      end if;
      update gestlok_chat_private.productos set opciones = v_ops,
        descripcion = n_emp || ' empanadas a elección (clásicas o premium)' || case when n_sal > 0 then ' y ' || n_sal || ' salsa' || case when n_sal > 1 then 's' else '' end else '' end
          || case when rp.nombre ilike '%lata%' then ' + 1 lata' else '' end || '.',
        actualizado_at = now()
       where id = rp.id;
    end loop;
  end loop;
end $$;

-- Resumen
select s.nombre as local, count(*) as productos, count(*) filter (where not p.activo) as ocultos,
       count(*) filter (where p.opciones @> '[{"tipo":"cantidad"}]') as promos_armadas
  from gestlok_chat_private.productos p join gestlok_chat_private.sucursales s on s.id = p.sucursal_id
 where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' group by s.nombre order by s.nombre;
