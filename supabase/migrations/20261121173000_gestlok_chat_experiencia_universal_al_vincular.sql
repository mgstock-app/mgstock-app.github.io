-- GESTLOK Chat es una única microapp multiempresa.
-- Todas las nuevas sucursales heredan el menú interactivo y los mismos modales.
-- No se encienden chats, no se altera información del negocio ni se modifica
-- ninguna preferencia de locales que ya atienden pedidos.
alter table gestlok_chat_private.sucursales
  alter column menu_interactivo set default true;

-- Normalización de sucursales preconfiguradas antes de que existiera el
-- default global. Por ejemplo, una empresa que aún NO habilitó su chat:
-- al publicarlo contará con buscador, menú, promociones y modales actuales.
update gestlok_chat_private.sucursales
set menu_interactivo=true
where activa=false and menu_interactivo=false;

-- Nada más: horarios, WhatsApp, tarifas, promociones, catálogo, permisos y
-- preferencias push siempre permanecen aislados por tenant_id/sucursal_id.
