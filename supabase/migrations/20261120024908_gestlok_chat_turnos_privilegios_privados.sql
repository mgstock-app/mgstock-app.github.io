-- Las funciones auxiliares del horario son privadas; las ejecutan solo las funciones autorizadas.
revoke all on function gestlok_chat_private.estado_atencion(gestlok_chat_private.sucursales,timestamp without time zone),
gestlok_chat_private.validar_programado(),gestlok_chat_private.validar_apertura_pedido()
from public,anon,authenticated,service_role;
