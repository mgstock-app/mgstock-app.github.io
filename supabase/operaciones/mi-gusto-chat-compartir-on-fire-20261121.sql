-- Mi Gusto · GESTLOK Chat · Munro y Don Torcuato (21/11/2026). Pedido de la dueña:
-- 1) «Promociones para compartir» (solo Mi Gusto, ambos locales):
--    · Promo Pareja: pizza grande ½ Muzzarella + ½ Jamón y morrón + 2 empanadas a elección · $32.900.
--    · Promo Clásica: 1 Muzzarella grande + 6 empanadas + 2 salsas a elección · $46.900.
-- 2) «Jueves On Fire · 12 empanadas + 3 salsas» · $39.500, en «Promociones de empanadas».
--    El chat la muestra SOLO el último jueves de cada mes desde las 18:00 y, en ese turno, es lo único que se ofrece
--    (el Pack 12 de $52.900 no aparece) con pago solo en efectivo. La regla está en la función del chat (motor.js,
--    carteleraDelDia): no hace falta prender ni apagar nada a mano.
-- Las empanadas y salsas se copian del «Pack 12 empanadas + 3 salsas» de cada local (mismas variedades, enlazadas a su
-- producto: si una empanada se agota, deja de ofrecerse también en estas promos). No borra ni modifica productos existentes.
-- Repetible: si ya existen, actualiza precio, descripción y opciones.
do $$
declare
  t uuid := 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
  rs record; v_pack jsonb; v_emp jsonb; v_sal jsonb; v_cat_compartir uuid; v_cat_promo uuid;
begin
  for rs in select * from gestlok_chat_private.sucursales where tenant_id = t and local_id in ('munro','torcuato') loop
    select opciones into v_pack from gestlok_chat_private.productos
     where sucursal_id = rs.id and nombre = 'Pack 12 empanadas + 3 salsas';
    if v_pack is null then raise exception 'Falta «Pack 12 empanadas + 3 salsas» en %', rs.local_id; end if;
    select g into v_emp from jsonb_array_elements(v_pack) g where g->>'id' = 'empanadas';
    select g into v_sal from jsonb_array_elements(v_pack) g where g->>'id' = 'salsas';
    if v_emp is null or v_sal is null then raise exception 'El Pack 12 de % no tiene empanadas y salsas', rs.local_id; end if;

    select id into v_cat_promo from gestlok_chat_private.categorias where sucursal_id = rs.id and nombre = 'Promociones de empanadas';
    if v_cat_promo is null then raise exception 'Falta la categoría «Promociones de empanadas» en %', rs.local_id; end if;

    insert into gestlok_chat_private.categorias(tenant_id, sucursal_id, nombre, orden, activa)
    values (rs.tenant_id, rs.id, 'Promociones para compartir', 25, true)
    on conflict (sucursal_id, nombre) do update set activa = true
    returning id into v_cat_compartir;

    insert into gestlok_chat_private.productos(tenant_id, sucursal_id, categoria_id, nombre, descripcion, precio, activo, disponible, orden, opciones)
    values
      (rs.tenant_id, rs.id, v_cat_compartir, 'Promo Pareja · ½ Muzzarella + ½ Jamón y morrón + 2 empanadas',
       'Pizza grande de 8 porciones mitad Muzzarella y mitad Jamón y morrón + 2 empanadas a elección (clásicas o premium).',
       32900, true, true, 10, jsonb_build_array(jsonb_set(v_emp, '{total}', '2'))),
      (rs.tenant_id, rs.id, v_cat_compartir, 'Promo Clásica · Muzzarella grande + 6 empanadas + 2 salsas',
       'Pizza Muzzarella grande de 8 porciones + 6 empanadas a elección (clásicas o premium) + 2 salsas a elección.',
       46900, true, true, 20, jsonb_build_array(jsonb_set(v_emp, '{total}', '6'), jsonb_set(v_sal, '{total}', '2'))),
      (rs.tenant_id, rs.id, v_cat_promo, 'Jueves On Fire · 12 empanadas + 3 salsas',
       'Último jueves de cada mes desde las 18:00. 12 empanadas a elección (clásicas o premium) + 3 salsas a elección. Pago solo en efectivo.',
       39500, true, true, 0, jsonb_build_array(v_emp, v_sal))
    on conflict (sucursal_id, nombre) do update
      set categoria_id = excluded.categoria_id, descripcion = excluded.descripcion, precio = excluded.precio,
          opciones = excluded.opciones, activo = true, disponible = true, orden = excluded.orden, actualizado_at = now();
  end loop;
end $$;

-- Control: 3 productos nuevos por local.
select s.local_id, c.nombre categoria, p.nombre, p.precio, p.activo,
       (select string_agg(g->>'nombre' || ' ' || (g->>'total'), ' + ') from jsonb_array_elements(p.opciones) g) elegir
  from gestlok_chat_private.productos p
  join gestlok_chat_private.sucursales s on s.id = p.sucursal_id
  join gestlok_chat_private.categorias c on c.id = p.categoria_id
 where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670'
   and (p.nombre like 'Promo Pareja%' or p.nombre like 'Promo Clásica%' or p.nombre like 'Jueves On Fire%')
 order by 1, 2, 3;
