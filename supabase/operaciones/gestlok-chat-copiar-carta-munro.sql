-- GESTLOK Chat · OPCIONAL: copiar la carta de «Pedidos WhatsApp» de Munro (nombre y precio) al chat de Munro.
-- Solo LEE Pedidos WhatsApp: no lo modifica. Copia los productos activos que todavía no existan en el chat.
-- Correr después de gestlok-chat-habilitar-mi-gusto.sql. Revisar la carta en el panel antes de abrir el chat.
begin;
insert into gestlok_chat_private.productos(tenant_id, sucursal_id, nombre, precio, activo, disponible)
select s.tenant_id, s.id, left(btrim(m.name), 120), m.price, true, true
from gestlok_mg_orders_private.menu_items m
join gestlok_chat_private.sucursales s on s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.local_id = 'munro'
where m.local = 'munro' and m.active and m.price > 0
on conflict (sucursal_id, nombre) do nothing;
insert into gestlok_chat_private.auditoria(tenant_id, sucursal_id, accion, detalle)
select s.tenant_id, s.id, 'carta_copiada', '{"desde":"Pedidos WhatsApp"}'
from gestlok_chat_private.sucursales s where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.local_id = 'munro';
select count(*) as productos_en_chat_munro from gestlok_chat_private.productos p
 join gestlok_chat_private.sucursales s on s.id = p.sucursal_id where s.local_id = 'munro' and s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670';
commit;
