-- Mi Gusto · GESTLOK Chat: textos para todas las casillas de Mensajes, en Munro y Don Torcuato (pedido de la dueña,
-- 20/11/2026). Quedan editables desde la Central de mensajes. Link de reseñas de Google propio de cada local.
-- «Nombre del asistente» queda vacío a propósito: el chat se presenta como «el asistente de Mi Gusto <local>».
-- Requiere las migraciones 20261120070000_gestlok_chat_resena_cierre y 20261120073000_gestlok_chat_venta_sugerida.
-- Se puede volver a correr: pisa solo estas casillas y conserva cualquier otro mensaje cargado.
begin;

update gestlok_chat_private.sucursales s set
  -- El saludo según la hora y la guía de los botones («Hacer un pedido», …) los agrega el asistente (20/11/2026).
  bienvenida = 'Le damos la bienvenida a Mi Gusto ' || s.nombre || '.',
  ia_instrucciones = 'Trate siempre al cliente de usted, con respeto, calidez y respuestas breves. Ayúdelo a armar su pedido '
    || 'con la carta y las promociones disponibles, y recomiende una promo cuando le convenga. Antes de finalizar, ofrezca '
    || 'agregar un postre o una bebida, sin insistir si no lo desea. Si consulta algo que no figura en la carta ni en la '
    || 'información del local, derive la consulta al gerente. No prometa tiempos exactos ni descuentos.',
  ia_info = 'Promociones: en los packs se pueden elegir empanadas clásicas y premium sin recargo; la diferencia de precio '
    || 'de las premium se cobra solo en la unidad suelta. Salsas para elegir en las promos: Criolla, Chimichurri, Crema de '
    || 'ajo, Barbacoa, Cheddar y American ketchup. Postres: Franui (chocolate amargo, chocolate con leche y Pink). '
    || 'Para retirar en el local alcanza con indicar el nombre. El gerente revisa y confirma cada pedido antes de prepararlo.',
  mensajes = s.mensajes || jsonb_build_object(
    'terminado_retiro', '{nombre}, su pedido ya está listo para retirar. Al llegar, solo indique su nombre.',
    'terminado_envio',  '{nombre}, su pedido está en camino 🛵',
    'rechazado',        E'Le pedimos disculpas, {nombre}. No pudimos tomar su pedido.\nMotivo: {motivo}\nSi lo desea, puede armar un nuevo pedido o escribirnos por este chat.',
    'pausado',          'En este momento no estamos tomando pedidos por este chat. Puede volver a escribirnos más tarde. ¡Gracias por elegirnos!',
    'despedida',        '¡Gracias a usted! Quedamos a su disposición para lo que necesite.',
    'sugerencia',       'Antes de finalizar, ¿desea agregar un postre o una bebida para acompañar su pedido?',
    'resena',           'Nos ayudaría mucho que nos deje su reseña en Google y nos cuente su experiencia.',
    'cierre',           '¡Gracias por elegirnos! 🥰',
    'resena_url', case s.slug when 'mi-gusto-munro' then 'https://g.page/r/CZKKTkNsZpoiEBM/review'
                              when 'mi-gusto-torcuato' then 'https://g.page/r/CT9jkvArEGhFEBM/review' end),
  version = s.version + 1, actualizada_at = now()
where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.slug in ('mi-gusto-munro', 'mi-gusto-torcuato');

select gestlok_chat_private.auditar(s.id, 'config_guardar',
  jsonb_build_object('origen', 'operacion mi-gusto-chat-mensajes-ideales-20261120', 'mensajes', s.mensajes,
    'bienvenida', s.bienvenida, 'ia_instrucciones', s.ia_instrucciones, 'ia_info', s.ia_info))
from gestlok_chat_private.sucursales s
where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.slug in ('mi-gusto-munro', 'mi-gusto-torcuato');

select s.slug, s.bienvenida, s.mensajes->>'resena_url' as link_resenas, jsonb_object_keys_count.n as mensajes_cargados
from gestlok_chat_private.sucursales s,
  lateral (select count(*) as n from jsonb_object_keys(s.mensajes)) jsonb_object_keys_count
where s.tenant_id = 'cb0dc04a-9a13-434f-a3d0-47f1d8f39670' and s.slug in ('mi-gusto-munro', 'mi-gusto-torcuato')
order by s.slug;

commit;
