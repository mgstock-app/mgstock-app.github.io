-- SOLO PRUEBA (gestlok-pruebas). Aplicar en la misma ejecución que wai-riesgo-y-rubros.sql,
-- antes del bloque que agrega el control al servidor central, para no cortar la línea de ensayo
-- que ya está vinculada. Registra la aceptación de la administradora para Mi Gusto (prueba).
insert into gestlok_chat_private.wai_riesgo_aceptado(sucursal_id,aceptado_por,version)
select c.sucursal_id,(select creado_por from gestlok_chat_private.wai_servidor_central where id),'prueba-preexistente'
from gestlok_chat_private.wai_comercios c
join gestlok_chat_private.sucursales s on s.id=c.sucursal_id
join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.nombre_publico ilike '%(prueba)%'
where exists(select 1 from gestlok_chat_private.wai_servidor_central where id)
on conflict(sucursal_id) do nothing;
