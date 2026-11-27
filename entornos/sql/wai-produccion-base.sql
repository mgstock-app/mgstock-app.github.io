-- WAI commercial schema exported from the verified laboratory metadata only.
-- No records, QR codes, credentials, chats, catalog data or phone numbers are copied.
-- Production remains closed until the administrator provisions the central service.
set local check_function_bodies = off;
create table gestlok_chat_private."wai_adjuntos_imagen" (
  "mensaje_id" uuid not null,
  "mime" text not null,
  "contenido" bytea not null,
  "creado_at" timestamp with time zone default now() not null
);
alter table gestlok_chat_private."wai_adjuntos_imagen" enable row level security;
revoke all on gestlok_chat_private."wai_adjuntos_imagen" from public,anon,authenticated;
create table gestlok_chat_private."wai_alias_contactos" (
  "sucursal_id" uuid not null,
  "numero_clave" text not null,
  "alias" text,
  "actualizado_at" timestamp with time zone default now() not null,
  "actualizado_por" uuid not null
);
alter table gestlok_chat_private."wai_alias_contactos" enable row level security;
revoke all on gestlok_chat_private."wai_alias_contactos" from public,anon,authenticated;
create table gestlok_chat_private."wai_atencion_config" (
  "sucursal_id" uuid not null,
  "pregunta" text not null,
  "opciones" jsonb not null,
  "bienvenida_auto" boolean default false not null,
  "pedidos" boolean default true not null,
  "actualizado_at" timestamp with time zone default now() not null,
  "agente_activo" boolean default false not null,
  "seguimiento_min" integer default 2 not null,
  "cierre_auto" boolean default false not null,
  "cierre_min" integer default 15 not null
);
alter table gestlok_chat_private."wai_atencion_config" enable row level security;
revoke all on gestlok_chat_private."wai_atencion_config" from public,anon,authenticated;
create table gestlok_chat_private."wai_atencion_hilos" (
  "hilo_id" uuid not null,
  "manual" boolean default false not null,
  "pendiente" boolean default false not null,
  "actualizado_at" timestamp with time zone default now() not null,
  "ciclo_id" uuid,
  "modalidad" text,
  "espera_modalidad" boolean default false not null,
  "pedido_solicitado_at" timestamp with time zone,
  "pedido_texto" text,
  "ultima_carta" text,
  "ficha" jsonb
);
alter table gestlok_chat_private."wai_atencion_hilos" enable row level security;
revoke all on gestlok_chat_private."wai_atencion_hilos" from public,anon,authenticated;
create table gestlok_chat_private."wai_carta_paginas" (
  "sucursal_id" uuid not null,
  "clave" text not null,
  "titulo" text not null,
  "imagen_url" text not null,
  "orden" integer default 0 not null,
  "categorias" text[] default '{}'::text[] not null,
  "detalle_clave" text,
  "detalle_grupo" text,
  "productos_nombres" text[] default '{}'::text[] not null
);
alter table gestlok_chat_private."wai_carta_paginas" enable row level security;
revoke all on gestlok_chat_private."wai_carta_paginas" from public,anon,authenticated;
create table gestlok_chat_private."wai_ciclos" (
  "id" uuid default gen_random_uuid() not null,
  "hilo_id" uuid not null,
  "inicio_at" timestamp with time zone default clock_timestamp() not null,
  "cerrado_at" timestamp with time zone,
  "motivo" text,
  "aviso_cierre" text
);
alter table gestlok_chat_private."wai_ciclos" enable row level security;
revoke all on gestlok_chat_private."wai_ciclos" from public,anon,authenticated;
create table gestlok_chat_private."wai_comercios" (
  "sucursal_id" uuid not null,
  "rubro" text not null,
  "activo" boolean default true not null,
  "actualizado_at" timestamp with time zone default clock_timestamp() not null,
  "actualizado_por" uuid
);
alter table gestlok_chat_private."wai_comercios" enable row level security;
revoke all on gestlok_chat_private."wai_comercios" from public,anon,authenticated;
create table gestlok_chat_private."wai_lecturas" (
  "usuario_id" uuid not null,
  "mensaje_id" uuid not null,
  "leido_at" timestamp with time zone default now() not null
);
alter table gestlok_chat_private."wai_lecturas" enable row level security;
revoke all on gestlok_chat_private."wai_lecturas" from public,anon,authenticated;
create table gestlok_chat_private."wai_mensajes" (
  "id" uuid default gen_random_uuid() not null,
  "piloto_id" uuid not null,
  "direccion" text not null,
  "texto" text not null,
  "evento" text,
  "jid" text,
  "estado" text not null,
  "creado_at" timestamp with time zone default now() not null,
  "reservado_at" timestamp with time zone,
  "creado_por" uuid,
  "wa_id" text,
  "wa_ruta" text,
  "entregado_at" timestamp with time zone,
  "editado_at" timestamp with time zone,
  "eliminado_at" timestamp with time zone,
  "accion_tipo" text,
  "accion_texto" text,
  "accion_estado" text,
  "accion_solicitada_at" timestamp with time zone,
  "accion_reservada_at" timestamp with time zone,
  "wa_accion_id" text,
  "accion_entregada_at" timestamp with time zone,
  "origen" text,
  "interaccion" jsonb,
  "opcion_elegida" text,
  "opcion_at" timestamp with time zone,
  "opcion_respuesta_at" timestamp with time zone,
  "cancelada_at" timestamp with time zone,
  "agente_procesado_at" timestamp with time zone,
  "ciclo_id" uuid,
  "imagen_url" text,
  "continuar_carta" jsonb,
  "continuar_texto" text,
  "adjunto_estado" text
);
alter table gestlok_chat_private."wai_mensajes" enable row level security;
revoke all on gestlok_chat_private."wai_mensajes" from public,anon,authenticated;
create table gestlok_chat_private."wai_menu_accesos" (
  "id" uuid default gen_random_uuid() not null,
  "piloto_id" uuid not null,
  "ciclo_id" uuid not null,
  "evento" text not null,
  "creado_at" timestamp with time zone default now() not null,
  "referencia" uuid,
  "ficha" jsonb,
  "usado_at" timestamp with time zone
);
alter table gestlok_chat_private."wai_menu_accesos" enable row level security;
revoke all on gestlok_chat_private."wai_menu_accesos" from public,anon,authenticated;
create table gestlok_chat_private."wai_nombres_agenda" (
  "habilitacion_id" uuid not null,
  "numero_clave" text not null,
  "nombre" text not null,
  "sincronizado_at" timestamp with time zone default now() not null
);
alter table gestlok_chat_private."wai_nombres_agenda" enable row level security;
revoke all on gestlok_chat_private."wai_nombres_agenda" from public,anon,authenticated;
create table gestlok_chat_private."wai_pedidos" (
  "id" uuid default gen_random_uuid() not null,
  "hilo_id" uuid not null,
  "piloto_id" uuid not null,
  "modalidad" text not null,
  "estado" text default 'preparacion'::text not null,
  "demora_min" integer not null,
  "creado_at" timestamp with time zone default now() not null,
  "actualizado_at" timestamp with time zone default now() not null,
  "consulta_at" timestamp with time zone,
  "consulta_enviada_at" timestamp with time zone,
  "token_hash" text,
  "valoracion" text,
  "valorado_at" timestamp with time zone,
  "respuesta_encolada_at" timestamp with time zone,
  "resuelto_at" timestamp with time zone,
  "detalle" text,
  "foto" text,
  "detalles_at" timestamp with time zone,
  "revision_evento" uuid not null,
  "ciclo_id" uuid,
  "consulta_cancelada_at" timestamp with time zone,
  "ficha" jsonb,
  "resena_enlace" text,
  "atencion_finalizada_at" timestamp with time zone
);
alter table gestlok_chat_private."wai_pedidos" enable row level security;
revoke all on gestlok_chat_private."wai_pedidos" from public,anon,authenticated;
create table gestlok_chat_private."wai_piloto_entorno" (
  "id" boolean default true not null,
  "habilitado" boolean default false not null
);
alter table gestlok_chat_private."wai_piloto_entorno" enable row level security;
revoke all on gestlok_chat_private."wai_piloto_entorno" from public,anon,authenticated;
create table gestlok_chat_private."wai_pilotos" (
  "id" uuid default gen_random_uuid() not null,
  "habilitacion_id" uuid not null,
  "sucursal_id" uuid not null,
  "tester" text not null,
  "creado_at" timestamp with time zone default now() not null,
  "vence_at" timestamp with time zone default (now() + '06:00:00'::interval) not null,
  "creado_por" uuid not null,
  "cancelado" boolean default false not null,
  "alerta_sync" text,
  "alerta_sync_at" timestamp with time zone,
  "entrada_automatica" boolean default false not null
);
alter table gestlok_chat_private."wai_pilotos" enable row level security;
revoke all on gestlok_chat_private."wai_pilotos" from public,anon,authenticated;
create table gestlok_chat_private."wai_programaciones" (
  "ciclo_id" uuid not null,
  "estado" text not null,
  "apertura" timestamp with time zone not null,
  "pregunta_evento" text not null,
  "entrada_id" uuid not null,
  "actualizado_at" timestamp with time zone default clock_timestamp() not null
);
alter table gestlok_chat_private."wai_programaciones" enable row level security;
revoke all on gestlok_chat_private."wai_programaciones" from public,anon,authenticated;
create table gestlok_chat_private."wai_recepcion_prueba" (
  "habilitacion_id" uuid not null,
  "activo" boolean default false not null,
  "desde" timestamp with time zone default clock_timestamp() not null,
  "actualizado_por" uuid not null
);
alter table gestlok_chat_private."wai_recepcion_prueba" enable row level security;
revoke all on gestlok_chat_private."wai_recepcion_prueba" from public,anon,authenticated;
create table gestlok_chat_private."wai_salsa_adicional" (
  "tenant_id" uuid not null,
  "precio" numeric(12,2) not null,
  "grupo_id" text not null
);
alter table gestlok_chat_private."wai_salsa_adicional" enable row level security;
revoke all on gestlok_chat_private."wai_salsa_adicional" from public,anon,authenticated;
create table gestlok_chat_private."wai_servidor_central" (
  "id" boolean default true not null,
  "clave_hash" text not null,
  "creado_por" uuid not null,
  "creado_at" timestamp with time zone default clock_timestamp() not null,
  "instancia" uuid,
  "senal_at" timestamp with time zone,
  "vence_at" timestamp with time zone
);
alter table gestlok_chat_private."wai_servidor_central" enable row level security;
revoke all on gestlok_chat_private."wai_servidor_central" from public,anon,authenticated;
create table gestlok_chat_private."wai_sesiones" (
  "habilitacion_id" uuid not null,
  "clave_hash" text not null,
  "revision" uuid default gen_random_uuid() not null,
  "orden" text default 'reconectar'::text not null,
  "solicitada_at" timestamp with time zone default now() not null,
  "senal_at" timestamp with time zone,
  "estado" text default 'sin_senal'::text not null,
  "qr" text,
  "qr_vence" timestamp with time zone,
  "wa_verificada_at" timestamp with time zone,
  "opciones_at" timestamp with time zone,
  "imagenes_at" timestamp with time zone,
  "salsas_at" timestamp with time zone,
  "multi_at" timestamp with time zone,
  "multi_revision" uuid,
  "central_instancia" uuid
);
alter table gestlok_chat_private."wai_sesiones" enable row level security;
revoke all on gestlok_chat_private."wai_sesiones" from public,anon,authenticated;
alter table gestlok_chat_private."wai_adjuntos_imagen" add constraint "wai_adjuntos_imagen_pkey" PRIMARY KEY (mensaje_id);
alter table gestlok_chat_private."wai_alias_contactos" add constraint "wai_alias_contactos_pkey" PRIMARY KEY (sucursal_id, numero_clave);
alter table gestlok_chat_private."wai_atencion_config" add constraint "wai_atencion_config_pkey" PRIMARY KEY (sucursal_id);
alter table gestlok_chat_private."wai_atencion_hilos" add constraint "wai_atencion_hilos_pkey" PRIMARY KEY (hilo_id);
alter table gestlok_chat_private."wai_carta_paginas" add constraint "wai_carta_paginas_pkey" PRIMARY KEY (sucursal_id, clave);
alter table gestlok_chat_private."wai_ciclos" add constraint "wai_ciclos_pkey" PRIMARY KEY (id);
alter table gestlok_chat_private."wai_comercios" add constraint "wai_comercios_pkey" PRIMARY KEY (sucursal_id);
alter table gestlok_chat_private."wai_lecturas" add constraint "wai_lecturas_pkey" PRIMARY KEY (usuario_id, mensaje_id);
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_pkey" PRIMARY KEY (id);
alter table gestlok_chat_private."wai_menu_accesos" add constraint "wai_menu_accesos_pkey" PRIMARY KEY (id);
alter table gestlok_chat_private."wai_nombres_agenda" add constraint "wai_nombres_agenda_pkey" PRIMARY KEY (habilitacion_id, numero_clave);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_pkey" PRIMARY KEY (id);
alter table gestlok_chat_private."wai_piloto_entorno" add constraint "wai_piloto_entorno_pkey" PRIMARY KEY (id);
alter table gestlok_chat_private."wai_pilotos" add constraint "wai_pilotos_pkey" PRIMARY KEY (id);
alter table gestlok_chat_private."wai_programaciones" add constraint "wai_programaciones_pkey" PRIMARY KEY (ciclo_id);
alter table gestlok_chat_private."wai_recepcion_prueba" add constraint "wai_recepcion_prueba_pkey" PRIMARY KEY (habilitacion_id);
alter table gestlok_chat_private."wai_salsa_adicional" add constraint "wai_salsa_adicional_pkey" PRIMARY KEY (tenant_id);
alter table gestlok_chat_private."wai_servidor_central" add constraint "wai_servidor_central_pkey" PRIMARY KEY (id);
alter table gestlok_chat_private."wai_sesiones" add constraint "wai_sesiones_pkey" PRIMARY KEY (habilitacion_id);
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_piloto_id_direccion_evento_key" UNIQUE (piloto_id, direccion, evento);
alter table gestlok_chat_private."wai_menu_accesos" add constraint "wai_menu_accesos_piloto_id_evento_key" UNIQUE (piloto_id, evento);
alter table gestlok_chat_private."wai_menu_accesos" add constraint "wai_menu_accesos_referencia_key" UNIQUE (referencia);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_revision_evento_key" UNIQUE (revision_evento);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_token_hash_key" UNIQUE (token_hash);
alter table gestlok_chat_private."wai_adjuntos_imagen" add constraint "wai_adjuntos_imagen_contenido_check" CHECK (octet_length(contenido) >= 12 AND octet_length(contenido) <= 2097152);
alter table gestlok_chat_private."wai_adjuntos_imagen" add constraint "wai_adjuntos_imagen_mime_check" CHECK (mime = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]));
alter table gestlok_chat_private."wai_alias_contactos" add constraint "wai_alias_contactos_alias_check" CHECK (alias IS NULL OR length(btrim(alias)) >= 1 AND length(btrim(alias)) <= 100);
alter table gestlok_chat_private."wai_atencion_config" add constraint "wai_atencion_config_cierre_min_check" CHECK (cierre_min >= 1 AND cierre_min <= 1440);
alter table gestlok_chat_private."wai_atencion_config" add constraint "wai_atencion_config_pregunta_check" CHECK (length(pregunta) >= 2 AND length(pregunta) <= 120);
alter table gestlok_chat_private."wai_atencion_config" add constraint "wai_atencion_config_seguimiento_min_check" CHECK (seguimiento_min >= 1 AND seguimiento_min <= 20);
alter table gestlok_chat_private."wai_atencion_hilos" add constraint "wai_atencion_hilos_modalidad_check" CHECK (modalidad = ANY (ARRAY['retiro'::text, 'delivery'::text]));
alter table gestlok_chat_private."wai_carta_paginas" add constraint "wai_carta_paginas_clave_check" CHECK (clave ~ '^[a-z0-9_]{1,34}$'::text);
alter table gestlok_chat_private."wai_carta_paginas" add constraint "wai_carta_paginas_imagen_url_check" CHECK (length(imagen_url) <= 1500);
alter table gestlok_chat_private."wai_carta_paginas" add constraint "wai_carta_paginas_titulo_check" CHECK (length(titulo) >= 1 AND length(titulo) <= 60);
alter table gestlok_chat_private."wai_ciclos" add constraint "wai_ciclos_motivo_check" CHECK (motivo = ANY (ARRAY['manual'::text, 'inactividad'::text, 'resena'::text]));
alter table gestlok_chat_private."wai_comercios" add constraint "wai_comercios_rubro_check" CHECK (rubro = 'gastronomia'::text);
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_adjunto_estado_check" CHECK (adjunto_estado = ANY (ARRAY['imagen'::text, 'no_disponible'::text]));
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_direccion_check" CHECK (direccion = ANY (ARRAY['entrada'::text, 'salida'::text]));
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_estado_check" CHECK (estado = ANY (ARRAY['recibido'::text, 'pendiente'::text, 'reservado'::text, 'aceptado'::text, 'incierto'::text]));
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_origen_check" CHECK (origen = ANY (ARRAY['telefono'::text, 'wai'::text]));
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_texto_check" CHECK (length(btrim(texto)) >= 1 AND length(btrim(texto)) <= 1000);
alter table gestlok_chat_private."wai_nombres_agenda" add constraint "wai_nombres_agenda_nombre_check" CHECK (length(btrim(nombre)) >= 1 AND length(btrim(nombre)) <= 100);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_demora_min_check" CHECK (demora_min >= 1 AND demora_min <= 20);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_detalle_check" CHECK (length(detalle) <= 1000);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_estado_check" CHECK (estado = ANY (ARRAY['preparacion'::text, 'listo'::text, 'en_camino'::text, 'entregado'::text]));
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_foto_check" CHECK (length(foto) <= 400000);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_modalidad_check" CHECK (modalidad = ANY (ARRAY['retiro'::text, 'delivery'::text]));
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_valoracion_check" CHECK (valoracion = ANY (ARRAY['bien'::text, 'problema'::text]));
alter table gestlok_chat_private."wai_piloto_entorno" add constraint "wai_piloto_entorno_id_check" CHECK (id);
alter table gestlok_chat_private."wai_pilotos" add constraint "wai_pilotos_check" CHECK (vence_at > creado_at AND vence_at <= (creado_at + '06:00:00'::interval));
alter table gestlok_chat_private."wai_pilotos" add constraint "wai_pilotos_tester_check" CHECK (tester ~ '^\+[1-9][0-9]{7,14}$'::text);
alter table gestlok_chat_private."wai_programaciones" add constraint "wai_programaciones_estado_check" CHECK (estado = ANY (ARRAY['ofrecido'::text, 'aceptado'::text, 'rechazado'::text, 'completado'::text]));
alter table gestlok_chat_private."wai_salsa_adicional" add constraint "wai_salsa_adicional_grupo_id_check" CHECK (grupo_id ~ '^[a-z0-9_]{1,30}$'::text);
alter table gestlok_chat_private."wai_salsa_adicional" add constraint "wai_salsa_adicional_precio_check" CHECK (precio > 0::numeric AND precio < 1000000::numeric);
alter table gestlok_chat_private."wai_servidor_central" add constraint "wai_servidor_central_check" CHECK (instancia IS NULL AND vence_at IS NULL OR instancia IS NOT NULL AND vence_at IS NOT NULL);
alter table gestlok_chat_private."wai_servidor_central" add constraint "wai_servidor_central_clave_hash_check" CHECK (clave_hash ~ '^[a-f0-9]{64}$'::text);
alter table gestlok_chat_private."wai_servidor_central" add constraint "wai_servidor_central_id_check" CHECK (id);
alter table gestlok_chat_private."wai_sesiones" add constraint "wai_sesiones_estado_check" CHECK (estado = ANY (ARRAY['sin_senal'::text, 'conectado'::text, 'reconectando'::text, 'qr'::text, 'desconectado'::text]));
alter table gestlok_chat_private."wai_sesiones" add constraint "wai_sesiones_orden_check" CHECK (orden = ANY (ARRAY['reconectar'::text, 'qr'::text, 'qr_forzado'::text]));
alter table gestlok_chat_private."wai_sesiones" add constraint "wai_sesiones_qr_check" CHECK (length(qr) <= 2048);
alter table gestlok_chat_private."wai_adjuntos_imagen" add constraint "wai_adjuntos_imagen_mensaje_id_fkey" FOREIGN KEY (mensaje_id) REFERENCES gestlok_chat_private.wai_mensajes(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_alias_contactos" add constraint "wai_alias_contactos_sucursal_id_fkey" FOREIGN KEY (sucursal_id) REFERENCES gestlok_chat_private.sucursales(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_atencion_config" add constraint "wai_atencion_config_sucursal_id_fkey" FOREIGN KEY (sucursal_id) REFERENCES gestlok_chat_private.sucursales(id);
alter table gestlok_chat_private."wai_atencion_hilos" add constraint "wai_atencion_hilos_hilo_id_fkey" FOREIGN KEY (hilo_id) REFERENCES gestlok_chat_private.wai_pilotos(id);
alter table gestlok_chat_private."wai_carta_paginas" add constraint "wai_carta_paginas_sucursal_id_fkey" FOREIGN KEY (sucursal_id) REFERENCES gestlok_chat_private.sucursales(id);
alter table gestlok_chat_private."wai_ciclos" add constraint "wai_ciclos_hilo_id_fkey" FOREIGN KEY (hilo_id) REFERENCES gestlok_chat_private.wai_pilotos(id);
alter table gestlok_chat_private."wai_comercios" add constraint "wai_comercios_sucursal_id_fkey" FOREIGN KEY (sucursal_id) REFERENCES gestlok_chat_private.sucursales(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_lecturas" add constraint "wai_lecturas_mensaje_id_fkey" FOREIGN KEY (mensaje_id) REFERENCES gestlok_chat_private.wai_mensajes(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_mensajes" add constraint "wai_mensajes_piloto_id_fkey" FOREIGN KEY (piloto_id) REFERENCES gestlok_chat_private.wai_pilotos(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_menu_accesos" add constraint "wai_menu_accesos_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES gestlok_chat_private.wai_ciclos(id);
alter table gestlok_chat_private."wai_menu_accesos" add constraint "wai_menu_accesos_piloto_id_fkey" FOREIGN KEY (piloto_id) REFERENCES gestlok_chat_private.wai_pilotos(id);
alter table gestlok_chat_private."wai_nombres_agenda" add constraint "wai_nombres_agenda_habilitacion_id_fkey" FOREIGN KEY (habilitacion_id) REFERENCES gestlok_chat_private.whatsapp_premium_habilitaciones(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES gestlok_chat_private.wai_ciclos(id);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_hilo_id_fkey" FOREIGN KEY (hilo_id) REFERENCES gestlok_chat_private.wai_pilotos(id);
alter table gestlok_chat_private."wai_pedidos" add constraint "wai_pedidos_piloto_id_fkey" FOREIGN KEY (piloto_id) REFERENCES gestlok_chat_private.wai_pilotos(id);
alter table gestlok_chat_private."wai_pilotos" add constraint "wai_pilotos_habilitacion_id_fkey" FOREIGN KEY (habilitacion_id) REFERENCES gestlok_chat_private.whatsapp_premium_habilitaciones(id) ON DELETE RESTRICT;
alter table gestlok_chat_private."wai_pilotos" add constraint "wai_pilotos_sucursal_id_fkey" FOREIGN KEY (sucursal_id) REFERENCES gestlok_chat_private.sucursales(id) ON DELETE RESTRICT;
alter table gestlok_chat_private."wai_programaciones" add constraint "wai_programaciones_ciclo_id_fkey" FOREIGN KEY (ciclo_id) REFERENCES gestlok_chat_private.wai_ciclos(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_programaciones" add constraint "wai_programaciones_entrada_id_fkey" FOREIGN KEY (entrada_id) REFERENCES gestlok_chat_private.wai_mensajes(id) ON DELETE CASCADE;
alter table gestlok_chat_private."wai_recepcion_prueba" add constraint "wai_recepcion_prueba_habilitacion_id_fkey" FOREIGN KEY (habilitacion_id) REFERENCES gestlok_chat_private.whatsapp_premium_habilitaciones(id);
alter table gestlok_chat_private."wai_salsa_adicional" add constraint "wai_salsa_adicional_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES gestlok_chat_private.empresas(tenant_id);
alter table gestlok_chat_private."wai_sesiones" add constraint "wai_sesiones_habilitacion_id_fkey" FOREIGN KEY (habilitacion_id) REFERENCES gestlok_chat_private.whatsapp_premium_habilitaciones(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX wai_ciclos_abierto ON gestlok_chat_private.wai_ciclos USING btree (hilo_id) WHERE (cerrado_at IS NULL);
CREATE INDEX wai_mensajes_piloto_idx ON gestlok_chat_private.wai_mensajes USING btree (piloto_id, creado_at);
CREATE UNIQUE INDEX wai_mensajes_wa_id_idx ON gestlok_chat_private.wai_mensajes USING btree (piloto_id, wa_id) WHERE (wa_id IS NOT NULL);
CREATE INDEX wai_pedidos_hilo_idx ON gestlok_chat_private.wai_pedidos USING btree (hilo_id, creado_at DESC);
CREATE INDEX wai_pedidos_piloto_idx ON gestlok_chat_private.wai_pedidos USING btree (piloto_id, consulta_at);
CREATE INDEX wai_pilotos_linea_idx ON gestlok_chat_private.wai_pilotos USING btree (habilitacion_id, vence_at DESC);
insert into gestlok_chat_private.wai_piloto_entorno(id,habilitado) values(true,false);

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_agente_poll(p gestlok_chat_private.wai_pilotos, e text, pregunta text, opciones jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ok boolean; t text;
begin
 t=pregunta||chr(10)||(select string_agg('• '||(v->>'label'),chr(10)) from jsonb_array_elements(opciones) v);
 ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,t);
 if ok then update gestlok_chat_private.wai_mensajes set interaccion=jsonb_build_object('tipo','agente','pregunta',pregunta,'opciones',opciones) where piloto_id=p.id and evento=e and direccion='salida' and estado='pendiente' and interaccion is null;end if;
 return ok;
end$function$;
revoke all on function gestlok_chat_private.wai_agente_poll(p gestlok_chat_private.wai_pilotos, e text, pregunta text, opciones jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_agente_tick(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_atencion_hilos%rowtype; s gestlok_chat_private.sucursales%rowtype; m gestlok_chat_private.wai_mensajes%rowtype;
 c jsonb; t text; n text; opciones jsonb; respuesta text; pregunta text; e text; ok boolean; modo text; handoff boolean; paginas jsonb; pagina jsonb; pedido boolean; pagina_id text; n_paginas int; reciente gestlok_chat_private.wai_pedidos%rowtype;
begin
 c=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);
 if not (c->>'agente_activo')::boolean then return;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p);
 if not found or a.manual or a.ciclo_id is null or not exists(select 1 from gestlok_chat_private.wai_ciclos where id=a.ciclo_id and cerrado_at is null) then return;end if;
 if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.hilo_id and valoracion='problema' and resuelto_at is null) then return;end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 paginas=gestlok_chat_private.wai_menu_paginas(s.id);n_paginas=jsonb_array_length(paginas);
 -- Incoming events are processed once, in order, only for the current authorized trial and cycle.
 for m in select x.* from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.ciclo_id=a.ciclo_id and x.direccion='entrada' and x.jid is not null and x.agente_procesado_at is null and x.evento not like 'pedido:%' and x.evento not like 'voto:%' order by x.creado_at,x.id for update loop
  select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.hilo_id;
  if m.evento like 'agente-voto:%:reciente_problema' then
   if gestlok_chat_private.wai_postventa_texto(p,m.id,'Tuve un problema') then perform gestlok_chat_private.wai_pedido_tick(p);exit;end if;
  end if;
  if (c->>'pedidos')::boolean then
   begin
    if gestlok_chat_private.wai_fuera_horario(p,m) or gestlok_chat_private.wai_pedido_guiado(p,m) then
     update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=m.id;
     if exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.hilo_id and manual) then exit;end if;
     continue;
    end if;
   exception when raise_exception then
    -- A quota or failed enqueue must not advance the draft.
    exit;
   end;
  end if;
  t=translate(lower(btrim(m.texto)),'áéíóúü','aeiouu'); e='agente:'||m.id; respuesta=null; pregunta=null; opciones=null; handoff=false;
  modo=gestlok_chat_private.wai_modalidad(m.texto);
  pagina=null;pedido=gestlok_chat_private.wai_pedido_texto(s.id,m.texto,a.modalidad);
  pagina_id=case when m.evento like 'agente-voto:%:carta_%' then split_part(m.evento,':',3) end;
  select * into reciente from gestlok_chat_private.wai_pedido_reciente(p);
  if reciente.id is not null and a.ficha is null and (m.evento like 'agente-voto:%:reciente_humano' or t in ('atencion al cliente','selecciono: atencion al cliente')) then
   respuesta='Claro, te paso con una persona del comercio para ayudarte.';handoff=true;
  elsif reciente.id is not null and a.ficha is null and t ~ '^(hola|buen[ao]s? (dias|tardes|noches)|buenas|hey|holaa+)[ !.]*$' and not exists(select 1 from gestlok_chat_private.wai_mensajes x where x.ciclo_id=a.ciclo_id and x.direccion='entrada' and x.id<>m.id and x.agente_procesado_at is not null and x.creado_at>coalesce(reciente.atencion_finalizada_at,reciente.creado_at)) then
   pregunta='¡Hola de nuevo! ¿En qué podemos ayudarte?';
   opciones='[{"id":"pedido","label":"Hacer otro pedido"},{"id":"reciente_humano","label":"Atención al cliente"},{"id":"reciente_problema","label":"Tuve un problema"}]'::jsonb;
  elsif a.ficha is null and a.ultima_carta is null and n_paginas>0 and (m.evento like 'agente-voto:%:pedido' or t ~ '^(quiero |quisiera )?(hacer (un |otro )?pedido|pedir|otro pedido)$') then
   if n_paginas=1 then pagina=paginas->0;else pregunta='¿Qué te gustaría pedir?';select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) into opciones from (select v from jsonb_array_elements(paginas) v limit 6) q;end if;
  elsif pagina_id is not null then
   select v into pagina from jsonb_array_elements(paginas) v where v->>'id'=pagina_id;
   if pagina is null then respuesta='La carta cambió. Escribí Menú para consultar las opciones vigentes.';end if;
  elsif t ~ '\m(persona|gerente|humano|reclamo|problema|queja|operador)\M' then
   respuesta='Te paso con una persona del comercio para que pueda ayudarte.';handoff=true;
  elsif pedido and a.modalidad is not null and (c->>'pedidos')::boolean then
   respuesta=left('Anoté tu solicitud: '||m.texto||'. El local la va a revisar y confirmar. Te avisamos por acá cuando esté en preparación.',1000);
  elsif modo is not null and (c->>'pedidos')::boolean then
   if (modo='retiro' and s.acepta_retiro) or (modo='delivery' and s.acepta_envio) then
    respuesta=case modo when 'retiro' then 'Perfecto, retiro en el local.' else 'Perfecto, delivery. Enviame tu dirección.' end||case when a.pedido_solicitado_at is not null then ' Ya tenemos tu solicitud, el local la va a confirmar.' else ' Contame qué productos o servicios necesitás. El comercio confirmará tu solicitud.' end;
   else respuesta='Esa modalidad no está disponible. Te paso con una persona para ayudarte.';handoff=true;end if;
  elsif t ~ '\m(delivery|envio|domicilio)\M' then
   respuesta=case when s.acepta_envio then 'Contamos con delivery.'||case when length(btrim(s.envio_zona))>0 then ' Zona: '||s.envio_zona else '' end||' Costo configurado: $'||s.envio_costo::text||'.' else 'El comercio no tiene delivery habilitado.' end;
  elsif t ~ '\m(horario|horarios|abierto|abren|cierran|ubicacion|direccion|donde)\M' then
   respuesta=concat_ws(chr(10),nullif('Horarios: '||nullif(s.horario,''),''),nullif('Ubicación: '||nullif(s.direccion,''),''));
   if respuesta='' then respuesta='El comercio todavía no cargó este dato. Te paso con una persona.';handoff=true;end if;
  elsif n_paginas>0 and m.evento not like 'agente-voto:%:catalogo_texto' and (m.evento like 'agente-voto:%:menu_mas' or t ~ '\m(menu|carta|catalogo|productos|servicios|precios|promociones|promos|sabores)\M' or exists(select 1 from jsonb_array_elements(paginas) v where length(gestlok_chat_private.wai_normalizar(v->>'label'))>3 and strpos(t,gestlok_chat_private.wai_normalizar(v->>'label'))>0)) then
   if n_paginas=1 then pagina=paginas->0;
   else
    pregunta='Elegí qué parte de la carta querés ver';
    select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) into opciones from (select v from jsonb_array_elements(paginas) v limit 6) q;
   end if;
  elsif t ~ '\m(menu|carta|catalogo|productos|servicios|precios)\M' then
   -- Only the current business's active, available catalog; no fabricated items or prices.
   select string_agg(v,chr(10)) into respuesta from (select '• '||pr.nombre||' — $'||pr.precio::text as v from gestlok_chat_private.productos pr left join gestlok_chat_private.categorias cat on cat.id=pr.categoria_id where pr.sucursal_id=s.id and pr.activo and pr.disponible and coalesce(cat.activa,true) order by pr.orden,pr.nombre limit 12) q;
   if respuesta is null then respuesta='El catálogo todavía no tiene productos disponibles. Te paso con una persona.';handoff=true;
   else respuesta=left('Productos y servicios disponibles (selección):'||chr(10)||respuesta||chr(10)||'Contame qué buscás y el comercio te confirma disponibilidad.',1000);end if;
  elsif (c->>'pedidos')::boolean and a.modalidad is not null and (m.evento like 'agente-voto:%:pedido' or t ~ '^(quiero |quisiera )?(hacer un pedido|pedir)$') and a.pedido_solicitado_at is null then
   respuesta='¿Qué te gustaría pedir? Escribí la cantidad y los productos.';
  elsif (c->>'pedidos')::boolean and a.modalidad is not null and t ~ '\m(pedido|pedir|quiero|quisiera|comprar|encargar)\M' then
   respuesta='Ya tenemos registrada tu modalidad. El comercio confirmará tu pedido y los detalles.';handoff=true;
  elsif (c->>'pedidos')::boolean and (t ~ '\m(pedido|pedir|quiero|quisiera|comprar|encargar)\M' or a.espera_modalidad or pedido) then
   opciones='[]'::jsonb;
   if s.acepta_retiro then opciones=opciones||'[{"id":"retiro","label":"Retiro en el local"}]'::jsonb;end if;
   if s.acepta_envio then opciones=opciones||'[{"id":"delivery","label":"Delivery"}]'::jsonb;end if;
   opciones=opciones||'[{"id":"humano","label":"Hablar con una persona"}]'::jsonb;
   pregunta='¿Cómo querés recibir tu pedido?';
  elsif t ~ '^(hola|buen[ao]s? (dias|tardes|noches)|buenas|hey|holaa+)[ !.]*$' then
   pregunta='¡Hola! ¿En qué podemos ayudarte?';
   opciones='[{"id":"catalogo","label":"Ver productos o servicios"},{"id":"horario","label":"Horarios y ubicación"}]'::jsonb;
   if (c->>'pedidos')::boolean then opciones=opciones||'[{"id":"pedido","label":"Hacer un pedido"}]'::jsonb;end if;
   opciones=opciones||'[{"id":"humano","label":"Hablar con una persona"}]'::jsonb;
  elsif reciente.id is not null and a.ficha is null and not exists(select 1 from gestlok_chat_private.wai_mensajes x where x.ciclo_id=a.ciclo_id and x.direccion='entrada' and x.id<>m.id and x.agente_procesado_at is not null and x.creado_at>coalesce(reciente.atencion_finalizada_at,reciente.creado_at)) then
   pregunta='¡Hola de nuevo! ¿En qué podemos ayudarte?';
   opciones='[{"id":"pedido","label":"Hacer otro pedido"},{"id":"reciente_humano","label":"Atención al cliente"},{"id":"reciente_problema","label":"Tuve un problema"}]'::jsonb;
  else
   respuesta='Gracias por escribirnos. Una persona del comercio va a revisar tu consulta para responderte correctamente.';handoff=true;
  end if;
  if pagina is not null then ok=gestlok_chat_private.wai_encolar_foto(p,e,pagina);
  elsif pregunta is not null then ok=gestlok_chat_private.wai_agente_poll(p,e,pregunta,opciones);
  else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,respuesta);end if;
  if not ok then exit;end if;
  update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=m.id;
  if pregunta='¿Cómo querés recibir tu pedido?' then update gestlok_chat_private.wai_atencion_hilos set espera_modalidad=true where hilo_id=a.hilo_id;end if;
  if handoff then update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where piloto_id=p.id and ciclo_id=a.ciclo_id and direccion='entrada' and agente_procesado_at is null;update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;exit;end if;
 end loop;
end$function$;
revoke all on function gestlok_chat_private.wai_agente_tick(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_asignar_ciclo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h uuid;
begin
 if new.ciclo_id is null then
  select gestlok_chat_private.wai_hilo(p) into h from gestlok_chat_private.wai_pilotos p where p.id=new.piloto_id;
  select a.ciclo_id into new.ciclo_id from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and ci.cerrado_at is null;
 end if;
 return new;
end$function$;
revoke all on function gestlok_chat_private.wai_asignar_ciclo() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_atencion_ajustes(p_sucursal uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce((select jsonb_build_object('pregunta',c.pregunta,'opciones',c.opciones,'bienvenida_auto',c.bienvenida_auto,'pedidos',c.pedidos,'agente_activo',c.agente_activo,'seguimiento_min',c.seguimiento_min,'cierre_auto',c.cierre_auto,'cierre_min',c.cierre_min) from gestlok_chat_private.wai_atencion_config c where c.sucursal_id=p_sucursal),
 '{"pregunta":"¿En qué podemos ayudarte?","opciones":[{"id":"op1","label":"Consultar productos o servicios","respuesta":"","humano":true},{"id":"op2","label":"Consultar horarios y ubicación","respuesta":"","humano":true},{"id":"op3","label":"Hablar con una persona","respuesta":"","humano":true}],"bienvenida_auto":false,"pedidos":true,"agente_activo":false,"seguimiento_min":2,"cierre_auto":false,"cierre_min":15}'::jsonb)
$function$;
revoke all on function gestlok_chat_private.wai_atencion_ajustes(p_sucursal uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_atencion_tick(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c jsonb;h uuid;manual boolean;m gestlok_chat_private.wai_mensajes%rowtype;o jsonb;
begin
 h=gestlok_chat_private.wai_hilo(p);
 manual=coalesce((select a.manual from gestlok_chat_private.wai_atencion_hilos a where a.hilo_id=h),false);
 c=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);
 if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=h and ci.cerrado_at is not null) then return;end if;
 -- Explicit opt-in only, once per authorized trial. Never a broadcast.
 if not manual and not (c->>'agente_activo')::boolean and (c->>'bienvenida_auto')::boolean and exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='entrada' and x.jid is not null and x.interaccion is null)
  and not exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.interaccion->>'tipo'='menu') then
  perform gestlok_chat_private.wai_encolar_menu(p,'menu:auto:'||p.id,c);
 end if;
 for m in select x.* from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.interaccion->>'tipo'='menu' and x.opcion_elegida is not null and x.opcion_respuesta_at is null and (x.ciclo_id is null or exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=x.ciclo_id and ci.cerrado_at is null)) for update loop
  select v into o from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=m.opcion_elegida;
  if manual or (o->>'humano')::boolean then
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual,pendiente) values(h,true,true)
    on conflict(hilo_id) do update set manual=true,pendiente=true,actualizado_at=now();
   update gestlok_chat_private.wai_mensajes set opcion_respuesta_at=now() where id=m.id;
   manual=true;
  elsif gestlok_chat_private.wai_pedido_encolar(p.id,'menu:respuesta:'||m.id,o->>'respuesta') then
   update gestlok_chat_private.wai_mensajes set opcion_respuesta_at=now() where id=m.id;
  end if;
 end loop;
end$function$;
revoke all on function gestlok_chat_private.wai_atencion_tick(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_guardar(f jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select (f-ARRAY['producto','producto_id','precio','grupos','grupo','parcial','selecciones','extras','extra_tipo','desde','subtotal','envio','total','demora','pago','efectivo_recibido','cambio']) || jsonb_build_object('carrito',gestlok_chat_private.wai_carrito_lineas(f),'extras','[]'::jsonb,'selecciones','[]'::jsonb)
$function$;
revoke all on function gestlok_chat_private.wai_carrito_guardar(f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_lineas(f jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select coalesce(f->'carrito','[]'::jsonb) || case when f->>'producto_id' is not null
 then jsonb_build_array(jsonb_build_object('producto',f->'producto','producto_id',f->'producto_id','precio',f->'precio','grupos',f->'grupos','selecciones',f->'selecciones','extras',f->'extras','carta',f->'carta')) else '[]'::jsonb end
$function$;
revoke all on function gestlok_chat_private.wai_carrito_lineas(f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_mostrar(p gestlok_chat_private.wai_pilotos, e text, f jsonb, cotizar boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare resumen text; item jsonb; k int:=0; linea text; fin text; opciones jsonb;
begin
 resumen=gestlok_chat_private.wai_carrito_resumen(f);
 if length(resumen)<=800 then
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':resumen','Tu carrito:'||chr(10)||resumen||chr(10)||'Subtotal: '||gestlok_chat_private.wai_importe(gestlok_chat_private.wai_carrito_subtotal(f))) then return false;end if;
  update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':resumen' and estado='pendiente';
 else
  -- Do not truncate order details even when the summary exceeds the transport limit.
  while length(resumen)>0 loop
   k=k+1;linea=left(resumen,850);resumen=substr(resumen,length(linea)+1);
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':linea:'||k,'Tu carrito · parte '||k||chr(10)||linea) then return false;end if;
   update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':linea:'||k and estado='pendiente';
  end loop;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':subtotal','Subtotal: '||gestlok_chat_private.wai_importe(gestlok_chat_private.wai_carrito_subtotal(f))) then return false;end if;
  update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':subtotal' and estado='pendiente';
 end if;
 if cotizar then
  fin='Total: '||gestlok_chat_private.wai_importe((f->>'total')::numeric)||case when f->>'modalidad'='delivery' then ' con envío incluido ('||gestlok_chat_private.wai_importe((f->>'envio')::numeric)||')' else ' · Retiro en el local' end||case when f->>'programado_para' is not null then '. Programado para el '||gestlok_chat_private.wai_fecha_programada((f->>'programado_para')::timestamptz)||'. Demora desde la apertura: ' else '. Demora aproximada: ' end||(f->>'demora')||'. Pago: '||replace(f->>'pago','_',' ')||'.';
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':total',fin) then return false;end if;
  update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e||':total' and estado='pendiente';
  opciones='[{"id":"fc_confirmar","label":"Confirmar mi pedido"},{"id":"fc_editar","label":"Modificar pedido"},{"id":"fc_cancelar","label":"Cancelar pedido"}]';
 else
  opciones=case when jsonb_array_length(gestlok_chat_private.wai_carrito_lineas(f))>0 then '[{"id":"fc_datos","label":"Continuar con el pedido"},{"id":"fc_quitar","label":"Quitar un producto"}]'::jsonb else '[]'::jsonb end
  ||case when jsonb_array_length(gestlok_chat_private.wai_carrito_lineas(f))<5 then '[{"id":"fc_agregar","label":"Agregar otro producto"}]'::jsonb else '[]'::jsonb end||'[{"id":"fc_cancelar","label":"Cancelar pedido"}]'::jsonb;
 end if;
 if not gestlok_chat_private.wai_agente_poll(p,e,case when cotizar then '¿Confirmás este pedido?' else '¿Cómo querés continuar?' end,opciones) then return false;end if;
 update gestlok_chat_private.wai_mensajes set creado_at=clock_timestamp() where piloto_id=p.id and evento=e and estado='pendiente';
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_carrito_mostrar(p gestlok_chat_private.wai_pilotos, e text, f jsonb, cotizar boolean) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_paginas(s uuid, desde integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with q as (select clave,titulo from gestlok_chat_private.wai_carta_paginas w where w.sucursal_id=s and exists(select 1 from gestlok_chat_private.wai_ofertas(s,'carta_'||w.clave))
 order by w.orden,w.clave offset greatest(desde,0) limit 5)
 select coalesce((select jsonb_agg(jsonb_build_object('id','cc_'||clave,'label',left(titulo,60))) from (select * from q limit 4) v),'[]'::jsonb)
 ||case when (select count(*) from q)>4 then '[{"id":"cc_mas","label":"Más categorías"}]'::jsonb else '[]'::jsonb end
 ||'[{"id":"cc_volver","label":"Volver al carrito"}]'::jsonb
$function$;
revoke all on function gestlok_chat_private.wai_carrito_paginas(s uuid, desde integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_resumen(f jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(string_agg(i::text||'. '||(l->>'producto')||' · '||gestlok_chat_private.wai_importe((l->>'precio')::numeric)
  ||coalesce((select chr(10)||string_agg((g->>'grupo')||': '||(select string_agg((v->>'cantidad')||' × '||(v->>'nombre'),', ') from jsonb_array_elements(g->'valores') v),chr(10)) from jsonb_array_elements(coalesce(l->'selecciones','[]')) g),'')
  ||coalesce((select chr(10)||'Adicionales: '||string_agg((x->>'nombre')||' ('||gestlok_chat_private.wai_importe((x->>'precio')::numeric)||')',', ') from jsonb_array_elements(coalesce(l->'extras','[]')) x),''),
  chr(10)||chr(10) order by i),'Carrito vacío')
 from jsonb_array_elements(gestlok_chat_private.wai_carrito_lineas(f)) with ordinality as a(l,i)
$function$;
revoke all on function gestlok_chat_private.wai_carrito_resumen(f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_subtotal(f jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select coalesce(sum((l->>'precio')::numeric
  +coalesce((select sum((z->>'cantidad')::int*(z->>'extra')::numeric) from jsonb_array_elements(coalesce(l->'selecciones','[]')) g cross join lateral jsonb_array_elements(g->'valores') z),0)
  +coalesce((select sum((z->>'precio')::numeric) from jsonb_array_elements(coalesce(l->'extras','[]')) z),0)),0)
 from jsonb_array_elements(gestlok_chat_private.wai_carrito_lineas(f)) l
$function$;
revoke all on function gestlok_chat_private.wai_carrito_subtotal(f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_carrito_vigente(p gestlok_chat_private.wai_pilotos, f jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare l jsonb; g jsonb; z jsonb; v jsonb; x record; obligatorios jsonb; requerido jsonb; suma int;
begin
 if jsonb_array_length(gestlok_chat_private.wai_carrito_lineas(f)) not between 1 and 5 then return false;end if;
 for l in select value from jsonb_array_elements(gestlok_chat_private.wai_carrito_lineas(f)) loop
  select * into x from gestlok_chat_private.wai_ofertas(p.sucursal_id,l->>'carta') o where o.id::text=l->>'producto_id';
  if not found or x.precio is distinct from (l->>'precio')::numeric then return false;end if;
  select coalesce(jsonb_agg(a),'[]'::jsonb) into obligatorios from jsonb_array_elements(x.opciones) a where coalesce((a->>'obligatorio')::boolean,false);
  if obligatorios is distinct from l->'grupos' or jsonb_array_length(obligatorios)<>jsonb_array_length(l->'selecciones') then return false;end if;
  for g in select value from jsonb_array_elements(l->'selecciones') loop
   select a into requerido from jsonb_array_elements(obligatorios) a where a->>'nombre'=g->>'grupo';
   select coalesce(sum((a->>'cantidad')::int),0) into suma from jsonb_array_elements(g->'valores') a;
   if requerido is null or suma is distinct from (case when requerido->>'tipo'='cantidad' then (requerido->>'total')::int when requerido->>'tipo'='una' then 1 else null end) then return false;end if;
   for z in select value from jsonb_array_elements(g->'valores') loop
    select a into v from jsonb_array_elements(obligatorios) b cross join lateral jsonb_array_elements(b->'valores') a where b->>'nombre'=g->>'grupo' and a->>'id'=z->>'id' limit 1;
    if v is null or (z->>'cantidad')::int<1 or coalesce((v->>'extra')::numeric,0) is distinct from (z->>'extra')::numeric then return false;end if;
    if v->>'producto_id' is not null and not exists(select 1 from gestlok_chat_private.productos q join gestlok_chat_private.categorias c on c.id=q.categoria_id where q.id::text=v->>'producto_id' and q.sucursal_id=p.sucursal_id and q.activo and q.disponible and c.activa) then return false;end if;
   end loop;
  end loop;
  for z in select value from jsonb_array_elements(l->'extras') loop
   if z->>'id' like 'salsa_extra:%' then
    if gestlok_chat_private.wai_salsa_precio(p,l) is distinct from (z->>'precio')::numeric or not exists(select 1 from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,l),'[]')) a where a->>'id'=split_part(z->>'id',':',2)) then return false;end if;
   elsif not exists(select 1 from gestlok_chat_private.productos q join gestlok_chat_private.categorias c on c.id=q.categoria_id where q.id::text=z->>'id' and q.sucursal_id=p.sucursal_id and q.activo and q.disponible and c.activa and q.precio=(z->>'precio')::numeric) then return false;end if;
  end loop;
 end loop;
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_carrito_vigente(p gestlok_chat_private.wai_pilotos, f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_central_lineas()
 RETURNS TABLE(id uuid, numero text, sucursal uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select h.id,h.numero,s.id from gestlok_chat_private.whatsapp_premium_habilitaciones h
 join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
 join public.docs d on d.tenant_id=h.tenant_id and d.id=h.local_id and d.col='locales'
 where h.habilitada and e.nombre_publico ilike '%(prueba)%'
 and gestlok_chat_private.wai_rubro_activo(s.id)
$function$;
revoke all on function gestlok_chat_private.wai_central_lineas() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_cerrar_hilo(h uuid, motivo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_atencion_hilos%rowtype;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=h for update;
 if not found or a.ciclo_id is null or not exists(select 1 from gestlok_chat_private.wai_ciclos where id=a.ciclo_id and cerrado_at is null) then return false;end if;
 -- The review has ended preparation attention, not the customer's conversation.
 if coalesce(gestlok_chat_private.wai_postventa_hasta(h,a.ciclo_id)>clock_timestamp(),false) then return false;end if;
 if a.pendiente or a.pedido_solicitado_at is not null or exists(select 1 from gestlok_chat_private.wai_pedidos o where o.hilo_id=h and (o.estado<>'entregado' and o.atencion_finalizada_at is null and o.creado_at>clock_timestamp()-interval '4 hours' or o.valoracion='problema' and o.resuelto_at is null)) then return false;end if;
 update gestlok_chat_private.wai_ciclos set cerrado_at=clock_timestamp(),motivo=wai_cerrar_hilo.motivo where id=a.ciclo_id and cerrado_at is null;
 update gestlok_chat_private.wai_mensajes set cancelada_at=clock_timestamp() where ciclo_id=a.ciclo_id and estado='pendiente' and cancelada_at is null and (evento like 'agente:%' or evento like 'menu:auto:%' or evento like 'menu:respuesta:%');
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_cerrar_hilo(h uuid, motivo text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_cerrar_tras_resena(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o gestlok_chat_private.wai_pedidos%rowtype; a gestlok_chat_private.wai_atencion_hilos%rowtype; aviso timestamptz;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 if not found then return;end if;
 for o in select * from gestlok_chat_private.wai_pedidos x where x.hilo_id=a.hilo_id and x.ciclo_id=a.ciclo_id and x.atencion_finalizada_at is null and x.creado_at>now()-interval '4 hours' order by x.creado_at for update loop
  select max(coalesce(m.reservado_at,m.creado_at)) into aviso from gestlok_chat_private.wai_mensajes m where m.estado='aceptado' and m.cancelada_at is null and (
   m.evento='pedido:'||o.id||':resena' or m.evento='pedido:'||o.id||':preparacion' and (not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) or strpos(m.texto,o.resena_enlace)>0));
  if aviso is null then
   if o.piloto_id=p.id and gestlok_chat_private.url_resena_valida(o.resena_enlace) and exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento='pedido:'||o.id||':preparacion' and m.estado='aceptado') and not gestlok_chat_private.wai_resena_invitar(p,o) then
    update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;
   end if;
   continue;
  end if;
  update gestlok_chat_private.wai_pedidos set atencion_finalizada_at=clock_timestamp(),consulta_at=null,consulta_cancelada_at=coalesce(consulta_cancelada_at,now()),actualizado_at=now() where id=o.id;
  -- Keep this cycle open for after-sales. Preserve the confirmed order in
  -- wai_pedidos; clear only the completed draft so a new request is independent.
  if not a.pendiente and not a.manual and coalesce(a.ficha->>'estado','confirmado')='confirmado' then
   update gestlok_chat_private.wai_atencion_hilos
   set ficha=null,modalidad=null,espera_modalidad=false,ultima_carta=null,pedido_solicitado_at=null,pedido_texto=null,actualizado_at=clock_timestamp()
   where hilo_id=a.hilo_id and ciclo_id=a.ciclo_id;
   update gestlok_chat_private.wai_programaciones set estado='completado',actualizado_at=clock_timestamp() where ciclo_id=a.ciclo_id and estado='aceptado';
  end if;
 end loop;
end$function$;
revoke all on function gestlok_chat_private.wai_cerrar_tras_resena(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_ciclo_entrada(p gestlok_chat_private.wai_pilotos, m uuid, modo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h uuid; c uuid; t text; s gestlok_chat_private.sucursales%rowtype;
begin
 h=gestlok_chat_private.wai_hilo(p);
 select a.ciclo_id into c from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and ci.cerrado_at is null;
 if c is null then
  insert into gestlok_chat_private.wai_ciclos(hilo_id) values(h) returning id into c;
  insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,ciclo_id,manual,pendiente,modalidad,espera_modalidad,actualizado_at) values(h,c,false,false,null,false,clock_timestamp())
  on conflict(hilo_id) do update set ciclo_id=excluded.ciclo_id,manual=false,pendiente=false,modalidad=null,espera_modalidad=false,pedido_solicitado_at=null,pedido_texto=null,ficha=null,ultima_carta=null,actualizado_at=clock_timestamp();
 end if;
 select texto into t from gestlok_chat_private.wai_mensajes where id=m;
 if modo is null then modo=gestlok_chat_private.wai_modalidad(t);end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 update gestlok_chat_private.wai_mensajes set ciclo_id=c where id=m;
 if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=h and ficha is not null) and ((modo='retiro' and s.acepta_retiro) or (modo='delivery' and s.acepta_envio)) then
  update gestlok_chat_private.wai_atencion_hilos set modalidad=modo,espera_modalidad=false,actualizado_at=clock_timestamp() where hilo_id=h;
 end if;
 -- Persist a draft even when a manager has manually taken the conversation.
 if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos where hilo_id=h and ficha is not null) and (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'pedidos')::boolean and gestlok_chat_private.wai_pedido_texto(p.sucursal_id,t,coalesce(modo,(select a.modalidad from gestlok_chat_private.wai_atencion_hilos a where a.hilo_id=h))) then
  update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=clock_timestamp(),pedido_texto=left(concat_ws(' · ',nullif(pedido_texto,''),t),500),actualizado_at=clock_timestamp() where hilo_id=h;
 end if;
end$function$;
revoke all on function gestlok_chat_private.wai_ciclo_entrada(p gestlok_chat_private.wai_pilotos, m uuid, modo text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_cierre_tick(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h uuid; c jsonb; ultimo timestamptz; pos timestamptz; estado_hilo gestlok_chat_private.wai_atencion_hilos;
begin
 h=gestlok_chat_private.wai_hilo(p); c=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);

 select greatest(max(m.creado_at),a.actualizado_at,ci.inicio_at) into ultimo
 from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id and ci.cerrado_at is null
 left join gestlok_chat_private.wai_mensajes m on m.ciclo_id=ci.id and m.cancelada_at is null
 where a.hilo_id=h group by a.actualizado_at,ci.inicio_at;
 select * into estado_hilo from gestlok_chat_private.wai_atencion_hilos where hilo_id=h;
 pos=gestlok_chat_private.wai_postventa_hasta(h,estado_hilo.ciclo_id);
 if pos is not null then
  if pos>clock_timestamp() then return;end if;
  -- New baskets, pending orders and complaints are never discarded by the old timer.
  if estado_hilo.ficha is null or estado_hilo.ficha->>'estado' in ('confirmado','cancelado') then
   perform gestlok_chat_private.wai_cerrar_hilo(h,'inactividad'); return;
  end if;
 end if;
 if ultimo is not null and ultimo<=clock_timestamp()-interval '4 hours' then perform gestlok_chat_private.wai_cerrar_hilo(h,'inactividad');end if;
end$function$;
revoke all on function gestlok_chat_private.wai_cierre_tick(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_encolar_foto(p gestlok_chat_private.wai_pilotos, e text, pagina jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare u text; t text; ok boolean; paginas jsonb; opciones jsonb; cfg jsonb;
begin
 u=pagina->>'url';if not gestlok_chat_private.wai_imagen_permitida(p.sucursal_id,u) then return false;end if;
 update gestlok_chat_private.wai_atencion_hilos set ultima_carta=pagina->>'id' where hilo_id=gestlok_chat_private.wai_hilo(p);
 t=left('Carta: '||(pagina->>'label'),1000);
 paginas=gestlok_chat_private.wai_menu_paginas(p.sucursal_id);
 cfg=gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id);
 opciones=case when jsonb_array_length(paginas)>1 then jsonb_build_array(jsonb_build_object('id','menu_mas','label',case when exists(select 1 from jsonb_array_elements(paginas) v where lower(v->>'label') like '%promo%') then 'Ver otras promociones' else 'Ver otras opciones de la carta' end)) else '[{"id":"catalogo_texto","label":"Ver productos y precios"}]'::jsonb end;
 if (cfg->>'pedidos')::boolean then opciones=opciones||'[{"id":"pedido","label":"Hacer un pedido"}]'::jsonb;else opciones=opciones||'[{"id":"humano","label":"Hablar con una persona"}]'::jsonb;end if;
 if not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.imagenes_at>now()-interval '30 seconds' and w.imagenes_at>=w.solicitada_at) then
  ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,t||chr(10)||u);
  if ok then update gestlok_chat_private.wai_mensajes set continuar_carta=opciones where piloto_id=p.id and direccion='salida' and evento=e and estado='pendiente';end if;
  return ok;
 end if;
 ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,t);
 if ok then update gestlok_chat_private.wai_mensajes set imagen_url=u,continuar_carta=opciones where piloto_id=p.id and direccion='salida' and evento=e and estado='pendiente' and imagen_url is null;end if;
 return ok;
end$function$;
revoke all on function gestlok_chat_private.wai_encolar_foto(p gestlok_chat_private.wai_pilotos, e text, pagina jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_encolar_menu(p gestlok_chat_private.wai_pilotos, p_evento text, c jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare texto text;
begin
 texto=(c->>'pregunta')||chr(10)||(select string_agg('• '||(x->>'label'),chr(10)) from jsonb_array_elements(c->'opciones') x);
 if not gestlok_chat_private.wai_pedido_encolar(p.id,p_evento,texto) then return false;end if;
 update gestlok_chat_private.wai_mensajes set interaccion=jsonb_build_object('tipo','menu','pregunta',c->>'pregunta','opciones',c->'opciones') where piloto_id=p.id and direccion='salida' and evento=p_evento and estado='pendiente' and interaccion is null;
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_encolar_menu(p gestlok_chat_private.wai_pilotos, p_evento text, c jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_extras_opciones(p gestlok_chat_private.wai_pilotos, f jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select '[{"id":"f_bebidas","label":"Agregar bebida"},{"id":"f_postres","label":"Agregar postre"}]'::jsonb ||
 case when gestlok_chat_private.wai_salsa_precio(p,f) is not null then jsonb_build_array(jsonb_build_object('id','f_salsa','label','Salsa adicional · '||gestlok_chat_private.wai_importe(gestlok_chat_private.wai_salsa_precio(p,f))||' c/u')) else '[]'::jsonb end ||
 case when jsonb_array_length(coalesce(f->'carrito','[]'))<4 then '[{"id":"f_otro","label":"Agregar otro producto"}]'::jsonb else '[]'::jsonb end ||
 '[{"id":"f_sin","label":"Terminar de elegir"}]'::jsonb
$function$;
revoke all on function gestlok_chat_private.wai_extras_opciones(p gestlok_chat_private.wai_pilotos, f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_fecha_programada(t timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select to_char(t at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY "a las" HH24:MI')
$function$;
revoke all on function gestlok_chat_private.wai_fecha_programada(t timestamp with time zone) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_ficha_avanzar(p gestlok_chat_private.wai_pilotos, e text, f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare g jsonb; vs jsonb; q int; k int; foto text; pregunta text; opts jsonb; ok boolean; v jsonb;
begin
 k=coalesce((f->>'grupo')::int,0);
 g=f->'grupos'->k;
 if g is null then
  f=f||jsonb_build_object('estado','extras','grupo',k,'parcial','[]'::jsonb);
  ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Querés agregar algo más?',gestlok_chat_private.wai_extras_opciones(p,f));
 else
  q=case when g->>'tipo'='cantidad' then (g->>'total')::int when g->>'tipo'='una' then 1 else null end;
  vs=g->'valores';
  if q is null or q<1 or q>30 or jsonb_array_length(vs)<1 then
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Una persona del comercio te ayudará a completar las opciones de este producto.');
   f=f||jsonb_build_object('estado','revision');
  else
   f=f||jsonb_build_object('estado','grupo','parcial','[]'::jsonb);
   pregunta='Elegí '||q||' de '||(g->>'nombre')||'. Ej.: '||q||' de '||(vs->0->>'nombre')||'. También podés escribir CARTA.';
   select d.imagen_url into foto from gestlok_chat_private.wai_carta_paginas c join gestlok_chat_private.wai_carta_paginas d on d.sucursal_id=c.sucursal_id and d.clave=c.detalle_clave where c.sucursal_id=p.sucursal_id and 'carta_'||c.clave=f->>'carta' and c.detalle_grupo=g->>'id';
   if foto is not null and gestlok_chat_private.wai_imagen_permitida(p.sucursal_id,foto) and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.imagenes_at>now()-interval '30 seconds' and w.imagenes_at>=w.solicitada_at) then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Carta de '||(g->>'nombre'));
    if ok then update gestlok_chat_private.wai_mensajes set imagen_url=foto,continuar_texto=left(pregunta,1000) where piloto_id=p.id and evento=e and estado='pendiente';end if;
   elsif g->>'id'='salsas' and q>1 then
    -- WhatsApp supports at most 12 distinct choices. Each flavor has a 1×
    -- and 2× entry. Combine both for 3×; exact written quantities also work
    -- for all quantities, including 4×/5× of the same sauce.
    if jsonb_array_length(vs) between 2 and 6 and q<=5 and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.salsas_at>now()-interval '30 seconds' and w.salsas_at>=w.solicitada_at) then
     select jsonb_agg(jsonb_build_object('id','sm_'||cnt||'_'||i,'label',left(cnt||' × '||(x->>'nombre'),60),'cantidad',cnt,'sabor',x->>'id','nombre',x->>'nombre') order by cnt,i) into opts from jsonb_array_elements(vs) with ordinality as a(x,i) cross join generate_series(1,2) cnt;
     pregunta='Elegí exactamente '||q||' salsas. Marcá las cantidades en esta encuesta; también podés escribirlas en el chat.';
     ok=gestlok_chat_private.wai_agente_poll(p,e,pregunta,opts);
     if ok then update gestlok_chat_private.wai_mensajes set interaccion=interaccion||jsonb_build_object('tipo','salsas','multiple',true,'cantidad',q,'opciones',opts) where piloto_id=p.id and evento=e and estado='pendiente';end if;
    else
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,left('Elegí exactamente '||q||' salsas. Escribí los gustos y cantidades en un solo mensaje (por ejemplo: '||q||' de '||(vs->0->>'nombre')||'). Opciones: '||(select string_agg(x->>'nombre',', ') from jsonb_array_elements(vs) x),1000));
    end if;
   elsif jsonb_array_length(vs) between 2 and 6 then
    select jsonb_agg(jsonb_build_object('id','g_'||(x->>'id'),'label',left(x->>'nombre',60))) into opts from jsonb_array_elements(vs) x;
    ok=gestlok_chat_private.wai_agente_poll(p,e,case when g->>'id'='salsas' then 'Salsas incluidas en el pack: elegí 1 de '||q else 'Elegí '||(g->>'nombre')||' (1 de '||q||')' end,opts);
   else
    ok=gestlok_chat_private.wai_menu_invitar(p,e,'Elegí los gustos y cantidades en la carta:');
    if not ok then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,pregunta);end if;
   end if;
  end if;
 end if;
 if not ok then return null;end if;
 return f||jsonb_build_object('espera',e);
end$function$;
revoke all on function gestlok_chat_private.wai_ficha_avanzar(p gestlok_chat_private.wai_pilotos, e text, f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_ficha_opciones(s uuid, carta text, extra text, desde integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with q as (select * from gestlok_chat_private.wai_ofertas(s,carta,extra) offset desde limit 6), primeras as (select * from q limit 5)
 select coalesce((select jsonb_agg(jsonb_build_object('id','of_'||replace(id::text,'-',''),'label',left(nombre,60-length(gestlok_chat_private.wai_importe(precio))-3)||' · '||gestlok_chat_private.wai_importe(precio))) from primeras),'[]'::jsonb)
 ||case when (select count(*) from q)>5 then '[{"id":"f_mas","label":"Ver más opciones"}]'::jsonb when extra is not null then '[{"id":"f_volver","label":"No agregar"}]'::jsonb else '[{"id":"f_volver","label":"Volver a las promociones"}]'::jsonb end
$function$;
revoke all on function gestlok_chat_private.wai_ficha_opciones(s uuid, carta text, extra text, desde integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_fuera_horario(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_atencion_hilos; s gestlok_chat_private.sucursales; z gestlok_chat_private.wai_programaciones; original gestlok_chat_private.wai_mensajes;
 v jsonb; apertura timestamptz; texto text; horario text; e text:='agente:'||m.id||':horario'; n text:=gestlok_chat_private.wai_normalizar(m.texto); voto text; si boolean; no boolean; f jsonb; existe boolean; actual text;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 if not found or a.ciclo_id is null or a.manual or a.ficha->>'estado' in ('pendiente','revision') then return false;end if;
 -- A return greeting after purchase presents support/reorder shortcuts, even while closed.
 if a.ficha is null and n ~ '^(hola|buen[ao]s? (dias|tardes|noches)|buenas|hey|holaa+)[ !.]*$' and (gestlok_chat_private.wai_pedido_reciente(p)).id is not null then return false;end if;
 -- Do not intercept complaints or human support, including a recent order.
 if n ~ '\m(problema|reclamo|queja|gerente|humano|persona)\M' or m.evento like 'agente-voto:%:reciente_%' then return false;end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 v=gestlok_chat_private.estado_atencion(s);
 select * into z from gestlok_chat_private.wai_programaciones where ciclo_id=a.ciclo_id for update;
 existe=found;
 if m.evento like 'agente-voto:%:programar_%' then
  voto=split_part(m.evento,':',3);
  select evento into actual from gestlok_chat_private.wai_mensajes where id::text=split_part(m.evento,':',2) and piloto_id=p.id;
  if not existe or z.estado<>'ofrecido' or actual is distinct from z.pregunta_evento then return true;end if;
 end if;
 if existe and z.estado='ofrecido' then
  si=coalesce(voto='programar_si',false) or n in ('si','si quiero','si programar','programar','dejar pedido','si, programar pedido','si programar pedido');
  no=coalesce(voto='programar_no',false) or n in ('no','no gracias','ahora no','no por ahora');
  if no then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias por escribirnos! Te esperamos cuando abramos.') then raise exception 'No se pudo responder';end if;
   update gestlok_chat_private.wai_programaciones set estado='rechazado',actualizado_at=clock_timestamp() where ciclo_id=a.ciclo_id;
   update gestlok_chat_private.wai_atencion_hilos set ficha=null,modalidad=null,espera_modalidad=false,pedido_solicitado_at=null,pedido_texto=null,pendiente=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
   return true;
  end if;
 else si=false;end if;
 if coalesce((v->>'habilitado')::boolean,false) and not coalesce((v->>'abierto')::boolean,false) then
  apertura=(v->>'proxima_apertura')::timestamptz;
  if apertura is null then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'Ahora estamos cerrados. El comercio todavía no indicó su próxima apertura. Una persona revisará tu mensaje.') then raise exception 'No se pudo responder';end if;
   update gestlok_chat_private.wai_atencion_hilos set manual=true,pendiente=true where hilo_id=a.hilo_id;
   return true;
  end if;
  if existe and z.estado='aceptado' and z.apertura=apertura then return false;end if;
  if not si or z.apertura is distinct from apertura then
   select string_agg(case d when 1 then 'Lun' when 2 then 'Mar' when 3 then 'Mié' when 4 then 'Jue' when 5 then 'Vie' when 6 then 'Sáb' when 7 then 'Dom' end,', ' order by d) into horario from unnest(s.dias_apertura) d;
   select coalesce(horario||' · ','')||string_agg((x->>'inicio')||'–'||(x->>'fin'),', ' order by x->>'inicio') into horario from jsonb_array_elements(s.turnos_chat) x;
   texto='¡Hola! En este momento estamos cerrados. Horarios: '||coalesce(horario,s.horario,'a confirmar')||'. Volvemos a abrir '||(v->>'proximo_texto')||'.';
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':aviso',texto) or not gestlok_chat_private.wai_agente_poll(p,e,'¿Querés dejar un pedido programado?','[{"id":"programar_si","label":"Sí, programar pedido"},{"id":"programar_no","label":"No, gracias"}]'::jsonb) then raise exception 'No se pudo ofrecer programación';end if;
   insert into gestlok_chat_private.wai_programaciones(ciclo_id,estado,apertura,pregunta_evento,entrada_id) values(a.ciclo_id,'ofrecido',apertura,e,case when existe and z.estado='ofrecido' then z.entrada_id else m.id end)
   on conflict(ciclo_id) do update set estado='ofrecido',apertura=excluded.apertura,pregunta_evento=excluded.pregunta_evento,entrada_id=excluded.entrada_id,actualizado_at=clock_timestamp();
   -- Raw product recognition can create a pending flag before the assistant.
   -- Do not expose this as a manager-ready order until the customer opts in.
   if a.ficha is null then update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=null,pedido_texto=null,pendiente=false where hilo_id=a.hilo_id;end if;
   return true;
  end if;
 elsif not (existe and z.estado='ofrecido' and si) then return false;
 end if;
 -- A valid yes: if the shop opened while asking, continue as an ordinary order.
 if apertura is not null then
  update gestlok_chat_private.wai_programaciones set estado='aceptado',actualizado_at=clock_timestamp() where ciclo_id=a.ciclo_id;
 else
  delete from gestlok_chat_private.wai_programaciones where ciclo_id=a.ciclo_id and estado='ofrecido';
 end if;
 if not gestlok_chat_private.wai_pedido_encolar(p.id,e,case when apertura is null then '¡Ya abrimos! Podés hacer tu pedido.' else '¡Perfecto! Tu pedido quedará programado para el '||gestlok_chat_private.wai_fecha_programada(apertura)||'. El gerente lo confirmará cuando abra el local.' end) then raise exception 'No se pudo confirmar programación';end if;
 f=a.ficha;
 if f is not null and f->>'estado'='cotizacion' then
  f=(f-'programado_para')||case when apertura is not null then jsonb_build_object('programado_para',apertura) else '{}'::jsonb end;
  if not gestlok_chat_private.wai_carrito_mostrar(p,e||':cotizacion',f,true) then raise exception 'No se pudo mostrar el resumen';end if;
  update gestlok_chat_private.wai_atencion_hilos set ficha=f||jsonb_build_object('espera',e||':cotizacion'),actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
 else
  select * into original from gestlok_chat_private.wai_mensajes where id=z.entrada_id and piloto_id=p.id and ciclo_id=a.ciclo_id;
  if original.id is not null and gestlok_chat_private.wai_pedido_guiado(p,original) then return true;end if;
  if not gestlok_chat_private.wai_menu_invitar(p,e||':carta') then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,e||':carta','Contame qué querés pedir. El comercio revisará tu solicitud.') then raise exception 'No se pudo continuar';end if;
  end if;
 end if;
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_fuera_horario(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_hilo(p gestlok_chat_private.wai_pilotos)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select q.id from gestlok_chat_private.wai_pilotos q where q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester) order by q.creado_at,q.id limit 1
$function$;
revoke all on function gestlok_chat_private.wai_hilo(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_imagen_permitida(p_sucursal uuid, u text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(u ~ '^https://gestlok\.com\.ar/chat/carta-wai/[a-z0-9-]{1,70}\.jpg$'
  or u ~ ('^https://vgsepaaewbctjsjcpeta\.supabase\.co/storage/v1/object/public/gestlok-chat-cartas/'||p_sucursal::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'),false)
$function$;
revoke all on function gestlok_chat_private.wai_imagen_permitida(p_sucursal uuid, u text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_importe(n numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select '$'||replace(to_char(trunc(n),'FM999,999,999,990'),',','.')||case when n<>trunc(n) then ','||lpad((round((n-trunc(n))*100))::text,2,'0') else '' end
$function$;
revoke all on function gestlok_chat_private.wai_importe(n numeric) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_leer_cantidades(t text, valores jsonb, total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n text:=gestlok_chat_private.wai_normalizar(t); v jsonb; nom text; q int; cuenta int:=0; r jsonb:='[]'; m text[]; w text;
begin
 while n<>'' loop
  n=regexp_replace(n,'^(y|mas) +','');
  if n='' then return null;end if;
  q=1;
  m=regexp_match(n,'^(\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|veinte) +');
  if m is not null then
   w=m[1]; q=case w when 'un' then 1 when 'uno' then 1 when 'una' then 1 when 'dos' then 2 when 'tres' then 3 when 'cuatro' then 4 when 'cinco' then 5 when 'seis' then 6 when 'siete' then 7 when 'ocho' then 8 when 'nueve' then 9 when 'diez' then 10 when 'once' then 11 when 'doce' then 12 when 'trece' then 13 when 'catorce' then 14 when 'quince' then 15 when 'dieciseis' then 16 when 'diecisiete' then 17 when 'dieciocho' then 18 when 'veinte' then 20 else w::int end;
   n=regexp_replace(substr(n,length(w)+2),'^de +','');
  end if;
  select x,gestlok_chat_private.wai_normalizar(x->>'nombre') into v,nom
  from jsonb_array_elements(valores) x where n=gestlok_chat_private.wai_normalizar(x->>'nombre') or starts_with(n,gestlok_chat_private.wai_normalizar(x->>'nombre')||' ')
  order by length(gestlok_chat_private.wai_normalizar(x->>'nombre')) desc limit 1;
  if v is null or q<1 or cuenta+q>total then return null;end if;
  cuenta=cuenta+q;
  r=r||jsonb_build_array(jsonb_build_object('id',v->>'id','nombre',v->>'nombre','cantidad',q,'extra',coalesce((v->>'extra')::numeric,0)));
  n=btrim(substr(n,length(nom)+1));
 end loop;
 if cuenta<>total then return null;end if;
 return r;
end$function$;
revoke all on function gestlok_chat_private.wai_leer_cantidades(t text, valores jsonb, total integer) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_menu_armar(p gestlok_chat_private.wai_pilotos, d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare item jsonb; g jsonb; v jsonb; elig jsonb; gsel jsonb; seleccion jsonb; grupos jsonb; extras jsonb; linea jsonb; carrito jsonb:='[]'; o record; s gestlok_chat_private.sucursales; q int; necesario int; suma int; extra numeric; sub numeric; modo text; pago text; demora text; envio numeric; f jsonb;
begin
 if jsonb_typeof(d)<>'object' or octet_length(d::text)>20000 or jsonb_typeof(d->'lineas') is distinct from 'array' or jsonb_array_length(d->'lineas') not between 1 and 5 then return null;end if;
 for item in select value from jsonb_array_elements(d->'lineas') loop
  select * into o from gestlok_chat_private.wai_ofertas(p.sucursal_id,'menu_interactivo') x where x.id::text=item->>'id';
  if not found then return null;end if;
  select coalesce(jsonb_agg(z),'[]'::jsonb) into grupos from jsonb_array_elements(o.opciones) z where coalesce((z->>'obligatorio')::boolean,false);
  if jsonb_typeof(item->'grupos') is distinct from 'object' or (select count(*) from jsonb_object_keys(item->'grupos'))<>jsonb_array_length(grupos) then return null;end if;
  seleccion='[]';extras='[]';
  for g in select value from jsonb_array_elements(grupos) loop
   elig=item->'grupos'->(g->>'id'); if jsonb_typeof(elig) is distinct from 'object' then return null;end if;
   necesario=case when g->>'tipo'='cantidad' then (g->>'total')::int else 1 end;suma=0;gsel='[]';
   for v in select value from jsonb_array_elements(g->'valores') loop
    if elig ? (v->>'id') then
     if coalesce(elig->>(v->>'id'),'') !~ '^[1-9][0-9]?$' then return null;end if;
     q=(elig->>(v->>'id'))::int;suma=suma+q;
     gsel=gsel||jsonb_build_array(jsonb_build_object('id',v->>'id','nombre',v->>'nombre','cantidad',q,'extra',coalesce((v->>'extra')::numeric,0)));
    end if;
   end loop;
   if suma<>necesario or jsonb_array_length(gsel)<>(select count(*) from jsonb_object_keys(elig)) then return null;end if;
   seleccion=seleccion||jsonb_build_array(jsonb_build_object('grupo',g->>'nombre','valores',gsel));
  end loop;
  linea=jsonb_build_object('producto',o.nombre,'producto_id',o.id,'precio',o.precio,'grupos',grupos,'selecciones',seleccion,'extras','[]'::jsonb,'carta','menu_interactivo');
  elig=coalesce(item->'salsas_extra','{}');
  if jsonb_typeof(elig)<>'object' then return null;end if;
  extra=gestlok_chat_private.wai_salsa_precio(p,linea);suma=0;
  for v in select value from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,linea),'[]')) loop
   if elig ? (v->>'id') then
    if extra is null or coalesce(elig->>(v->>'id'),'') !~ '^[1-9]$' then return null;end if;
    q=(elig->>(v->>'id'))::int;suma=suma+q;if suma>10 then return null;end if;
    for necesario in 1..q loop extras=extras||jsonb_build_array(jsonb_build_object('id','salsa_extra:'||(v->>'id'),'nombre',(v->>'nombre')||' (adicional)','precio',extra));end loop;
   end if;
  end loop;
  if exists(select 1 from jsonb_each_text(elig) z where z.value !~ '^[1-9]$' or not exists(select 1 from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,linea),'[]')) valor where valor->>'id'=z.key)) then return null;end if;
  carrito=carrito||jsonb_build_array(linea||jsonb_build_object('extras',extras));
 end loop;
 -- The menu only builds the product selection. Contact data and checkout stay on WhatsApp.
 f=jsonb_build_object('carrito',carrito,'estado','nombre');
 if not gestlok_chat_private.wai_carrito_vigente(p,f) then return null;end if;
 sub=gestlok_chat_private.wai_carrito_subtotal(f);
 return f||jsonb_build_object('subtotal',sub,'total',sub);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return null;
end$function$;
revoke all on function gestlok_chat_private.wai_menu_armar(p gestlok_chat_private.wai_pilotos, d jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_menu_invitar(p gestlok_chat_private.wai_pilotos, e text, intro text DEFAULT 'Armá tu pedido en nuestra carta interactiva:'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_atencion_hilos%rowtype; enlace uuid;
begin
 if not gestlok_chat_private.wai_piloto_vigente(p) or not exists(select 1 from gestlok_chat_private.wai_ofertas(p.sucursal_id,'menu_interactivo')) then return false;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 if not found or a.manual or a.pendiente or a.ciclo_id is null or not exists(select 1 from gestlok_chat_private.wai_ciclos where id=a.ciclo_id and cerrado_at is null) then return false;end if;
 insert into gestlok_chat_private.wai_menu_accesos(piloto_id,ciclo_id,evento) values(p.id,a.ciclo_id,e)
 on conflict(piloto_id,evento) do update set evento=excluded.evento returning id into enlace;
 return gestlok_chat_private.wai_pedido_encolar(p.id,e,intro||' https://gestlok.com.ar/chat/wai/menu/#'||enlace::text);
end$function$;
revoke all on function gestlok_chat_private.wai_menu_invitar(p gestlok_chat_private.wai_pilotos, e text, intro text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_menu_paginas(p_sucursal uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(
  (select case when gestlok_chat_private.wai_imagen_permitida(s.id,s.carta_imagen_url) then jsonb_build_array(jsonb_build_object('id','carta_general','label','Carta del comercio','url',s.carta_imagen_url)) end from gestlok_chat_private.sucursales s where s.id=p_sucursal),
  (select jsonb_agg(jsonb_build_object('id','carta_'||p.clave,'label',p.titulo,'url',p.imagen_url) order by p.orden,p.clave) from gestlok_chat_private.wai_carta_paginas p where p.sucursal_id=p_sucursal and gestlok_chat_private.wai_imagen_permitida(p_sucursal,p.imagen_url)),
  '[]'::jsonb)
$function$;
revoke all on function gestlok_chat_private.wai_menu_paginas(p_sucursal uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_menu_piloto(token uuid)
 RETURNS gestlok_chat_private.wai_pilotos
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p from gestlok_chat_private.wai_menu_accesos l
 join gestlok_chat_private.wai_pilotos p on p.id=l.piloto_id
 join gestlok_chat_private.wai_ciclos c on c.id=l.ciclo_id and c.cerrado_at is null
 join gestlok_chat_private.wai_atencion_hilos a on a.ciclo_id=c.id and a.hilo_id=c.hilo_id
 where l.id=token and l.usado_at is null and not a.manual and not a.pendiente
 and gestlok_chat_private.wai_piloto_vigente(p)
 and (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'agente_activo')::boolean
 and (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'pedidos')::boolean
$function$;
revoke all on function gestlok_chat_private.wai_menu_piloto(token uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_menu_recibir(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ref text; l gestlok_chat_private.wai_menu_accesos; a gestlok_chat_private.wai_atencion_hilos; s gestlok_chat_private.sucursales; f jsonb; e text:='agente:'||m.id;
begin
 ref=substring(lower(btrim(m.texto)) from '^(?:confirmo mi pedido|mi selección|mi seleccion) wai ([a-f0-9-]{36})$');
 if ref is null then return false;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p) for update;
 select * into l from gestlok_chat_private.wai_menu_accesos where referencia::text=ref and piloto_id=p.id and ciclo_id=a.ciclo_id for update;
 if l.id is null or l.ficha is null or m.ciclo_id is distinct from a.ciclo_id or m.jid is null or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(m.jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester) then
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'No encontramos ese pedido. Escribí CARTA para armarlo nuevamente.');
 end if;
 if l.usado_at is not null or a.ficha->>'estado'='pendiente' then return true;end if;
 if gestlok_chat_private.wai_menu_piloto(l.id) is null then return true;end if;
 f=l.ficha;
 if f->>'estado'='nombre' then
  if not gestlok_chat_private.wai_carrito_vigente(p,f) or gestlok_chat_private.wai_carrito_subtotal(f) is distinct from (f->>'subtotal')::numeric then
   return gestlok_chat_private.wai_pedido_encolar(p.id,e,'La carta cambió. Escribí CARTA para revisar tu selección.');
  end if;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! Tengo tu selección por '||gestlok_chat_private.wai_importe((f->>'subtotal')::numeric)||'. ¿A nombre de quién hacemos el pedido?') then return false;end if;
  update gestlok_chat_private.wai_menu_accesos set usado_at=clock_timestamp() where id=l.id;
  update gestlok_chat_private.wai_atencion_hilos set ficha=(f-'total')||jsonb_build_object('espera',e),modalidad=null,espera_modalidad=false,pedido_solicitado_at=null,pedido_texto=null,pendiente=false,manual=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
  return true;
 end if;
 -- An already prepared checkout from the previous version remains usable.
 f=l.ficha; if gestlok_chat_private.wai_programacion_actual(a.ciclo_id) is not null then f=f||jsonb_build_object('programado_para',gestlok_chat_private.wai_programacion_actual(a.ciclo_id));end if;select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo or s.demora_envio is distinct from f->>'demora')) or (f->>'modalidad'='retiro' and (not s.acepta_retiro or s.demora_retiro is distinct from f->>'demora')) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'La carta o las condiciones cambiaron. Pedí una carta nueva para revisar tu pedido.');
 end if;
 if not gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Pedido recibido por '||gestlok_chat_private.wai_importe((f->>'total')::numeric)||case when f->>'programado_para' is not null then '. Programado para el '||gestlok_chat_private.wai_fecha_programada((f->>'programado_para')::timestamptz)||'. Demora desde la apertura: ' else '. Demora aproximada: ' end||(f->>'demora')||'. Pendiente de confirmación del gerente.') then return false;end if;
 update gestlok_chat_private.wai_menu_accesos set usado_at=clock_timestamp() where id=l.id;
 update gestlok_chat_private.wai_atencion_hilos set ficha=f||jsonb_build_object('estado','pendiente','espera',e),modalidad=f->>'modalidad',pedido_solicitado_at=clock_timestamp(),pedido_texto=left((select string_agg(x->>'producto',', ') from jsonb_array_elements(f->'carrito') x),500),pendiente=true,manual=false,actualizado_at=clock_timestamp() where hilo_id=a.hilo_id;
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_menu_recibir(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_modalidad(t text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n text; r boolean; d boolean;
begin
 n=translate(lower(coalesce(t,'')),'áéíóúü','aeiouu');
 -- Questions, negations and ambiguous choices must never assign a modality.
 if n ~ '[?¿]' or n ~ '\m(no|sin|o|quizas|tal vez|tienen|hacen|ofrecen|cuanto|como|costo|precio|hay|se puede)\M' then return null;end if;
 r=n ~ '\m(retiro|retirar|retirarlo|retirarla|retiramos|retirare|paso a buscar|pasa a buscar|para llevar|voy al local|busco en el local|lo busco)\M';
 d=n ~ '\m(delivery|a domicilio|envio|enviar|me lo traen|me lo mandan|mandame|traemelo|me lo envian)\M';
 if r=d then return null;end if;
 return case when r then 'retiro' else 'delivery' end;
end$function$;
revoke all on function gestlok_chat_private.wai_modalidad(t text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_normalizar(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select btrim(regexp_replace(translate(lower(coalesce(t,'')),'áéíóúü','aeiouu'),'[^a-z0-9ñ]+',' ','g'))
$function$;
revoke all on function gestlok_chat_private.wai_normalizar(t text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_ofertas(s uuid, carta text, extra text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nombre text, precio numeric, opciones jsonb, reglas jsonb, orden integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select p.id,p.nombre,p.precio,p.opciones,p.reglas,p.orden
 from gestlok_chat_private.productos p join gestlok_chat_private.categorias c on c.id=p.categoria_id
 where p.sucursal_id=s and p.activo and p.disponible and c.activa and not (p.reglas ? 'cuando')
 and (case when extra is not null then gestlok_chat_private.wai_normalizar(c.nombre)=extra
 when carta='menu_interactivo' then (p.reglas-'compartir')='{}'::jsonb
  and not exists(select 1 from jsonb_array_elements(p.opciones) g where coalesce((g->>'obligatorio')::boolean,false)
   and (g->>'tipo' not in ('cantidad','una') or (case when g->>'tipo'='cantidad' then (g->>'total')::int else 1 end) not between 1 and 30 or jsonb_array_length(g->'valores')=0))
 else exists(select 1 from gestlok_chat_private.wai_carta_paginas w where w.sucursal_id=s and 'carta_'||w.clave=carta
    and c.nombre=any(w.categorias) and (cardinality(w.productos_nombres)=0 or p.nombre=any(w.productos_nombres))) end)
 order by p.orden,jsonb_array_length(p.opciones),p.precio,p.nombre,p.id
$function$;
revoke all on function gestlok_chat_private.wai_ofertas(s uuid, carta text, extra text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_consentimiento(p gestlok_chat_private.wai_pilotos)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select gestlok_chat_private.wai_rubro_activo(p.sucursal_id) and p.vence_at>now() and not p.cancelado
  and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
  and exists(select 1 from gestlok_chat_private.whatsapp_premium_habilitaciones h
    join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
    where h.id=p.habilitacion_id and s.id=p.sucursal_id and h.habilitada)
  and (not p.entrada_automatica or gestlok_chat_private.wai_recepcion_activa(p.habilitacion_id))
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$function$;
revoke all on function gestlok_chat_private.wai_pedido_consentimiento(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_encolar(p_piloto uuid, p_evento text, p_texto text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p_piloto and m.direccion='salida' and m.evento=p_evento) then return true;end if;
 if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p_piloto and m.direccion='salida' and m.origen is distinct from 'telefono') >=120 then return false;end if;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,origen)
 values(p_piloto,'salida',p_texto,'pendiente',p_evento,'wai') on conflict(piloto_id,direccion,evento) do nothing;
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_pedido_encolar(p_piloto uuid, p_evento text, p_texto text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_guiado(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h uuid:=gestlok_chat_private.wai_hilo(p); a gestlok_chat_private.wai_atencion_hilos%rowtype; s gestlok_chat_private.sucursales%rowtype;
 f jsonb; st text; voto text; de_evento text; e text:='agente:'||m.id; t text:=btrim(m.texto); n text:=gestlok_chat_private.wai_normalizar(m.texto);
 x record; g jsonb; v jsonb; partes jsonb; opts jsonb; q int; parcial int; k int; desde int; extra text; modo text; pago text; pagos text[]; demora text; envio numeric; sub numeric; monto numeric; ok boolean:=false; pregunta text; resumen text; ficha_nueva jsonb; salsa_precio numeric; pack_n text; salsa_n text; pagina text; idx int;
begin
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=h for update;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 f=a.ficha; st=f->>'estado';
 if f is not null and gestlok_chat_private.wai_programacion_actual(a.ciclo_id) is not null then f=f||jsonb_build_object('programado_para',gestlok_chat_private.wai_programacion_actual(a.ciclo_id));end if;
 if st='cancelado' then f=null;st=null;end if;
 if m.evento not like 'agente-voto:%' and lower(btrim(m.texto)) ~ '^(?:confirmo mi pedido|mi selección|mi seleccion) wai [a-f0-9-]{36}$' then
  return gestlok_chat_private.wai_menu_recibir(p,m);
 end if;
 if ((m.evento not like 'agente-voto:%' and n in ('carta','menu','carta interactiva','menu interactivo','hacer un pedido','quiero hacer un pedido','hacer otro pedido','pedido','pedir')) or m.evento like 'agente-voto:%:pedido' or m.evento like 'agente-voto:%:catalogo') and st is distinct from 'pendiente' and st is distinct from 'revision' then
  if gestlok_chat_private.wai_menu_invitar(p,e) then return true;end if;
 end if;
 if n='pedir por chat' then n='hacer un pedido';end if;

 if m.evento like 'agente-voto:%' then
  voto=split_part(m.evento,':',3);
  select evento into de_evento from gestlok_chat_private.wai_mensajes where id::text=split_part(m.evento,':',2) and piloto_id=p.id;
 end if;
 pack_n=substring(n from '^(?:quiero |quisiera |dame |pedir )?(?:el )?pack (?:de )?([0-9]+)(?: |$)');
 salsa_n=substring(n from ' ([0-9]+) salsas?(?: |$)');
 if st='pendiente' then
  if voto is not null then return true;end if;
  return gestlok_chat_private.wai_pedido_encolar(p.id,e,'Tu pedido está pendiente de confirmación del comercio. Si necesitás cambiar algo, el gerente revisará tu mensaje.');
 end if;
 if st='revision' then return false;end if;
 if st='confirmado' then
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=h and estado<>'entregado' and atencion_finalizada_at is null and creado_at>clock_timestamp()-interval '4 hours') then return false;end if;
  if voto='pedido' or pack_n is not null or n ~ '^(quiero |quisiera )?(hacer un pedido|pedir)$' then f=null;st=null;else return false;end if;
 end if;
 if f is null and pack_n is not null and a.ultima_carta is not null and exists(select 1 from gestlok_chat_private.wai_ofertas(s.id,a.ultima_carta)) then
  f=jsonb_build_object('estado','oferta','carta',a.ultima_carta,'desde',0,'extras','[]'::jsonb,'selecciones','[]'::jsonb);st='oferta';
 end if;
 if f is null then
  if a.ultima_carta is null or not (coalesce(voto,'')='pedido' or n ~ '^(quiero |quisiera )?(hacer un pedido|pedir)$') then return false;end if;
  if not exists(select 1 from gestlok_chat_private.wai_ofertas(s.id,a.ultima_carta)) then return false;end if;
  opts=gestlok_chat_private.wai_ficha_opciones(s.id,a.ultima_carta,null,0);
  ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué promoción o producto de la imagen te interesó?',opts);
  f=jsonb_build_object('estado','oferta','carta',a.ultima_carta,'desde',0,'extras','[]'::jsonb,'selecciones','[]'::jsonb);
 elsif voto is not null and de_evento is distinct from f->>'espera' then
  -- A vote from an older step cannot advance the new draft.
  return true;
 elsif voto='fc_cancelar' or (voto is null and n in ('cancelar','cancelar pedido','cancelar mi pedido')) then
  ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Cancelamos tu carrito. No se envió ningún pedido al comercio. Podés iniciar otro cuando quieras.');
  f=jsonb_build_object('estado','cancelado');
 elsif st='carrito_carta' then
  desde=coalesce((f->>'pagina_desde')::int,0);
  if voto='cc_volver' or n='volver al carrito' then
   f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
  elsif voto='cc_mas' then
   desde=desde+4;f=f||jsonb_build_object('pagina_desde',desde);
   ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí otra categoría',gestlok_chat_private.wai_carrito_paginas(s.id,desde));
  else
   select w.clave into pagina from gestlok_chat_private.wai_carta_paginas w where w.sucursal_id=s.id and (voto='cc_'||w.clave or (voto is null and gestlok_chat_private.wai_normalizar(w.titulo)=n)) and exists(select 1 from gestlok_chat_private.wai_ofertas(s.id,'carta_'||w.clave));
   if pagina is not null then
    f=f||jsonb_build_object('estado','oferta','carta','carta_'||pagina,'desde',0,'extras','[]'::jsonb,'selecciones','[]'::jsonb);
    ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí el próximo producto o promoción',gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',null,0));
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una categoría para agregar otro producto',gestlok_chat_private.wai_carrito_paginas(s.id,desde));end if;
  end if;
 elsif st='carrito_revision' then
  if (voto='fc_datos' or n in ('continuar','continuar con el pedido')) and jsonb_array_length(f->'carrito')>0 then
   if f->>'nombre' is not null and f->>'modalidad' is not null and f->>'pago' is not null and (f->>'modalidad'='retiro' or f->>'direccion' is not null and f->>'entrecalles' is not null) then
    f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('pago',f->>'pago');
    sub=gestlok_chat_private.wai_carrito_subtotal(f);
    envio=case when f->>'modalidad'='delivery' then s.envio_costo else 0 end;
    demora=case when f->>'modalidad'='delivery' then s.demora_envio else s.demora_retiro end;
    f=f||jsonb_build_object('estado','cotizacion','subtotal',sub,'envio',envio,'total',sub+envio,'demora',demora);
    if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or sub<s.pedido_minimo)) or (f->>'modalidad'='retiro' and not s.acepta_retiro) or coalesce(btrim(demora),'')='' or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio debe revisar las condiciones antes de confirmar el importe.');f=f||jsonb_build_object('estado','revision');
    else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f,true);end if;
   else
    f=f||jsonb_build_object('estado','nombre');ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! ¿A nombre de quién hacemos el pedido?');
   end if;
  elsif (voto='fc_agregar' or n='agregar otro producto') and jsonb_array_length(f->'carrito')<5 then
   f=f||jsonb_build_object('estado','carrito_carta','pagina_desde',0);
   opts=gestlok_chat_private.wai_carrito_paginas(s.id,0);
   if jsonb_array_length(opts)<2 then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'No hay categorías disponibles. Te atenderá una persona del comercio.');f=f||jsonb_build_object('estado','revision');
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué más querés agregar?',opts);end if;
  elsif (voto='fc_quitar' or n='quitar un producto') and jsonb_array_length(f->'carrito')>0 then
   select jsonb_agg(jsonb_build_object('id','cq_'||i,'label',left(i||'. '||(l->>'producto'),60)) order by i) into opts from jsonb_array_elements(f->'carrito') with ordinality as a(l,i);
   ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué producto querés quitar?',opts||'[{"id":"cq_volver","label":"Volver sin quitar"}]'::jsonb);
   f=f||jsonb_build_object('estado','carrito_quitar');
  else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);end if;
 elsif st='carrito_quitar' then
  if voto ~ '^cq_[1-5]$' then idx=substr(voto,4)::int-1;
  elsif voto is null and n ~ '^[1-5]$' then idx=n::int-1;end if;
  if idx is not null and idx<jsonb_array_length(f->'carrito') then f=jsonb_set(f,'{carrito}',(f->'carrito')-idx);end if;
  f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
 elsif st='cotizacion' then
  if voto='fc_confirmar' or (voto is null and n in ('confirmar','confirmar mi pedido','confirmo')) then
   if not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (not s.acepta_envio or s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo)) or (f->>'modalidad'='retiro' and not s.acepta_retiro) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false) then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Algunos precios, productos o condiciones cambiaron. El comercio revisará el pedido antes de confirmarte el importe.');f=f||jsonb_build_object('estado','revision');
   else
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias! Recibimos tu solicitud. '||case when f->>'programado_para' is not null then 'Pedido programado para el '||gestlok_chat_private.wai_fecha_programada((f->>'programado_para')::timestamptz)||'. Demora aproximada desde la apertura: '||coalesce(f->>'demora','a confirmar por el comercio')||'. El gerente lo confirmará cuando abra el local.' else 'Demora aproximada: '||coalesce(f->>'demora','a confirmar por el comercio')||'. Pronto el gerente confirmará el pedido y comenzará a prepararlo.' end);
    f=f||jsonb_build_object('estado','pendiente');
   end if;
  elsif voto='fc_editar' or (voto is null and n in ('modificar','modificar pedido')) then
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','carrito_revision','pago',f->>'pago');
   ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
  else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f,true);end if;
 elsif voto='f_humano' or (n ~ '\m(humano|gerente|persona)\M' and voto is null) then
  ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Te paso con una persona del comercio para ayudarte con tu pedido.');
  f=f||jsonb_build_object('estado','revision');
 elsif st in ('oferta','extra_producto') then
  extra=case when st='extra_producto' then f->>'extra_tipo' end;
  desde=coalesce((f->>'desde')::int,0);
  if voto='f_mas' then
   desde=desde+5;
   opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',extra,desde);
   ok=gestlok_chat_private.wai_agente_poll(p,e,'Más opciones',opts); f=f||jsonb_build_object('desde',desde);
  elsif voto='f_volver' and extra is not null then
   f=f||jsonb_build_object('grupo',jsonb_array_length(f->'grupos'));f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
  elsif voto='f_volver' and jsonb_array_length(coalesce(f->'carrito','[]'))>0 then
   f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
  elsif voto='f_volver' then
   opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',null,0);ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué promoción o producto de la imagen te interesó?',opts);f=f||jsonb_build_object('desde',0);
  else
   select * into x from gestlok_chat_private.wai_ofertas(s.id,f->>'carta',extra) o
    where (voto='of_'||replace(o.id::text,'-','') or (voto is null and (n=gestlok_chat_private.wai_normalizar(o.nombre) or pack_n=substring(o.nombre from '^Pack ([0-9]+)') and (n ~ '\m(lata|gaseosa|bebida)\M')=(o.nombre ~* 'lata') and (salsa_n is null or exists(select 1 from jsonb_array_elements(o.opciones) z where z->>'id'='salsas' and z->>'total'=salsa_n)))))
    order by o.orden,o.precio limit 1;
   if not found then
    opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',extra,desde);ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una opción disponible de la lista',opts);
   elsif extra is not null then
    if exists(select 1 from jsonb_array_elements(x.opciones) z where coalesce((z->>'obligatorio')::boolean,false)) or (x.reglas-'compartir')<>'{}'::jsonb then
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Este adicional necesita una configuración especial. El gerente te ayudará.');f=f||jsonb_build_object('estado','revision');
    else f=jsonb_set(f,'{extras}',f->'extras'||jsonb_build_array(jsonb_build_object('id',x.id,'nombre',x.nombre,'precio',x.precio))); f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;end if;
   elsif (x.reglas-'compartir')<>'{}'::jsonb then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El producto tiene condiciones especiales. El gerente te ayudará a completar tu pedido.');f=f||jsonb_build_object('estado','revision','producto',x.nombre);
   else
    select coalesce(jsonb_agg(z),'[]'::jsonb) into opts from jsonb_array_elements(x.opciones) z where coalesce((z->>'obligatorio')::boolean,false);
    f=f||jsonb_build_object('producto',x.nombre,'producto_id',x.id,'precio',x.precio,'grupos',opts,'grupo',0,'selecciones','[]'::jsonb);
    f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
   end if;
  end if;
 elsif st='grupo' then
  k=(f->>'grupo')::int;g=f->'grupos'->k;q=case when g->>'tipo'='cantidad' then (g->>'total')::int else 1 end;
  partes=null;
  if voto like 'g_%' then
   select z into v from jsonb_array_elements(g->'valores') z where z->>'id'=substr(voto,3);
   if v is not null then partes=jsonb_build_array(jsonb_build_object('id',v->>'id','nombre',v->>'nombre','cantidad',1,'extra',coalesce((v->>'extra')::numeric,0)));end if;
  elsif voto is null or (voto='salsas' and g->>'id'='salsas') then partes=gestlok_chat_private.wai_leer_cantidades(t,g->'valores',q);end if;
  if partes is null then
   ok=gestlok_chat_private.wai_menu_invitar(p,e,'Elegí los gustos y cantidades en la carta:');
   if not ok then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Elegí exactamente '||q||' de '||(g->>'nombre')||'. Ej.: '||q||' de '||(g->'valores'->0->>'nombre')||'.');end if;
  else
   partes=case when voto like 'g_%' then f->'parcial'||partes else partes end;
   select sum((z->>'cantidad')::int) into parcial from jsonb_array_elements(partes) z;
   if parcial=q then
    f=jsonb_set(f,'{selecciones}',f->'selecciones'||jsonb_build_array(jsonb_build_object('grupo',g->>'nombre','valores',partes)));
    f=f||jsonb_build_object('grupo',k+1,'parcial','[]'::jsonb);f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
   else
    f=jsonb_set(f,'{parcial}',partes);
    select jsonb_agg(jsonb_build_object('id','g_'||(z->>'id'),'label',left(z->>'nombre',60))) into opts from jsonb_array_elements(g->'valores') z;
    ok=gestlok_chat_private.wai_agente_poll(p,e,case when g->>'id'='salsas' then 'Salsas incluidas: elegí '||(parcial+1)||' de '||q else 'Elegí '||(g->>'nombre')||' ('||(parcial+1)||' de '||q||')' end,opts);
   end if;
  end if;
 elsif st='salsa_extra' then
  salsa_precio=gestlok_chat_private.wai_salsa_precio(p,f);
  select z into v from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,f),'[]')) z where voto='sa_'||(z->>'id') or (voto is null and n=gestlok_chat_private.wai_normalizar(z->>'nombre')) limit 1;
  if v is not null and salsa_precio is not null then
   f=jsonb_set(f,'{extras}',f->'extras'||jsonb_build_array(jsonb_build_object('id','salsa_extra:'||(v->>'id'),'nombre','Salsa adicional · '||(v->>'nombre'),'precio',salsa_precio)));
   f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;
  else
   select jsonb_agg(jsonb_build_object('id','sa_'||(z->>'id'),'label',left(z->>'nombre',60))) into opts from jsonb_array_elements(coalesce(gestlok_chat_private.wai_salsa_valores(p,f),'[]')) z;
   if salsa_precio is not null and jsonb_array_length(opts) between 2 and 6 then ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una salsa adicional · '||gestlok_chat_private.wai_importe(salsa_precio),opts);
   else f=gestlok_chat_private.wai_ficha_avanzar(p,e,f);ok=f is not null;end if;
  end if;
 elsif st='extras' then
  if (voto='f_salsa' or n in ('salsa adicional','agregar salsa','salsa extra')) and gestlok_chat_private.wai_salsa_precio(p,f) is not null then
   salsa_precio=gestlok_chat_private.wai_salsa_precio(p,f);
   select jsonb_agg(jsonb_build_object('id','sa_'||(z->>'id'),'label',left(z->>'nombre',60))) into opts from jsonb_array_elements(gestlok_chat_private.wai_salsa_valores(p,f)) z;
   ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí una salsa adicional · '||gestlok_chat_private.wai_importe(salsa_precio),opts);f=f||jsonb_build_object('estado','salsa_extra');
  elsif voto in ('f_bebidas','f_postres') then
   extra=substr(voto,3);opts=gestlok_chat_private.wai_ficha_opciones(s.id,f->>'carta',extra,0);
   if jsonb_array_length(opts)<2 then
    ok=gestlok_chat_private.wai_agente_poll(p,e,'No hay opciones de esa categoría disponibles. ¿Querés agregar algo más?', gestlok_chat_private.wai_extras_opciones(p,f));
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'Elegí qué querés agregar',opts);f=f||jsonb_build_object('estado','extra_producto','extra_tipo',extra,'desde',0);end if;
  elsif (voto='f_otro' or n='agregar otro producto') and jsonb_array_length(gestlok_chat_private.wai_carrito_lineas(f))<5 then
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','carrito_carta','pagina_desde',0);
   opts=gestlok_chat_private.wai_carrito_paginas(s.id,0);
   if jsonb_array_length(opts)<2 then f=f||jsonb_build_object('estado','carrito_revision');ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f);
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Qué más querés agregar?',opts);end if;
  elsif voto='f_sin' or n in ('no','no gracias','sin adicionales','nada','terminar de elegir') then
   f=gestlok_chat_private.wai_carrito_guardar(f)||jsonb_build_object('estado','nombre');
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Perfecto! ¿A nombre de quién hacemos el pedido?');
  else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Querés agregar algo más?',gestlok_chat_private.wai_extras_opciones(p,f));end if;
 elsif st='nombre' then
  if voto is not null or length(t) not between 2 and 80 or t !~ '[[:alpha:]]' then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Escribí el nombre para el pedido.');
  else
   f=f||jsonb_build_object('nombre',t,'estado','modalidad');
   modo=case when s.acepta_retiro and not s.acepta_envio then 'retiro' when s.acepta_envio and not s.acepta_retiro then 'delivery' else a.modalidad end;
   if modo='delivery' and s.acepta_envio then
    f=f||jsonb_build_object('modalidad','delivery','estado','direccion');
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Pasame la dirección de entrega (calle y altura) y entre qué calles está, en un solo mensaje.');
   elsif modo='retiro' and s.acepta_retiro then f=f||jsonb_build_object('modalidad','retiro','estado','pago');
   else
   opts='[]';if s.acepta_retiro then opts=opts||'[{"id":"f_retiro","label":"Retiro en el local"}]'::jsonb;end if;if s.acepta_envio then opts=opts||'[{"id":"f_delivery","label":"Delivery"}]'::jsonb;end if;
   opts=opts||'[{"id":"f_humano","label":"Hablar con el comercio"}]'::jsonb;
   if jsonb_array_length(opts)<2 then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El local no tiene modalidad disponible. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
   else ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Cómo querés recibir tu pedido?',opts);end if;
   end if;
  end if;
 elsif st='modalidad' then
  modo=case voto when 'f_retiro' then 'retiro' when 'f_delivery' then 'delivery' else gestlok_chat_private.wai_modalidad(t) end;
  if modo='delivery' and s.acepta_envio then
   f=f||jsonb_build_object('modalidad','delivery','estado','direccion');
   ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Pasame la dirección de entrega (calle y altura) y entre qué calles está, en un solo mensaje.'||case when btrim(s.envio_zona)<>'' then ' Zona: '||s.envio_zona else '' end);
  elsif modo='retiro' and s.acepta_retiro then
   f=f||jsonb_build_object('modalidad','retiro','estado','pago');
  else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio te ayudará a confirmar una modalidad disponible.');f=f||jsonb_build_object('estado','revision');end if;
 elsif st='direccion' then
  if voto is not null or length(t) not between 5 and 200 or t !~ '[0-9]' then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Necesito la calle y altura, y entre qué calles está.');
  elsif t ~* ' (entre calles|entrecalles|entre)[: ]+' then
   f=f||jsonb_build_object('direccion',btrim(regexp_replace(t,' (entre calles|entrecalles|entre)[: ]+.*$','','i')),'entrecalles',btrim(regexp_replace(t,'^.*? (entre calles|entrecalles|entre)[: ]+','','i')),'estado','pago');
  else f=f||jsonb_build_object('direccion',t,'estado','entrecalles');ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¿Entre qué calles está? Si no las sabés, escribí No sé.');end if;
 elsif st='entrecalles' then
  if voto is not null or length(t) not between 2 and 160 then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Escribí las entrecalles o No sé.');
  else f=f||jsonb_build_object('entrecalles',case when n in ('no se','no las se','no') then 'No indicadas' else t end,'estado','pago');end if;
 elsif st='pago' then
  pagos=case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end;
  pago=case when voto like 'pay_%' then substr(voto,5) else replace(n,' ','_') end;
  if pago=any(pagos) then
   f=gestlok_chat_private.wai_carrito_guardar(f);
   sub=gestlok_chat_private.wai_carrito_subtotal(f);
   envio=case when f->>'modalidad'='delivery' then s.envio_costo else 0 end;
   demora=case when f->>'modalidad'='delivery' then s.demora_envio else s.demora_retiro end;
   if (f->>'modalidad'='delivery' and not s.acepta_envio) or (f->>'modalidad'='retiro' and not s.acepta_retiro) or coalesce(btrim(demora),'')='' or (f->>'modalidad'='delivery' and sub<s.pedido_minimo) then
    ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El comercio debe confirmar las condiciones de tu pedido antes de calcular el total. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
   else
    monto=sub+envio;
    f=f||jsonb_build_object('estado','cotizacion','pago',pago,'subtotal',sub,'envio',envio,'total',monto,'demora',demora);
    if not gestlok_chat_private.wai_carrito_vigente(p,f) then
     ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'Un producto o precio cambió. El comercio revisará el pedido antes de confirmarte el total.');f=f||jsonb_build_object('estado','revision');
    else ok=gestlok_chat_private.wai_carrito_mostrar(p,e,f,true);end if;
   end if;
  else
   f=f||jsonb_build_object('estado','pago');ok=false;
  end if;
 end if;
 if f is not null and f->>'estado'='pago' and not ok then
  pagos=case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end;
  select coalesce(jsonb_agg(jsonb_build_object('id','pay_'||z,'label',case z when 'debito' then 'Débito' when 'credito' then 'Crédito' when 'mercado_pago' then 'Mercado Pago' else initcap(z) end)),'[]'::jsonb) into opts from unnest(pagos) z;
  if jsonb_array_length(opts)=0 then ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'El local debe confirmar las formas de pago. Te atenderá una persona.');f=f||jsonb_build_object('estado','revision');
  else opts=opts||'[{"id":"f_humano","label":"Consultar con el comercio"}]'::jsonb;ok=gestlok_chat_private.wai_agente_poll(p,e,'¿Cómo vas a abonar?',opts);end if;
 end if;
 if not ok or f is null then raise exception 'No se pudo encolar el paso del pedido' using errcode='P0001';end if;
 -- No incomplete draft can turn into an order merely by mentioning a flavor.
 update gestlok_chat_private.wai_atencion_hilos set ficha=case when f->>'estado'='cancelado' then null else f||jsonb_build_object('espera',e) end,modalidad=coalesce(f->>'modalidad',a.modalidad),
 pedido_solicitado_at=case when f->>'estado'='pendiente' then clock_timestamp() end,
 pedido_texto=case when f->>'estado'='pendiente' then left(coalesce((select string_agg(l->>'producto',', ') from jsonb_array_elements(gestlok_chat_private.wai_carrito_lineas(f)) l),f->>'producto'),500) end,
 pendiente=f->>'estado' in ('revision','pendiente'),manual=f->>'estado'='revision',actualizado_at=clock_timestamp() where hilo_id=h;
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_pedido_guiado(p gestlok_chat_private.wai_pilotos, m gestlok_chat_private.wai_mensajes) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_reciente(p gestlok_chat_private.wai_pilotos)
 RETURNS gestlok_chat_private.wai_pedidos
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select x from gestlok_chat_private.wai_pedidos x where x.hilo_id=gestlok_chat_private.wai_hilo(p)
 and coalesce(x.atencion_finalizada_at,x.creado_at)>clock_timestamp()-interval '4 hours' order by x.creado_at desc,x.id desc limit 1
$function$;
revoke all on function gestlok_chat_private.wai_pedido_reciente(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_texto(p_sucursal uuid, t text, modo text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare n text; cantidad boolean; producto boolean;
begin
 n=gestlok_chat_private.wai_normalizar(t);
 if n='' or t ~ '[?¿]' or n ~ '\m(menu|carta|catalogo|precios|precio|cuanto|horario|horarios|ubicacion|direccion|problema|reclamo|cancelar|no quiero|no pedir|tienen|hay|vend(en|es))\M' then return false;end if;
 if n ~ '^selecciono ' then return false;end if;
 cantidad=n ~ '^(quiero |quisiera |dame |mandame |agrega |pedimos )?([1-9][0-9]?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|media docena|una docena|docena) ';
 select exists(
   select 1 from gestlok_chat_private.productos pr left join gestlok_chat_private.categorias ca on ca.id=pr.categoria_id
   cross join lateral (select gestlok_chat_private.wai_normalizar(regexp_replace(pr.nombre,'\s*\(DEMO\)\s*$','','i')) nom) norm
   cross join lateral (select regexp_replace(norm.nom,'^.*? de ','') variante) names
   where pr.sucursal_id=p_sucursal and pr.activo and pr.disponible and coalesce(ca.activa,true)
   and (length(norm.nom)>=4 and strpos(' '||n||' ',' '||norm.nom||' ')>0 or length(names.variante)>=4 and strpos(' '||n||' ',' '||names.variante||' ')>0)
 ) into producto;
 return (producto and (cantidad or modo is not null or n ~ '\m(quiero|quisiera|pedir|dame|agrega|mandame|encargar)\M'))
   or (modo is not null and cantidad and n ~ ' de [a-zñ]{3,}' and length(n)<160);
end$function$;
revoke all on function gestlok_chat_private.wai_pedido_texto(p_sucursal uuid, t text, modo text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_pedido_tick(p gestlok_chat_private.wai_pilotos)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o gestlok_chat_private.wai_pedidos%rowtype;
begin
 perform gestlok_chat_private.wai_cerrar_tras_resena(p);
 -- No automatic satisfaction survey: only answer a complaint reported by the customer.
 for o in select * from gestlok_chat_private.wai_pedidos x where x.hilo_id=gestlok_chat_private.wai_hilo(p) and greatest(coalesce(x.atencion_finalizada_at,x.creado_at),x.valorado_at)>now()-interval '4 hours' and x.valoracion='problema' and x.resuelto_at is null and x.respuesta_encolada_at is null order by x.creado_at for update loop
  if gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':respuesta:problema:'||extract(epoch from o.valorado_at)::bigint,'Lamentamos mucho el inconveniente. Contanos qué pasó con tu pedido y qué faltó o llegó mal. Una persona del comercio va a ayudarte.') then
   update gestlok_chat_private.wai_pedidos set respuesta_encolada_at=now() where id=o.id;
  end if;
 end loop;
end$function$;
revoke all on function gestlok_chat_private.wai_pedido_tick(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_piloto_vigente(p gestlok_chat_private.wai_pilotos)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (select habilitado from gestlok_chat_private.wai_piloto_entorno where id)
  and gestlok_chat_private.wai_rubro_activo(p.sucursal_id) and p.vence_at>now() and not p.cancelado
  and exists(select 1 from gestlok_chat_private.whatsapp_premium_habilitaciones h
    join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=h.tenant_id and d.col='locales' and d.id=h.local_id
    where h.id=p.habilitacion_id and s.id=p.sucursal_id and h.habilitada)
  and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.wa_verificada_at>now()-interval '35 seconds'
    and (w.central_instancia is null or exists(select 1 from gestlok_chat_private.wai_servidor_central c where c.id and c.instancia=w.central_instancia and c.vence_at>now())))
  and (not p.entrada_automatica or gestlok_chat_private.wai_recepcion_activa(p.habilitacion_id))
  and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
$function$;
revoke all on function gestlok_chat_private.wai_piloto_vigente(p gestlok_chat_private.wai_pilotos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_portal_nivel(p_sucursal uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n text;
begin
 if auth.uid() is null or not gestlok_chat_private.wai_rubro_activo(p_sucursal) then return null; end if;
 if not exists(select 1 from gestlok_chat_private.sucursales s
   join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.habilitada
   join public.docs d on d.tenant_id=s.tenant_id and d.col='locales' and d.id=s.local_id
   join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.tenant_id=s.tenant_id and h.local_id=s.local_id
   where s.id=p_sucursal) then return null; end if;
 if gestlok_chat_private.es_creadora_chat() then
   perform gestlok_platform.require_admin(); return 'configurar';
 end if;
 if coalesce(public.mi_rol(),'') not in ('dueno','gerente') then return null; end if;
 n:=gestlok_chat_private.nivel(p_sucursal);
 if n in ('gestionar','configurar') then return n; end if;
 return null;
end$function$;
revoke all on function gestlok_chat_private.wai_portal_nivel(p_sucursal uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_postventa_hasta(h uuid, c uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select max(o.atencion_finalizada_at+interval '4 hours') from gestlok_chat_private.wai_pedidos o where o.hilo_id=h and o.ciclo_id=c
$function$;
revoke all on function gestlok_chat_private.wai_postventa_hasta(h uuid, c uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_postventa_texto(p gestlok_chat_private.wai_pilotos, entrada uuid, t text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o gestlok_chat_private.wai_pedidos%rowtype; n text:=gestlok_chat_private.wai_normalizar(t); msg text; a gestlok_chat_private.wai_atencion_hilos; problema boolean;
begin
 select * into o from gestlok_chat_private.wai_pedido_reciente(p);
 if o.id is null then return false;end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=o.hilo_id;
 -- Recognize natural complaint phrasing even when preceded by a greeting.
 problema=(n ~ '\m(tuve un problema|tengo un problema|hay un problema|reclamo|queja|pedido equivocado|pedido incompleto|pedido (llego|vino) (mal|incompleto|frio|equivocado|sin)|faltante|no (me )?llego|no recibi|no me (trajeron|mandaron|enviaron)|me (llego|mandaron|trajeron) (mal|frio|equivocado|otra cosa))\M'
   or ((a.ficha is null or a.ficha->>'estado' in ('confirmado','cancelado')) and n ~ '\m(me falt(o|an|aba)|falt(o|an|aron)|vino (sin|incompleto|frio)|llego (sin|incompleto|frio)|no vino|no estaban)\M'));
 if n in ('resena','dejar resena','dejar resena en google') then
  if not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) then return false;end if;
  perform gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':resena:link','¡Gracias! Este es el enlace directo al perfil de Google del local: '||o.resena_enlace);
 elsif problema then
  perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
  if o.valoracion='problema' and o.resuelto_at is null then
   update gestlok_chat_private.wai_pedidos set detalle=left(concat_ws(chr(10),nullif(detalle,''),btrim(t)),1000),actualizado_at=now() where id=o.id;
  else
   update gestlok_chat_private.wai_pedidos set valoracion='problema',valorado_at=now(),resuelto_at=null,actualizado_at=now(),respuesta_encolada_at=null,detalle=left(btrim(t),1000) where id=o.id and (valoracion is distinct from 'problema' or resuelto_at is not null);
  end if;
  update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=now() where hilo_id=o.hilo_id;
  -- Stop old automatic messages while keeping order/transfer notices and history.
  update gestlok_chat_private.wai_mensajes set cancelada_at=now() where ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=o.hilo_id) and estado='pendiente' and cancelada_at is null and evento like 'agente:%';
 elsif o.valoracion='problema' and o.resuelto_at is null and coalesce(a.manual,false) then
  -- The original complaint and later detail remain in the thread; update
  -- the manager's private incident summary without sending repeated apologies.
  perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
  update gestlok_chat_private.wai_pedidos set detalle=left(concat_ws(chr(10),nullif(detalle,''),btrim(t)),1000),actualizado_at=now() where id=o.id;
 else return false;end if;
 update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;
 return true;
end$function$;
revoke all on function gestlok_chat_private.wai_postventa_texto(p gestlok_chat_private.wai_pilotos, entrada uuid, t text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_programacion_actual(c uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select apertura from gestlok_chat_private.wai_programaciones where ciclo_id=c and estado='aceptado'
$function$;
revoke all on function gestlok_chat_private.wai_programacion_actual(c uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_recepcion_activa(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce((select activo from gestlok_chat_private.wai_recepcion_prueba r where r.habilitacion_id=p_id),false)
 and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 and exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id)
 and exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.wai_servidor_central c on c.id and c.instancia=w.central_instancia
 where w.habilitacion_id=p_id and c.vence_at>now())
$function$;
revoke all on function gestlok_chat_private.wai_recepcion_activa(p_id uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_recibir_voto(p gestlok_chat_private.wai_pilotos, p_jid text, p_evento text, p_opcion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m gestlok_chat_private.wai_mensajes%rowtype;o jsonb;pedido gestlok_chat_private.wai_pedidos%rowtype;h uuid;entrada uuid; ids text[]; elegidas jsonb; cantidad int; esperado int; detalle text; estado_voto text;
begin
 if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester) or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' then return null;end if;
 select x.* into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.wa_id=p_evento and x.direccion='salida' and x.estado='aceptado' and x.interaccion is not null for update;
 if not found then return null;end if;
 estado_voto=gestlok_chat_private.wai_votacion_estado(m);
 -- Valid contact and original sent poll, but no longer actionable. Acknowledge
 -- silently, so a repeated/retracted/late vote cannot create a false sync error.
 if estado_voto<>'abierta' then return jsonb_build_object('ok',true,'ignorada',true,'cerrada',true);end if;
 if m.interaccion->>'tipo'='salsas' then
  h=gestlok_chat_private.wai_hilo(p);
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and not a.manual and ci.cerrado_at is null and ci.id=m.ciclo_id and a.ficha->>'estado'='grupo' and a.ficha->>'espera'=m.evento) then return jsonb_build_object('ok',true);end if;
  if m.opcion_elegida is not null then return jsonb_build_object('ok',true);end if;
  if p_opcion is null or p_opcion !~ '^sm_[12]_[1-6](,sm_[12]_[1-6]){0,11}$' then return null;end if;
  ids=string_to_array(p_opcion,',');
  if cardinality(ids)<>(select count(distinct i) from unnest(ids) i) then return null;end if;
  select jsonb_agg(v),sum((v->>'cantidad')::int) into elegidas,cantidad from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=any(ids);
  if coalesce(jsonb_array_length(elegidas),0)<>cardinality(ids) then return null;end if;
  esperado=(m.interaccion->>'cantidad')::int;
  -- Partial or excessive snapshots do not change the order or send another poll.
  if cantidad<>esperado then return jsonb_build_object('ok',true,'completo',false);end if;
  select string_agg(q::text||' '||nombre,', ' order by nombre) into detalle from (select v->>'nombre' as nombre,sum((v->>'cantidad')::int) q from jsonb_array_elements(elegidas) v group by v->>'nombre') a;
  if detalle is null or length(detalle)>1000 then return null;end if;
  update gestlok_chat_private.wai_mensajes set opcion_elegida=array_to_string(ids,','),opcion_at=now(),opcion_respuesta_at=now() where id=m.id;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada',detalle,'recibido','agente-voto:'||m.id||':salsas',p_jid) on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);end if;
  return jsonb_build_object('ok',true,'completo',true,'cerrada',true);
 end if;
 select v into o from jsonb_array_elements(m.interaccion->'opciones') v where v->>'id'=p_opcion;
 if o is null then return null;end if;
 if m.interaccion->>'tipo'='resena' then
  select x.* into pedido from gestlok_chat_private.wai_pedidos x where x.hilo_id=gestlok_chat_private.wai_hilo(p) and m.evento='pedido:'||x.id||':resena' and x.estado in ('preparacion','listo','en_camino','entregado') for update;
  if not found or p_opcion not in ('resena_si','resena_no') then return null;end if;
  if p_opcion='resena_si' and gestlok_chat_private.url_resena_valida(pedido.resena_enlace) then
   if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||pedido.id||':resena:link','¡Gracias! Este es el enlace directo al perfil de Google del local: '||pedido.resena_enlace) then return null;end if;
  end if;
 elsif m.interaccion->>'tipo'='pedido' then
  select x.* into pedido from gestlok_chat_private.wai_pedidos x where x.piloto_id=p.id and m.evento='pedido:'||x.id||':consulta' for update;
  if not found then return null;end if;
  -- Old satisfaction polls are single-use, too. Customers can still report a new issue by text.
  if p_opcion not in ('bien','problema') then return null;end if;
  if pedido.valoracion='problema' and p_opcion<>'problema' then return jsonb_build_object('ok',true);end if;
  if p_opcion is distinct from pedido.valoracion then
  update gestlok_chat_private.wai_pedidos set valoracion=p_opcion,valorado_at=now(),actualizado_at=now(),respuesta_encolada_at=null where id=pedido.id;
  if p_opcion='problema' then update gestlok_chat_private.wai_atencion_hilos set pendiente=true,manual=true,actualizado_at=now() where hilo_id=pedido.hilo_id;end if;
  end if;
 elsif m.interaccion->>'tipo'='agente' then
  h=gestlok_chat_private.wai_hilo(p);
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos a join gestlok_chat_private.wai_ciclos ci on ci.id=a.ciclo_id where a.hilo_id=h and ci.cerrado_at is null and ci.id=m.ciclo_id) then return null;end if;
  if m.opcion_elegida is not null then return jsonb_build_object('ok',true);end if;
  update gestlok_chat_private.wai_mensajes set opcion_elegida=p_opcion,opcion_at=now(),opcion_respuesta_at=now() where id=m.id;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada','Seleccionó: '||(o->>'label'),'recibido','agente-voto:'||m.id||':'||p_opcion,p_jid) on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then
   perform gestlok_chat_private.wai_ciclo_entrada(p,entrada,case when p_opcion in ('retiro','delivery') then p_opcion end);
   if coalesce((select manual from gestlok_chat_private.wai_atencion_hilos where hilo_id=h),false) then
    update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;
   end if;
  end if;
  return jsonb_build_object('ok',true,'cerrada',true);
 elsif m.interaccion->>'tipo'='menu' then
  if m.ciclo_id is not null and not exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=m.ciclo_id and ci.cerrado_at is null) then return null;end if;
  -- Immediately mark a request for a person, even if no reply quota remains.
  if (o->>'humano')::boolean then
   h=gestlok_chat_private.wai_hilo(p);
   insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual,pendiente) values(h,true,true)
   on conflict(hilo_id) do update set manual=true,pendiente=true,actualizado_at=now();
   update gestlok_chat_private.wai_mensajes set cancelada_at=now() where piloto_id=p.id and estado='pendiente' and cancelada_at is null and (evento like 'menu:auto:%' or evento like 'menu:respuesta:%');
  end if;
 else return null;end if;
 update gestlok_chat_private.wai_mensajes set opcion_elegida=p_opcion,opcion_at=now(),opcion_respuesta_at=null where id=m.id;
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,jid) values(p.id,'entrada','Seleccionó: '||(o->>'label'),'recibido',case when m.interaccion->>'tipo'='pedido' then 'pedido:'||pedido.id||':voto:'||p_opcion else 'voto:'||m.id||':'||p_opcion end,p_jid) on conflict(piloto_id,direccion,evento) do nothing;
 return jsonb_build_object('ok',true,'cerrada',true);
end$function$;
revoke all on function gestlok_chat_private.wai_recibir_voto(p gestlok_chat_private.wai_pilotos, p_jid text, p_evento text, p_opcion text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_resena_invitar(p gestlok_chat_private.wai_pilotos, o gestlok_chat_private.wai_pedidos)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e text:='pedido:'||o.id||':resena';ok boolean;
begin
 if o.hilo_id is distinct from gestlok_chat_private.wai_hilo(p) or not gestlok_chat_private.wai_pedido_consentimiento(p) then return false;end if;
 if not coalesce(gestlok_chat_private.url_resena_valida(o.resena_enlace),false) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento='pedido:'||o.id||':preparacion' and m.estado='aceptado' and strpos(m.texto,o.resena_enlace)>0) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.evento=e and m.cancelada_at is null) then return true;end if;
 if exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then
  ok=gestlok_chat_private.wai_agente_poll(p,e,'¡Gracias por elegirnos! Si querés compartir tu experiencia, te invitamos a dejar una reseña en Google. Es opcional.', '[{"id":"resena_si","label":"Dejar reseña en Google"},{"id":"resena_no","label":"Ahora no"}]'::jsonb);
  if ok then update gestlok_chat_private.wai_mensajes set interaccion=jsonb_set(interaccion,'{tipo}','"resena"'),ciclo_id=o.ciclo_id where piloto_id=p.id and evento=e and direccion='salida';end if;
 else ok=gestlok_chat_private.wai_pedido_encolar(p.id,e,'¡Gracias por elegirnos! Si te gustaría compartir tu experiencia, te invitamos a dejar una reseña en Google. Es totalmente opcional: '||o.resena_enlace);end if;
 return ok;
end$function$;
revoke all on function gestlok_chat_private.wai_resena_invitar(p gestlok_chat_private.wai_pilotos, o gestlok_chat_private.wai_pedidos) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_rubro_activo(p_sucursal uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(select 1 from gestlok_chat_private.wai_comercios where sucursal_id=p_sucursal and rubro='gastronomia' and activo)
$function$;
revoke all on function gestlok_chat_private.wai_rubro_activo(p_sucursal uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_salsa_precio(p gestlok_chat_private.wai_pilotos, f jsonb)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select c.precio from gestlok_chat_private.wai_salsa_adicional c join gestlok_chat_private.sucursales s on s.tenant_id=c.tenant_id
 where s.id=p.sucursal_id and exists(select 1 from jsonb_array_elements(coalesce(f->'grupos','[]')) g where g->>'id'=c.grupo_id and jsonb_array_length(g->'valores') between 2 and 6)
$function$;
revoke all on function gestlok_chat_private.wai_salsa_precio(p gestlok_chat_private.wai_pilotos, f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_salsa_valores(p gestlok_chat_private.wai_pilotos, f jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select g->'valores' from gestlok_chat_private.wai_salsa_adicional c join gestlok_chat_private.sucursales s on s.tenant_id=c.tenant_id cross join lateral jsonb_array_elements(coalesce(f->'grupos','[]')) g where s.id=p.sucursal_id and g->>'id'=c.grupo_id
$function$;
revoke all on function gestlok_chat_private.wai_salsa_valores(p gestlok_chat_private.wai_pilotos, f jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_votacion_estado(m gestlok_chat_private.wai_mensajes)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; a gestlok_chat_private.wai_atencion_hilos%rowtype; tipo text:=m.interaccion->>'tipo'; momento timestamptz;
begin
 if m.interaccion is null then return null;end if;
 -- The original confirmed decision is always displayed, even after a new cycle or authorization.
 if m.opcion_elegida is not null then return 'seleccionada';end if;
 if m.cancelada_at is not null or m.eliminado_at is not null then return 'cancelada';end if;
 if m.estado='incierto' or (m.estado='reservado' and m.reservado_at<now()-interval '45 seconds') then return 'sin_confirmar';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=m.piloto_id;
 if not found or p.cancelado or p.vence_at<=now() then return 'vencida';end if;
 select * into a from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p);
 if tipo='resena' then
  -- The review invitation itself closes attention. Its own optional decision stays available
  -- until the contact returns, asks for the link by text, or the authorization expires.
  if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.evento=m.evento||':link' and x.direccion='salida' and x.cancelada_at is null) then return 'respondida';end if;
  if a.ciclo_id is distinct from m.ciclo_id then return 'reemplazada';end if;
 elsif tipo in ('agente','salsas','menu','pedido') then
  if m.ciclo_id is not null and (a.ciclo_id is distinct from m.ciclo_id or exists(select 1 from gestlok_chat_private.wai_ciclos ci where ci.id=m.ciclo_id and ci.cerrado_at is not null)) then return 'finalizada';end if;
  if tipo in ('agente','salsas') then
   if m.ciclo_id is null or a.manual or a.ciclo_id is null then return 'finalizada';end if;
   if exists(select 1 from gestlok_chat_private.wai_programaciones z where z.ciclo_id=a.ciclo_id and z.estado='ofrecido') then
    if not exists(select 1 from gestlok_chat_private.wai_programaciones z where z.ciclo_id=a.ciclo_id and z.estado='ofrecido' and z.pregunta_evento=m.evento) then return 'reemplazada';end if;
   elsif a.ficha is not null and a.ficha->>'espera' is distinct from m.evento then return 'reemplazada';end if;
   if tipo='salsas' and (a.ficha->>'estado' is distinct from 'grupo' or a.ficha->>'espera' is distinct from m.evento) then return 'reemplazada';end if;
  end if;
  if tipo in ('agente','salsas','menu') then
   momento=greatest(m.creado_at,coalesce(m.reservado_at,m.creado_at));
   -- A later typed answer or another question replaces an unanswered older prompt;
   -- transfer and order status messages are not questions.
   if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.ciclo_id is not distinct from m.ciclo_id and x.direccion='entrada' and x.agente_procesado_at is not null and x.creado_at>momento) then return 'respondida';end if;
   if exists(select 1 from gestlok_chat_private.wai_mensajes x where x.piloto_id=m.piloto_id and x.ciclo_id is not distinct from m.ciclo_id and x.direccion='salida' and x.id<>m.id and x.interaccion->>'tipo' in ('agente','salsas','menu') and x.creado_at>m.creado_at) then return 'reemplazada';end if;
  end if;
 else return 'finalizada';end if;
 return case when m.estado='aceptado' then 'abierta' else 'pendiente' end;
end$function$;
revoke all on function gestlok_chat_private.wai_votacion_estado(m gestlok_chat_private.wai_mensajes) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION gestlok_chat_private.wai_voto_inmutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.opcion_elegida is not null and new.opcion_elegida is distinct from old.opcion_elegida then
  raise exception 'La selección registrada es definitiva' using errcode='23514';
 end if;
 return new;
end$function$;
revoke all on function gestlok_chat_private.wai_voto_inmutable() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_adjunto_imagen(p_sucursal uuid, p_mensaje uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
 if auth.uid() is null or not coalesce(gestlok_chat_private.wai_portal_nivel(p_sucursal) in ('gestionar','configurar'),false) then raise exception 'Sin permiso' using errcode='42501';end if;
 select jsonb_build_object('mime',a.mime,'base64',replace(encode(a.contenido,'base64'),chr(10),''))
 into r from gestlok_chat_private.wai_adjuntos_imagen a join gestlok_chat_private.wai_mensajes m on m.id=a.mensaje_id
 join gestlok_chat_private.wai_pilotos p on p.id=m.piloto_id where m.id=p_mensaje and p.sucursal_id=p_sucursal and m.direccion='entrada' and m.adjunto_estado='imagen';
 return r;
end$function$;
revoke all on function public.gestlok_chat_wai_adjunto_imagen(p_sucursal uuid, p_mensaje uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_adjunto_imagen(p_sucursal uuid, p_mensaje uuid) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_admitir_entrada(p_id uuid, p_clave text, p_revision uuid, p_jid text, p_evento text, p_fecha bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w gestlok_chat_private.wai_sesiones; h gestlok_chat_private.whatsapp_premium_habilitaciones;
 s_id uuid; t text; fecha timestamptz; r gestlok_chat_private.wai_recepcion_prueba; p gestlok_chat_private.wai_pilotos; canon text;
begin
 -- This endpoint accepts only authentic line credentials and recent direct events.
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$'
 or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_fecha is null or p_fecha not between extract(epoch from clock_timestamp()-interval '60 seconds')::bigint and extract(epoch from clock_timestamp()+interval '10 seconds')::bigint then return null;end if;
 fecha=to_timestamp(p_fecha);
 select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x where x.id=p_id and x.habilitada for update;
 if not found then return null;end if;
 select a.sucursal into s_id from gestlok_chat_private.wai_central_lineas() a where a.id=p_id;
 if s_id is null or not gestlok_chat_private.wai_recepcion_activa(p_id) then return null;end if;
 select * into w from gestlok_chat_private.wai_sesiones where habilitacion_id=p_id and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and revision=p_revision and estado='conectado' and senal_at>=h.actualizada_at and senal_at>now()-interval '30 seconds' and wa_verificada_at>now()-interval '35 seconds';
 if not found then return null;end if;
 select * into r from gestlok_chat_private.wai_recepcion_prueba where habilitacion_id=p_id and activo;
 if not found or fecha<date_trunc('second',r.desde) then return null;end if;
 t='+'||split_part(p_jid,'@',1);canon=gestlok_chat_private.whatsapp_exclusion_key(t);
 if canon=gestlok_chat_private.whatsapp_exclusion_key(h.numero) or public.gestlok_chat_srv_whatsapp_excluido(s_id,t) then return null;end if;
 select q.* into p from gestlok_chat_private.wai_pilotos q where q.habilitacion_id=p_id and q.sucursal_id=s_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=canon and gestlok_chat_private.wai_piloto_vigente(q)
 order by q.creado_at desc,q.id desc limit 1;
 if p.id is null then
  if exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where q.habilitacion_id=p_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=canon and m.direccion='entrada' and m.evento=p_evento) then return null;end if;
  -- Capacity ceiling is a lab guardrail, not a commercial customer limit.
  if (select count(*) from gestlok_chat_private.wai_pilotos q where q.habilitacion_id=p_id and not q.cancelado and q.vence_at>now())>=30
   or (select count(*) from gestlok_chat_private.wai_pilotos q where q.habilitacion_id=p_id and q.entrada_automatica and q.creado_at>now()-interval '1 day')>=100 then return null;end if;
  insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_at,vence_at,creado_por,entrada_automatica)
  values(p_id,s_id,t,fecha,fecha+interval '6 hours',r.actualizado_por,true) returning * into p;
 end if;
 return jsonb_build_object('id',p.id,'tester',p.tester,'creado_at',p.creado_at,'vence_at',p.vence_at,'hora_servidor',clock_timestamp());
end$function$;
revoke all on function public.gestlok_chat_wai_admitir_entrada(p_id uuid, p_clave text, p_revision uuid, p_jid text, p_evento text, p_fecha bigint) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_admitir_entrada(p_id uuid, p_clave text, p_revision uuid, p_jid text, p_evento text, p_fecha bigint) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_atencion_accion(p_sucursal uuid, p_hilo uuid, p_accion text, p_evento uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_pilotos%rowtype;p gestlok_chat_private.wai_pilotos%rowtype;ci uuid;av text;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into a from gestlok_chat_private.wai_pilotos where id=p_hilo and sucursal_id=p_sucursal;
 if not found or a.id is distinct from gestlok_chat_private.wai_hilo(a) then raise exception 'Conversación no disponible';end if;
 if p_accion='sync_revisado' then
  update gestlok_chat_private.wai_pilotos q set alerta_sync=null,alerta_sync_at=null where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and q.alerta_sync_at is not null;
  return true;
 end if;
 if p_accion='descartar_pedido' then
  perform 1 from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() for update;
  update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=null,pedido_texto=null,ficha=null,ultima_carta=null,pendiente=false,actualizado_at=clock_timestamp() where hilo_id=a.id;
  return found;
 end if;
 if p_accion='finalizar' then
  perform 1 from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() for update;
  select ciclo_id into ci from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.id;
  if not gestlok_chat_private.wai_cerrar_hilo(a.id,'manual') then raise exception 'No hay una conversación abierta o quedan pedidos, reclamos o solicitudes pendientes';end if;
  select q.* into p from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() order by q.creado_at desc limit 1;
  av='sin_autorizacion';
  if p.id is not null and gestlok_chat_private.wai_pedido_consentimiento(p) and exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.jid is not null and q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester)) then
   if gestlok_chat_private.wai_pedido_encolar(p.id,'cierre:'||ci,'Damos por finalizada esta atención. ¡Gracias por comunicarte con nosotros! Si necesitás algo más, podés volver a escribirnos. Estaremos para ayudarte.') then
    update gestlok_chat_private.wai_mensajes set ciclo_id=ci where piloto_id=p.id and evento='cierre:'||ci and direccion='salida';
    av='encolado';
   else av='limite';end if;
  end if;
  update gestlok_chat_private.wai_ciclos set aviso_cierre=av where id=ci;
  return true;
 end if;
 if p_accion in ('manual','asistido','atendido') then
  -- Serialize takeover with the connector's claims. A message already in flight
  -- cannot be recalled, but pending non-order automatic replies are canceled.
  perform 1 from gestlok_chat_private.wai_pilotos q where q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not q.cancelado and q.vence_at>now() for update;
  if p_accion='atendido' then update gestlok_chat_private.wai_atencion_hilos set pendiente=false,actualizado_at=now() where hilo_id=a.id;return true;end if;
  insert into gestlok_chat_private.wai_atencion_hilos(hilo_id,manual) values(a.id,p_accion='manual')
  on conflict(hilo_id) do update set manual=excluded.manual,actualizado_at=now();
  if p_accion='manual' then
   update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.id) and direccion='entrada' and agente_procesado_at is null;
   update gestlok_chat_private.wai_mensajes m set cancelada_at=now() from gestlok_chat_private.wai_pilotos q
    where m.piloto_id=q.id and q.sucursal_id=a.sucursal_id and q.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester)
      and m.estado='pendiente' and m.cancelada_at is null and (m.evento like 'menu:auto:%' or m.evento like 'menu:respuesta:%' or m.evento like 'agente:%');
  end if;
  return true;
 end if;
 if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=a.id and ci.cerrado_at is not null) then raise exception 'Conversación finalizada. Esperá un nuevo mensaje';end if;
 if p_accion is distinct from 'enviar' or p_evento is null then raise exception 'Acción inválida';end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester)) then raise exception 'Esperá una conexión y un mensaje autorizado';end if;
 if not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then raise exception 'Actualizá el conector para enviar opciones de WhatsApp';end if;
 if not gestlok_chat_private.wai_encolar_menu(p,'menu:'||p_evento,gestlok_chat_private.wai_atencion_ajustes(p_sucursal)) then raise exception 'Límite de respuestas de prueba';end if;
 return true;
end$function$;
revoke all on function public.gestlok_chat_wai_atencion_accion(p_sucursal uuid, p_hilo uuid, p_accion text, p_evento uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_atencion_accion(p_sucursal uuid, p_hilo uuid, p_accion text, p_evento uuid) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_atencion_config(p_sucursal uuid, p_config jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare opciones jsonb;v jsonb;k int:=0;pregunta text; anterior jsonb; seguimiento int; cierre int;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_config is null then return gestlok_chat_private.wai_atencion_ajustes(p_sucursal);end if;
 if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(p_config->'pregunta') is distinct from 'string' or jsonb_typeof(p_config->'opciones') is distinct from 'array' or jsonb_typeof(p_config->'bienvenida_auto') is distinct from 'boolean' or jsonb_typeof(p_config->'pedidos') is distinct from 'boolean' then raise exception 'Configuración inválida';end if;
 anterior=gestlok_chat_private.wai_atencion_ajustes(p_sucursal);
 if (p_config ? 'agente_activo' and jsonb_typeof(p_config->'agente_activo') is distinct from 'boolean') or (p_config ? 'cierre_auto' and jsonb_typeof(p_config->'cierre_auto') is distinct from 'boolean') then raise exception 'Configuración inválida';end if;
 if (p_config ? 'seguimiento_min' and (p_config->>'seguimiento_min' is null or p_config->>'seguimiento_min' !~ '^[0-9]{1,4}$')) or (p_config ? 'cierre_min' and (p_config->>'cierre_min' is null or p_config->>'cierre_min' !~ '^[0-9]{1,4}$')) then raise exception 'Tiempo inválido';end if;
 seguimiento=coalesce((p_config->>'seguimiento_min')::int,(anterior->>'seguimiento_min')::int);
 cierre=coalesce((p_config->>'cierre_min')::int,(anterior->>'cierre_min')::int);
 if seguimiento not between 1 and 20 or cierre not between 1 and 1440 then raise exception 'Tiempo fuera del rango permitido';end if;
 pregunta=btrim(p_config->>'pregunta');
 if length(pregunta) not between 2 and 120 or jsonb_array_length(p_config->'opciones') not between 2 and 6 then raise exception 'Completá una pregunta y entre 2 y 6 opciones';end if;
 opciones='[]'::jsonb;
 for v in select value from jsonb_array_elements(p_config->'opciones') loop
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'label') is distinct from 'string' or length(btrim(v->>'label')) not between 1 and 60 or jsonb_typeof(v->'respuesta') is distinct from 'string' or length(v->>'respuesta')>400 or jsonb_typeof(v->'humano') is distinct from 'boolean' then raise exception 'Opción inválida';end if;
  if not (v->>'humano')::boolean and nullif(btrim(v->>'respuesta'),'') is null then raise exception 'Completá la respuesta automática o elegí atención humana';end if;
  if exists(select 1 from jsonb_array_elements(opciones) x where lower(x->>'label')=lower(btrim(v->>'label'))) then raise exception 'Las opciones deben ser diferentes';end if;
  k=k+1;opciones=opciones||jsonb_build_array(jsonb_build_object('id','op'||k,'label',btrim(v->>'label'),'respuesta',btrim(v->>'respuesta'),'humano',(v->>'humano')::boolean));
 end loop;
 insert into gestlok_chat_private.wai_atencion_config(sucursal_id,pregunta,opciones,bienvenida_auto,pedidos,agente_activo,seguimiento_min,cierre_auto,cierre_min) values(p_sucursal,pregunta,opciones,(p_config->>'bienvenida_auto')::boolean,(p_config->>'pedidos')::boolean,coalesce((p_config->>'agente_activo')::boolean,(anterior->>'agente_activo')::boolean),seguimiento,coalesce((p_config->>'cierre_auto')::boolean,(anterior->>'cierre_auto')::boolean),cierre)
 on conflict(sucursal_id) do update set pregunta=excluded.pregunta,opciones=excluded.opciones,bienvenida_auto=excluded.bienvenida_auto,pedidos=excluded.pedidos,agente_activo=excluded.agente_activo,seguimiento_min=excluded.seguimiento_min,cierre_auto=excluded.cierre_auto,cierre_min=excluded.cierre_min,actualizado_at=now();
 return gestlok_chat_private.wai_atencion_ajustes(p_sucursal);
end$function$;
revoke all on function public.gestlok_chat_wai_atencion_config(p_sucursal uuid, p_config jsonb) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_atencion_config(p_sucursal uuid, p_config jsonb) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_bandeja(p_sucursal uuid, p_accion text DEFAULT 'listar'::text, p_piloto uuid DEFAULT NULL::uuid, p_texto text DEFAULT NULL::text, p_evento text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; a gestlok_chat_private.wai_pilotos%rowtype; resultado jsonb;
begin
 if gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if p_accion='listar' then
  -- Also evaluate inactive cycles when the manager visits while the connector is offline.
  for p in select q.* from gestlok_chat_private.wai_pilotos q where q.sucursal_id=p_sucursal and not exists(select 1 from gestlok_chat_private.wai_pilotos pv where pv.sucursal_id=q.sucursal_id and pv.habilitacion_id=q.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(pv.tester)=gestlok_chat_private.whatsapp_exclusion_key(q.tester) and gestlok_chat_private.wai_piloto_vigente(pv)) and q.id=gestlok_chat_private.wai_hilo(q) and exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=gestlok_chat_private.wai_hilo(q)) order by q.id for update skip locked loop
   perform gestlok_chat_private.wai_cierre_tick(p);
  end loop;
 end if;
 if p_accion='responder' then
  select * into a from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal;
  if not found then raise exception 'Conversación no disponible' using errcode='22023';end if;
  select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
  if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
  if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.cerrado_at is not null) then raise exception 'Conversación finalizada. Esperá un mensaje nuevo';end if;
  if p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_evento is null or p_evento !~ '^[a-f0-9-]{36}$' then raise exception 'Respuesta inválida' using errcode='22023';end if;
  if not exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id where w.habilitacion_id=p.habilitacion_id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds')
    or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester))
    then raise exception 'Esperá un mensaje de prueba y una conexión activa' using errcode='22023';end if;
  if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='salida' and m.origen is distinct from 'telefono') >=120 then raise exception 'Límite de respuestas de prueba' using errcode='22023';end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento,creado_por,origen) values(p.id,'salida',btrim(p_texto),'pendiente',p_evento,auth.uid(),'wai') on conflict(piloto_id,direccion,evento) do nothing;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida' using errcode='22023';end if;
 with candidatos as (
   select x.*,gestlok_chat_private.whatsapp_exclusion_key(x.tester) as numero_clave
   from gestlok_chat_private.wai_pilotos x where x.sucursal_id=p_sucursal
 ), hilos as (
   select x.habilitacion_id,x.numero_clave,(array_agg(x.id order by x.creado_at,x.id))[1] as id,
     (array_agg(x.tester order by x.creado_at desc,x.id desc))[1] as cliente,
     max(x.creado_at) as fecha
   from candidatos x group by x.habilitacion_id,x.numero_clave
   having bool_or(exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=x.id)
       or (not x.cancelado and x.vence_at>now() and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)))
 ), datos as (
   select h.id,h.habilitacion_id,h.numero_clave,h.cliente,h.fecha,cur.id as piloto_activo,cur.vence_at,
       coalesce(cur.vigente,false) as conexion_activa,
       coalesce(cur.vigente,false)
        and exists(select 1 from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id where q.habilitacion_id=h.habilitacion_id and q.numero_clave=h.numero_clave and m.direccion='entrada')
        and (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=cur.id and m.direccion='salida' and m.origen is distinct from 'telefono')<120 as puede_responder
   from hilos h left join lateral (
    select q.id,q.vence_at,gestlok_chat_private.wai_piloto_vigente(x) as vigente from candidatos q join gestlok_chat_private.wai_pilotos x on x.id=q.id
    where q.habilitacion_id=h.habilitacion_id and q.numero_clave=h.numero_clave and not q.cancelado and q.vence_at>now()
    order by q.creado_at desc,q.id desc limit 1
   ) cur on true
 )
 select jsonb_build_object('chats',coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'linea',d.habilitacion_id,'cliente',d.cliente,'piloto_activo',d.piloto_activo,'vence_at',d.vence_at,
   'conexion_activa',d.conexion_activa,
   'alerta_sync',(select q.alerta_sync from candidatos q where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave and q.alerta_sync_at is not null order by q.alerta_sync_at desc limit 1),
   'alerta_sync_at',(select max(q.alerta_sync_at) from candidatos q where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave),
   'aviso_cierre',(select ci.aviso_cierre from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id),
   'aviso_cierre_estado',(select case when m.estado='aceptado' and m.entregado_at is not null then 'entregado' when m.estado='pendiente' and (q.cancelado or q.vence_at<=now()) then 'incierto' when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' else m.estado end from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id join gestlok_chat_private.wai_atencion_hilos wh on wh.hilo_id=d.id and m.evento='cierre:'||wh.ciclo_id where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave order by m.creado_at desc limit 1),'archivado',d.piloto_activo is null,'puede_operar_pedido',d.puede_responder,'puede_responder',d.puede_responder and not exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id and ci.cerrado_at is not null),
   'agente_activo',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'agente_activo')::boolean,
   'seguimiento_min',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'seguimiento_min')::int,
   'pedido_pendiente',exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id and wh.pedido_solicitado_at is not null),
   'ficha',(select wh.ficha from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),
   'pedido_texto',(select wh.pedido_texto from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),
   'imagenes_activas',d.conexion_activa and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=d.habilitacion_id and w.imagenes_at>now()-interval '30 seconds' and w.imagenes_at>=w.solicitada_at),
   'modalidad_detectada',(select wh.modalidad from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=d.id),
   'postventa_hasta',(select gestlok_chat_private.wai_postventa_hasta(d.id,wh.ciclo_id) from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),
   'ciclo_activo',(select wh.ciclo_id from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=d.id),
   'cerrado_at',(select ci.cerrado_at from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=d.id),
   'ciclos',coalesce((select jsonb_agg(jsonb_build_object('id',ci.id,'inicio_at',ci.inicio_at,'cerrado_at',ci.cerrado_at,'motivo',ci.motivo) order by ci.inicio_at) from gestlok_chat_private.wai_ciclos ci where ci.hilo_id=d.id),'[]'::jsonb),
   'alias',(select ac.alias from gestlok_chat_private.wai_alias_contactos ac where ac.sucursal_id=p_sucursal and ac.numero_clave=d.numero_clave),
   'nombre_agenda',(select ac.nombre from gestlok_chat_private.wai_nombres_agenda ac where ac.habilitacion_id=d.habilitacion_id and ac.numero_clave=d.numero_clave),
   'opciones_activas',d.conexion_activa and exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=d.habilitacion_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at),
   'atencion_manual',coalesce((select wh.manual from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'atencion_pendiente',coalesce((select wh.pendiente from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=d.id),false),
   'pedidos_habilitados',(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean,
   'resena_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url')),
   'transferencia_configurada',exists(select 1 from gestlok_chat_private.sucursales s where s.id=p_sucursal and length(btrim(s.datos_transferencia))>0),
   'reclamo_pendiente',exists(select 1 from gestlok_chat_private.wai_pedidos o where o.hilo_id=d.id and o.valoracion='problema' and o.resuelto_at is null),
   'pedidos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'ficha',o.ficha,'estado',o.estado,'modalidad',o.modalidad,'demora_min',o.demora_min,'creado_at',o.creado_at,'atencion_finalizada_at',o.atencion_finalizada_at,'consulta_at',o.consulta_at,'consulta_encolada',o.consulta_enviada_at is not null and o.consulta_cancelada_at is null,'consulta_cancelada',o.consulta_cancelada_at is not null,'consulta_vencida',not gestlok_chat_private.wai_pedido_consentimiento(pv),'valoracion',o.valoracion,'resuelto',o.resuelto_at is not null,'detalle',o.detalle,'tiene_foto',o.foto is not null) order by o.creado_at desc,o.id) from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos pv on pv.id=o.piloto_id where o.hilo_id=d.id),'[]'::jsonb),
   'mensajes',hist.mensajes
 ) order by coalesce(hist.ultima_fecha,d.fecha) desc,d.id),'[]'::jsonb)) into resultado
 from datos d cross join lateral (
   select coalesce(jsonb_agg(jsonb_build_object(
     'id',m.id,'piloto',m.piloto_id,'ciclo_id',m.ciclo_id,'imagen_url',m.imagen_url,'adjunto_estado',m.adjunto_estado,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v),'seleccion',m.opcion_elegida,'estado_votacion',gestlok_chat_private.wai_votacion_estado(m),'multiple',coalesce((m.interaccion->>'multiple')::boolean,false),'cantidad',m.interaccion->'cantidad') end,'origen',case when m.direccion='entrada' and m.evento like 'pedido:%' then 'valoracion' when m.direccion='entrada' and (m.evento like 'voto:%' or m.evento like 'agente-voto:%') then 'opcion' else m.origen end,'direccion',m.direccion,'texto',m.texto,'entregado',m.entregado_at is not null,'editado',m.editado_at is not null,'eliminado',m.eliminado_at is not null,
     'accion_tipo',m.accion_tipo,'accion_estado',case when m.accion_estado='reservado' and m.accion_reservada_at<now()-interval '45 seconds' then 'incierto' when m.accion_estado='pendiente' and m.accion_solicitada_at<now()-interval '60 seconds' then 'incierto' else m.accion_estado end,'accion_entregada',m.accion_entregada_at is not null,
     'puede_editar',m.interaccion is null and m.imagen_url is null and d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and m.creado_at>now()-interval '15 minutes' and (m.accion_estado is null or m.accion_estado='enviado'),
     'puede_eliminar',m.interaccion is null and d.conexion_activa and m.piloto_id=d.piloto_activo and m.direccion='salida' and m.creado_por=auth.uid() and m.wa_id is not null and m.estado='aceptado' and m.eliminado_at is null and (m.accion_estado is null or m.accion_estado='enviado'),
     'leido',case when m.direccion='entrada' then exists(select 1 from gestlok_chat_private.wai_lecturas l where l.mensaje_id=m.id and l.usuario_id=auth.uid()) else true end,
     'evento',case when m.direccion='salida' then m.evento end,
     'estado',case when m.cancelada_at is not null then 'cancelado' when m.estado='reservado' and m.reservado_at<now()-interval '45 seconds' then 'incierto' when m.estado='pendiente' and (q.cancelado or q.vence_at<=now()) then 'incierto' else m.estado end,
     'fecha',m.creado_at
   ) order by m.creado_at,m.id),'[]'::jsonb) as mensajes,max(m.creado_at) as ultima_fecha
   from candidatos q join gestlok_chat_private.wai_mensajes m on m.piloto_id=q.id
   where q.habilitacion_id=d.habilitacion_id and q.numero_clave=d.numero_clave
 ) hist;
 return resultado;
end$function$;
revoke all on function public.gestlok_chat_wai_bandeja(p_sucursal uuid, p_accion text, p_piloto uuid, p_texto text, p_evento text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_bandeja(p_sucursal uuid, p_accion text, p_piloto uuid, p_texto text, p_evento text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_central_admin(p_accion text DEFAULT 'estado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.wai_servidor_central; k text; u uuid;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();
 if not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then raise exception 'Servidor central disponible solo en Prueba' using errcode='42501';end if;
 if p_accion='preparar' then
  k=encode(extensions.gen_random_bytes(32),'hex');
  insert into gestlok_chat_private.wai_servidor_central(id,clave_hash,creado_por)
  values(true,encode(sha256(convert_to(k,'UTF8')),'hex'),u) on conflict(id) do nothing;
  if not found then raise exception 'El servidor central ya está preparado. No se sustituye su configuración.';end if;
  return jsonb_build_object('clave',k,'preparado',true);
 elsif p_accion='rotar' then
  select * into c from gestlok_chat_private.wai_servidor_central where id for update;
  if not found then raise exception 'No hay configuración central para recuperar';end if;
  if c.vence_at>clock_timestamp() then raise exception 'Detené primero la instancia activa y esperá a que desaparezca su señal.';end if;
  k=encode(extensions.gen_random_bytes(32),'hex');
  update gestlok_chat_private.wai_servidor_central set clave_hash=encode(sha256(convert_to(k,'UTF8')),'hex'),instancia=null,vence_at=null,senal_at=null,creado_por=u,creado_at=clock_timestamp() where id;
  update gestlok_chat_private.wai_sesiones set clave_hash=encode(extensions.gen_random_bytes(32),'hex'),revision=gen_random_uuid(),estado='sin_senal',senal_at=null,wa_verificada_at=null,qr=null,qr_vence=null,opciones_at=null,multi_at=null
  where central_instancia is not null;
  return jsonb_build_object('clave',k,'preparado',true);
 elsif p_accion is distinct from 'estado' then raise exception 'Acción inválida';end if;
 select * into c from gestlok_chat_private.wai_servidor_central where id;
 return jsonb_build_object('preparado',c.id is not null,'activo',coalesce(c.vence_at>clock_timestamp(),false),
  'senal_at',c.senal_at,'lineas',(select count(*) from gestlok_chat_private.wai_central_lineas()));
end$function$;
revoke all on function public.gestlok_chat_wai_central_admin(p_accion text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_central_admin(p_accion text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_central_sync(p_clave text, p_instancia uuid, p_accion text DEFAULT 'sincronizar'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c gestlok_chat_private.wai_servidor_central; l record; k text; k_hash text; resultado jsonb:='[]'::jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or p_instancia is null
 or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then return null;end if;
 select * into c from gestlok_chat_private.wai_servidor_central where id and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') for update;
 if not found then return null;end if;
 if c.instancia is distinct from p_instancia and c.vence_at>clock_timestamp() then return jsonb_build_object('ok',false,'ocupado',true);end if;
 if p_accion='liberar' then
  if c.instancia=p_instancia then
   update gestlok_chat_private.wai_servidor_central set instancia=null,vence_at=null where id;
   update gestlok_chat_private.wai_sesiones set estado='sin_senal',senal_at=null,wa_verificada_at=null,qr=null,qr_vence=null,opciones_at=null,multi_at=null
   where central_instancia=p_instancia;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_accion is distinct from 'sincronizar' then return null;end if;
 update gestlok_chat_private.wai_servidor_central set instancia=p_instancia,senal_at=clock_timestamp(),vence_at=clock_timestamp()+interval '45 seconds' where id;
 -- Paused / removed lines stop receiving and no longer have a live signal.
 update gestlok_chat_private.wai_sesiones w set estado='sin_senal',senal_at=null,wa_verificada_at=null,qr=null,qr_vence=null,opciones_at=null,multi_at=null
 where w.central_instancia is not null and not exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=w.habilitacion_id) and w.senal_at is not null;
 for l in select * from gestlok_chat_private.wai_central_lineas() order by id loop
  k=encode(extensions.hmac(convert_to('wai-central-v1:'||p_instancia::text||':'||l.id::text,'UTF8'),decode(p_clave,'hex'),'sha256'),'hex');
  k_hash=encode(sha256(convert_to(k,'UTF8')),'hex');
  -- First enrollment transfers control from the manually configured connector.
  -- Same line ID keeps the private WhatsApp credentials on the same machine.
  insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash,central_instancia)
  values(l.id,k_hash,p_instancia)
  on conflict(habilitacion_id) do update set clave_hash=excluded.clave_hash,central_instancia=excluded.central_instancia,
  revision=gen_random_uuid(),orden='reconectar',solicitada_at=clock_timestamp(),estado='sin_senal',senal_at=null,wa_verificada_at=null,
  qr=null,qr_vence=null,opciones_at=null,imagenes_at=null,salsas_at=null,multi_at=null,multi_revision=null
  where wai_sesiones.clave_hash is distinct from excluded.clave_hash or wai_sesiones.central_instancia is distinct from excluded.central_instancia;
  resultado=resultado||jsonb_build_array(jsonb_build_object('id',l.id,'number',l.numero,'key',k));
 end loop;
 return jsonb_build_object('ok',true,'sessions',resultado,'lease_seconds',45);
end$function$;
revoke all on function public.gestlok_chat_wai_central_sync(p_clave text, p_instancia uuid, p_accion text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_central_sync(p_clave text, p_instancia uuid, p_accion text) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_comercios(p_accion text DEFAULT 'listar'::text, p_sucursal uuid DEFAULT NULL::uuid, p_rubro text DEFAULT NULL::text, p_activo boolean DEFAULT NULL::boolean, p_numero text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; v_local gestlok_chat_private.sucursales;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Habilitación exclusiva de la administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();
 if p_accion in ('configurar','registrar') then
  if not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then raise exception 'Esta versión de WAI todavía está en Prueba' using errcode='42501';end if;
  if p_rubro is distinct from 'gastronomia' or p_activo is null then raise exception 'Por el momento WAI admite únicamente gastronomía' using errcode='22023';end if;
  select x.* into v_local from gestlok_chat_private.sucursales x join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
   join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
   where x.id=p_sucursal and e.nombre_publico ilike '%(prueba)%';
  if not found then raise exception 'Seleccioná una sucursal de prueba habilitada' using errcode='42501';end if;
  if p_accion='registrar' then
   if not p_activo then raise exception 'Activá WAI para registrar una línea';end if;
   perform public.gestlok_chat_admin_whatsapp_premium('agregar',v_local.tenant_id,v_local.local_id,array[p_numero]);
  end if;
  insert into gestlok_chat_private.wai_comercios(sucursal_id,rubro,activo,actualizado_por)
  values(v_local.id,p_rubro,p_activo,u)
  on conflict(sucursal_id) do update set rubro=excluded.rubro,activo=excluded.activo,actualizado_at=clock_timestamp(),actualizado_por=u;
  -- Pausing revokes the test grant; it does not erase chats or credentials.
  if not p_activo then update gestlok_chat_private.wai_pilotos set cancelado=true where sucursal_id=v_local.id and not cancelado and vence_at>now();end if;
 elsif p_accion is distinct from 'listar' then raise exception 'Acción inválida';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'empresa',e.nombre_publico,'nombre',s.nombre,
  'rubro',c.rubro,'activo',coalesce(c.activo,false),'lineas',(select count(*) from gestlok_chat_private.whatsapp_premium_habilitaciones h where h.tenant_id=s.tenant_id and h.local_id=s.local_id and h.habilitada))
  order by e.nombre_publico,s.nombre) from gestlok_chat_private.sucursales s
  join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id and e.habilitada
  join public.docs d on d.tenant_id=s.tenant_id and d.col='locales' and d.id=s.local_id
  left join gestlok_chat_private.wai_comercios c on c.sucursal_id=s.id
  where e.nombre_publico ilike '%(prueba)%'),'[]'::jsonb);
end$function$;
revoke all on function public.gestlok_chat_wai_comercios(p_accion text, p_sucursal uuid, p_rubro text, p_activo boolean, p_numero text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_comercios(p_accion text, p_sucursal uuid, p_rubro text, p_activo boolean, p_numero text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_conexiones(p_sucursal uuid DEFAULT NULL::uuid, p_accion text DEFAULT 'listar'::text, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
 a boolean := gestlok_chat_private.es_creadora_chat();
 clave text; resultado jsonb;
begin
 if auth.uid() is null then raise exception 'Sin permiso' using errcode='42501'; end if;
 if a then perform gestlok_platform.require_admin();
 elsif p_sucursal is not null then perform gestlok_chat_private.exigir(p_sucursal,'gestionar');
 else raise exception 'Sin permiso' using errcode='42501'; end if;
 if p_accion is null or p_accion not in ('listar','preparar','rotar_clave','reconectar','qr','revalidar') then raise exception 'Acción inválida' using errcode='22023'; end if;
 if p_accion<>'listar' then
   select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
    join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
    join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
    join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
    where x.id=p_id and x.habilitada and gestlok_chat_private.wai_rubro_activo(s.id) and (p_sucursal is null or s.id=p_sucursal)
    for update of x;
   if not found then raise exception 'Número no habilitado en este local' using errcode='42501'; end if;
   if p_accion in ('preparar','rotar_clave') then
     if exists(select 1 from gestlok_chat_private.wai_servidor_central where id) then raise exception 'El servidor central administra automáticamente las líneas. No descargues otra configuración.';end if;
     if not a then raise exception 'Solo administradora' using errcode='42501'; end if;
     if p_accion='preparar' and exists(select 1 from gestlok_chat_private.wai_sesiones where habilitacion_id=h.id) then
       raise exception 'Conector ya preparado; no se reemplaza su clave' using errcode='22023';
     end if;
     clave:=encode(extensions.gen_random_bytes(32),'hex');
     insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash)
      values(h.id,encode(sha256(convert_to(clave,'UTF8')),'hex'))
      on conflict(habilitacion_id) do update set clave_hash=excluded.clave_hash,revision=gen_random_uuid(),orden='reconectar',solicitada_at=now(),senal_at=null,estado='sin_senal',qr=null,qr_vence=null,wa_verificada_at=null;
     return jsonb_build_object('id',h.id,'clave',clave);
   elsif p_accion='revalidar' then
     if p_sucursal is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501'; end if;
     update gestlok_chat_private.wai_sesiones w set revision=gen_random_uuid(),orden='qr_forzado',solicitada_at=now(),estado='reconectando',qr=null,qr_vence=null,wa_verificada_at=null
      where w.habilitacion_id=h.id and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.solicitada_at<=now()-interval '10 seconds';
     if not found then raise exception 'Conector sin señal o solicitud reciente. Actualizá el estado.' using errcode='22023'; end if;
     update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=h.id and not cancelado and vence_at>now();
   else
     -- No desconectar una sesión sana para regenerar un QR; no duplicar solicitudes.
     update gestlok_chat_private.wai_sesiones w set revision=gen_random_uuid(),
      orden=p_accion,solicitada_at=now(),estado='reconectando',qr=null,qr_vence=null,wa_verificada_at=null
     where w.habilitacion_id=h.id and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '90 seconds'
       and (w.estado<>'conectado' or p_accion='reconectar' and w.senal_at<=now()-interval '45 seconds')
       and w.solicitada_at<=now()-interval '10 seconds';
     if not found then raise exception 'Conector sin señal, recuperándose o ya conectado. Actualizá el estado.' using errcode='22023'; end if;
   end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'numero',x.numero,'empresa',e.nombre_publico,'local',coalesce(d.data->>'nombre',x.local_id),
  'habilitada',x.habilitada and coalesce(e.habilitada,false) and s.id is not null and d.id is not null and gestlok_chat_private.wai_rubro_activo(s.id),'preparada',w.habilitacion_id is not null,
  'centralizada',exists(select 1 from gestlok_chat_private.wai_servidor_central where id),
  'recepcion_prueba',coalesce((select r.activo from gestlok_chat_private.wai_recepcion_prueba r where r.habilitacion_id=x.id),false),
  'multi_ensayos',coalesce(w.multi_at>now()-interval '30 seconds' and w.multi_revision=w.revision,false),'ensayos_activos',(select count(*) from gestlok_chat_private.wai_pilotos p where p.habilitacion_id=x.id and not p.cancelado and p.vence_at>now()),'senal_at',w.senal_at,'wa_verificada_at',w.wa_verificada_at,'estado',case when not x.habilitada or not coalesce(e.habilitada,false) or s.id is null or d.id is null or not gestlok_chat_private.wai_rubro_activo(s.id) then 'pausado'
    when w.habilitacion_id is null then 'sin_conector'
    when w.senal_at is null or w.senal_at<x.actualizada_at then 'sin_senal'
    when w.senal_at<=now()-interval '90 seconds' then 'sin_senal'
    when w.estado='qr' and coalesce(w.qr_vence<=now(),true) then 'qr_vencido'
    when w.estado='conectado' and (w.wa_verificada_at is null or w.wa_verificada_at<=now()-interval '35 seconds') then 'verificando'
    else w.estado end,
  'qr',case when x.habilitada and e.habilitada and s.id is not null and d.id is not null and gestlok_chat_private.wai_rubro_activo(s.id) and w.estado='qr' and w.senal_at>=x.actualizada_at and w.senal_at>now()-interval '90 seconds' and w.qr_vence>now() then w.qr end,
  'qr_vence',case when w.estado='qr' then w.qr_vence end
 ) order by e.nombre_publico,x.local_id,x.numero),'[]'::jsonb) into resultado
 from gestlok_chat_private.whatsapp_premium_habilitaciones x
 left join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id
 left join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 left join public.docs d on d.tenant_id=x.tenant_id and d.col='locales' and d.id=x.local_id
 left join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=x.id
 where (p_sucursal is null and a) or s.id=p_sucursal;
 return resultado;
end$function$;
revoke all on function public.gestlok_chat_wai_conexiones(p_sucursal uuid, p_accion text, p_id uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_conexiones(p_sucursal uuid, p_accion text, p_id uuid) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_contacto_alias(p_sucursal uuid, p_piloto uuid, p_alias text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; a text;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal;
 if not found then raise exception 'Conversación no disponible' using errcode='22023';end if;
 a:=nullif(btrim(p_alias),'');
 if a is not null and (length(a)>100 or a ~ '[[:cntrl:]]') then raise exception 'Alias inválido' using errcode='22023';end if;
 insert into gestlok_chat_private.wai_alias_contactos(sucursal_id,numero_clave,alias,actualizado_por)
 values(p_sucursal,gestlok_chat_private.whatsapp_exclusion_key(p.tester),a,auth.uid())
 on conflict(sucursal_id,numero_clave) do update set alias=excluded.alias,actualizado_at=now(),actualizado_por=excluded.actualizado_por;
 return true;
end$function$;
revoke all on function public.gestlok_chat_wai_contacto_alias(p_sucursal uuid, p_piloto uuid, p_alias text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_contacto_alias(p_sucursal uuid, p_piloto uuid, p_alias text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_ensayo_autorizado(p_id uuid, p_clave text, p_revision uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',now())
 from gestlok_chat_private.wai_pilotos p
 join gestlok_chat_private.wai_sesiones w on w.habilitacion_id=p.habilitacion_id
 join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=p.habilitacion_id and h.habilitada
 join gestlok_chat_private.sucursales s on s.id=p.sucursal_id and s.tenant_id=h.tenant_id and s.local_id=h.local_id
 join gestlok_chat_private.empresas e on e.tenant_id=h.tenant_id and e.habilitada
 join public.docs d on d.tenant_id=h.tenant_id and d.id=h.local_id and d.col='locales'
 where p.habilitacion_id=p_id and p_clave ~ '^[a-f0-9]{64}$'
 and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision
 and gestlok_chat_private.wai_rubro_activo(p.sucursal_id) and not p.cancelado and p.vence_at>now()
 and coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 and not public.gestlok_chat_srv_whatsapp_excluido(p.sucursal_id,p.tester)
 order by p.creado_at desc limit 1
$function$;
revoke all on function public.gestlok_chat_wai_ensayo_autorizado(p_id uuid, p_clave text, p_revision uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_ensayo_autorizado(p_id uuid, p_clave text, p_revision uuid) to anon,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_ensayos_autorizados(p_id uuid, p_clave text, p_revision uuid, p_activo boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w gestlok_chat_private.wai_sesiones; grants jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then return null;end if;
 select x.* into w from gestlok_chat_private.wai_sesiones x join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=x.habilitacion_id and h.habilitada
 where x.habilitacion_id=p_id and x.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and x.revision=p_revision and (not coalesce(p_activo,false) or x.senal_at>=h.actualizada_at);
 if not found then return null;end if;
 if w.central_instancia is not null and not exists(select 1 from gestlok_chat_private.wai_servidor_central c where c.id and c.instancia=w.central_instancia and c.vence_at>now() and exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id)) then return null;end if;
 if p_activo then
  if w.estado<>'conectado' or w.senal_at<=now()-interval '30 seconds' or w.wa_verificada_at<=now()-interval '35 seconds' or w.senal_at is null or w.wa_verificada_at is null then return null;end if;
  update gestlok_chat_private.wai_sesiones set multi_at=now(),multi_revision=p_revision where habilitacion_id=p_id and revision=p_revision;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp()) order by p.creado_at,p.id),'[]'::jsonb)
 into grants from gestlok_chat_private.wai_pilotos p where p.habilitacion_id=p_id and gestlok_chat_private.wai_pedido_consentimiento(p) and (not p_activo or gestlok_chat_private.wai_piloto_vigente(p));
 return jsonb_build_object('hora_servidor',clock_timestamp(),'ensayos',grants,'recepcion_entrante',gestlok_chat_private.wai_recepcion_activa(p_id));
end$function$;
revoke all on function public.gestlok_chat_wai_ensayos_autorizados(p_id uuid, p_clave text, p_revision uuid, p_activo boolean) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_ensayos_autorizados(p_id uuid, p_clave text, p_revision uuid, p_activo boolean) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_estado_global()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare datos jsonb;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Sin permiso' using errcode='42501';end if;
 perform gestlok_platform.require_admin();
 datos=public.gestlok_chat_wai_conexiones(null,'listar',null);
 return coalesce((select jsonb_agg(jsonb_build_object('id',v->>'id','numero',v->>'numero','empresa',v->>'empresa','local',v->>'local','slug',s.slug,'habilitada',v->'habilitada','estado',v->>'estado','senal_at',v->>'senal_at','wa_verificada_at',v->>'wa_verificada_at') order by v->>'empresa',v->>'local',v->>'numero')
  from jsonb_array_elements(datos) v join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=(v->>'id')::uuid
  left join gestlok_chat_private.sucursales s on s.tenant_id=h.tenant_id and s.local_id=h.local_id),'[]'::jsonb);
end$function$;
revoke all on function public.gestlok_chat_wai_estado_global() from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_estado_global() to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_marcar_leidos(p_sucursal uuid, p_piloto uuid, p_mensajes uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; v integer;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 if coalesce(cardinality(p_mensajes),0) not between 1 and 100 then raise exception 'Mensajes inválidos' using errcode='22023';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal;
 if not found then raise exception 'Prueba no disponible' using errcode='22023';end if;
 if exists(select 1 from unnest(p_mensajes) as i(id) where not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.id=i.id and m.direccion='entrada' and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester))) then raise exception 'Mensaje no disponible' using errcode='42501';end if;
 insert into gestlok_chat_private.wai_lecturas(usuario_id,mensaje_id)
 select auth.uid(),m.id from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.id=any(p_mensajes) and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester)
 on conflict do nothing;
 select count(*) into v from gestlok_chat_private.wai_lecturas l where l.usuario_id=auth.uid() and l.mensaje_id=any(p_mensajes);
 return v;
end$function$;
revoke all on function public.gestlok_chat_wai_marcar_leidos(p_sucursal uuid, p_piloto uuid, p_mensajes uuid[]) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_marcar_leidos(p_sucursal uuid, p_piloto uuid, p_mensajes uuid[]) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_mensaje_accion(p_sucursal uuid, p_piloto uuid, p_mensaje uuid, p_accion text, p_texto text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=p_piloto and sucursal_id=p_sucursal for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) then raise exception 'Prueba no disponible' using errcode='22023';end if;
 select * into m from gestlok_chat_private.wai_mensajes where id=p_mensaje and piloto_id=p.id and direccion='salida' and creado_por=auth.uid() for update;
 if not found or m.interaccion is not null or m.wa_id is null or m.wa_ruta is null or m.estado<>'aceptado' or m.eliminado_at is not null or (m.accion_estado is not null and m.accion_estado<>'enviado') then raise exception 'Este mensaje no admite modificaciones' using errcode='22023';end if;
 if p_accion is null or p_accion not in ('editar','eliminar') or (p_accion='editar' and (p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or m.creado_at<=now()-interval '15 minutes')) then raise exception 'Acción inválida o plazo de edición vencido' using errcode='22023';end if;
 update gestlok_chat_private.wai_mensajes set accion_tipo=p_accion,accion_texto=case when p_accion='editar' then btrim(p_texto) end,accion_estado='pendiente',accion_solicitada_at=now(),accion_reservada_at=null,wa_accion_id=null,accion_entregada_at=null where id=m.id;
 return true;
end$function$;
revoke all on function public.gestlok_chat_wai_mensaje_accion(p_sucursal uuid, p_piloto uuid, p_mensaje uuid, p_accion text, p_texto text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_mensaje_accion(p_sucursal uuid, p_piloto uuid, p_mensaje uuid, p_accion text, p_texto text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_menu(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos; s gestlok_chat_private.sucursales; productos jsonb; numero text;
begin
 p=gestlok_chat_private.wai_menu_piloto(p_token);
 if p.id is null then return jsonb_build_object('ok',false,'error','El acceso venció. Pedí otra carta por WhatsApp.');end if;
 select * into s from gestlok_chat_private.sucursales where id=p.sucursal_id;
 select h.numero into numero from gestlok_chat_private.whatsapp_premium_habilitaciones h where h.id=p.habilitacion_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'nombre',o.nombre,'precio',o.precio,'categoria',c.nombre,
 'grupos',g.grupos,'salsa_precio',gestlok_chat_private.wai_salsa_precio(p,jsonb_build_object('grupos',g.grupos)))
 order by c.orden,o.orden,o.nombre),'[]') into productos
 from gestlok_chat_private.wai_ofertas(s.id,'menu_interactivo') o
 join gestlok_chat_private.productos pr on pr.id=o.id join gestlok_chat_private.categorias c on c.id=pr.categoria_id
 cross join lateral (select coalesce(jsonb_agg(z),'[]'::jsonb) grupos from jsonb_array_elements(o.opciones) z where coalesce((z->>'obligatorio')::boolean,false)) g;
 return jsonb_build_object('ok',true,'local',s.nombre,'productos',productos,
 'retiro',s.acepta_retiro,'delivery',s.acepta_envio,'envio',s.envio_costo,'minimo',s.pedido_minimo,
 'demora_retiro',s.demora_retiro,'demora_envio',s.demora_envio,'pagos_retiro',s.medios_pago_retiro,
 'pagos_envio',s.medios_pago_envio,'zona',s.envio_zona,'whatsapp',regexp_replace(numero,'[^0-9]','','g'));
end$function$;
revoke all on function public.gestlok_chat_wai_menu(p_token uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_menu(p_token uuid) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_menu_preparar(p_token uuid, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l gestlok_chat_private.wai_menu_accesos; p gestlok_chat_private.wai_pilotos; f jsonb; ref uuid;
begin
 select * into l from gestlok_chat_private.wai_menu_accesos where id=p_token for update;
 p=gestlok_chat_private.wai_menu_piloto(p_token);
 if p.id is null then return jsonb_build_object('ok',false,'error','El acceso venció. Pedí otra carta por WhatsApp.');end if;
 f=gestlok_chat_private.wai_menu_armar(p,p_datos);
 if f is null then return jsonb_build_object('ok',false,'error','Revisá los gustos y cantidades. Algún producto o condición pudo cambiar.');end if;
 -- Do not accept altered totals displayed in the web. Customer can refresh
 -- and review current price if price changed while the menu was open.
 if coalesce(p_datos->>'total','') !~ '^[0-9]+(\.[0-9]{1,2})?$' or (p_datos->>'total')::numeric is distinct from (f->>'total')::numeric then
  return jsonb_build_object('ok',false,'error','El total cambió. Volvé a cargar la carta para revisar los precios.');end if;
 if l.referencia is not null then
  if l.ficha is distinct from f then return jsonb_build_object('ok',false,'error','Ya preparaste un pedido con este acceso. Pedí una carta nueva para cambiarlo.');end if;
  ref=l.referencia;
 else
  ref=gen_random_uuid();update gestlok_chat_private.wai_menu_accesos set referencia=ref,ficha=f where id=l.id;
 end if;
 return jsonb_build_object('ok',true,'referencia',ref,'total',f->'total');
end$function$;
revoke all on function public.gestlok_chat_wai_menu_preparar(p_token uuid, p_datos jsonb) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_menu_preparar(p_token uuid, p_datos jsonb) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_pedido(p_sucursal uuid, p_hilo uuid, p_accion text, p_pedido uuid DEFAULT NULL::uuid, p_modalidad text DEFAULT NULL::text, p_demora integer DEFAULT 2, p_evento uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a gestlok_chat_private.wai_pilotos%rowtype;p gestlok_chat_private.wai_pilotos%rowtype;o gestlok_chat_private.wai_pedidos%rowtype;s gestlok_chat_private.sucursales%rowtype;mensaje text;v_estado text;url text;f jsonb;demora text;
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 select * into a from gestlok_chat_private.wai_pilotos where id=p_hilo and sucursal_id=p_sucursal;
 if not found then raise exception 'Conversación no disponible';end if;
 -- Resolve to the stable oldest thread; prevent parallel orders via aliases.
 if a.id is distinct from (select x.id from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) order by x.creado_at,x.id limit 1) then raise exception 'Conversación no disponible';end if;
 if p_accion='resolver' then
  update gestlok_chat_private.wai_pedidos set resuelto_at=coalesce(resuelto_at,now()),actualizado_at=now()
   where id=p_pedido and hilo_id=a.id and valoracion='problema';
  if found then update gestlok_chat_private.wai_atencion_hilos set pendiente=false,manual=false,actualizado_at=now() where hilo_id=a.id and pedido_solicitado_at is null and not exists(select 1 from gestlok_chat_private.wai_pedidos z where z.hilo_id=a.id and z.valoracion='problema' and z.resuelto_at is null);return true;end if;return false;
 end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.sucursal_id=a.sucursal_id and x.habilitacion_id=a.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(x.tester)=gestlok_chat_private.whatsapp_exclusion_key(a.tester) and not x.cancelado and x.vence_at>now() order by x.creado_at desc,x.id desc limit 1 for update;
 if not found or not coalesce(gestlok_chat_private.wai_piloto_vigente(p),false) or not exists(select 1 from gestlok_chat_private.wai_mensajes m join gestlok_chat_private.wai_pilotos q on q.id=m.piloto_id where m.direccion='entrada' and m.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester)) then raise exception 'Esperá una conexión y un mensaje autorizado';end if;
 select * into s from gestlok_chat_private.sucursales where id=p_sucursal;
 if p_accion='aceptar' and exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=a.id and ci.cerrado_at is not null) then raise exception 'Conversación finalizada';end if;
 if p_accion='transferencia' then
  if exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id where wh.hilo_id=a.id and ci.cerrado_at is not null) and not exists(select 1 from gestlok_chat_private.wai_pedido_reciente(p) r where r.ficha->>'pago'='transferencia') then raise exception 'No hay transferencia pendiente en un pedido reciente';end if;
  if p_evento is null then raise exception 'Solicitud inválida';end if;
  if length(btrim(coalesce(s.datos_transferencia,''))) not between 1 and 700 then raise exception 'Cargá los datos de transferencia en Ajustes del local';end if;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'transferencia:'||p_evento,'Datos para la transferencia:'||chr(10)||s.datos_transferencia) then raise exception 'Límite de respuestas de prueba';end if;
  return true;
 elsif p_accion='aceptar' then
  if not (gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'pedidos')::boolean then raise exception 'El seguimiento de pedidos está desactivado en Ajustes WAI';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  select wh.ficha into f from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=a.id for update;
  if f->>'programado_para' is not null and clock_timestamp()<(f->>'programado_para')::timestamptz then raise exception 'Pedido programado: confirmalo cuando abra el local';end if;
  if coalesce((gestlok_chat_private.estado_atencion(s)->>'habilitado')::boolean,false) and not coalesce((gestlok_chat_private.estado_atencion(s)->>'abierto')::boolean,false) then raise exception 'El local está cerrado. Confirmá el pedido al abrir';end if;
  if f is not null and f->>'estado' is distinct from 'pendiente' then raise exception 'Esperá que el cliente complete el pedido';end if;
  if f ? 'carrito' and (not gestlok_chat_private.wai_carrito_vigente(p,f) or (f->>'modalidad'='delivery' and (s.envio_costo is distinct from (f->>'envio')::numeric or (f->>'subtotal')::numeric<s.pedido_minimo)) or not coalesce((f->>'pago')=any(case f->>'modalidad' when 'delivery' then s.medios_pago_envio else s.medios_pago_retiro end),false)) then raise exception 'El catálogo o las condiciones cambiaron. Revisá el pedido antes de confirmarlo';end if;
  if not exists(select 1 from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=a.id and wh.pedido_solicitado_at is not null) then raise exception 'No hay un pedido nuevo pendiente de confirmación';end if;
  select wh.modalidad into p_modalidad from gestlok_chat_private.wai_atencion_hilos wh join gestlok_chat_private.wai_ciclos ci on ci.id=wh.ciclo_id and ci.cerrado_at is null where wh.hilo_id=a.id;
  p_demora=(gestlok_chat_private.wai_atencion_ajustes(p_sucursal)->>'seguimiento_min')::integer;
  if p_evento is null or p_modalidad is null or (p_modalidad='retiro' and not s.acepta_retiro) or (p_modalidad='delivery' and not s.acepta_envio) then raise exception 'Esperá que el cliente confirme retiro o delivery';end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and revision_evento=p_evento) then return true;end if;
  if exists(select 1 from gestlok_chat_private.wai_pedidos where hilo_id=a.id and (estado<>'entregado' and atencion_finalizada_at is null and creado_at>clock_timestamp()-interval '4 hours' or valoracion='problema' and resuelto_at is null)) then raise exception 'Finalizá el pedido o el reclamo anterior';end if;
  insert into gestlok_chat_private.wai_pedidos(hilo_id,piloto_id,modalidad,demora_min,revision_evento,ciclo_id,ficha,resena_enlace) values(a.id,p.id,p_modalidad,p_demora,p_evento,(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=a.id),case when f is null then null else f||'{"estado":"confirmado"}'::jsonb end,case when gestlok_chat_private.url_resena_valida(s.mensajes->>'resena_url') then s.mensajes->>'resena_url' end) returning * into o;
  update gestlok_chat_private.wai_atencion_hilos set pedido_solicitado_at=null,pedido_texto=null,pendiente=false,ficha=case when f is null then null else f||'{"estado":"confirmado"}'::jsonb end,actualizado_at=clock_timestamp() where hilo_id=a.id;
  demora=case o.modalidad when 'retiro' then s.demora_retiro else s.demora_envio end;
  mensaje='¡Recibimos tu pedido! Ya está confirmado y en preparación. Modalidad: '||case o.modalidad when 'retiro' then 'retiro en el local.' else 'delivery.' end||case when nullif(btrim(demora),'') is not null then chr(10)||'Demora aproximada: '||btrim(demora)||'.' else '' end;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':preparacion',mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  return true;
 end if;
 select * into o from gestlok_chat_private.wai_pedidos where id=p_pedido and hilo_id=a.id for update;
 if not found then raise exception 'Pedido no disponible';end if;
 if p_accion='listo' then
  if o.creado_at<=now()-interval '4 hours' then raise exception 'Pedido fuera de la atención reciente';end if;
  v_estado=case o.modalidad when 'retiro' then 'listo' else 'en_camino' end;
  if o.estado=v_estado then return true;end if;
  if o.estado<>'preparacion' then raise exception 'Estado de pedido inválido';end if;
  mensaje=case o.modalidad when 'retiro' then '¡Tu pedido está listo para retirar en '||s.nombre||'!' else '¡Tu pedido está en camino!' end;
  if not gestlok_chat_private.wai_pedido_encolar(p.id,'pedido:'||o.id||':'||v_estado,mensaje) then raise exception 'Límite de respuestas de prueba';end if;
  update gestlok_chat_private.wai_pedidos set estado=v_estado,piloto_id=p.id,consulta_at=null,actualizado_at=now() where id=o.id;
 else raise exception 'Acción inválida';end if;
 return true;
end$function$;
revoke all on function public.gestlok_chat_wai_pedido(p_sucursal uuid, p_hilo uuid, p_accion text, p_pedido uuid, p_modalidad text, p_demora integer, p_evento uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_pedido(p_sucursal uuid, p_hilo uuid, p_accion text, p_pedido uuid, p_modalidad text, p_demora integer, p_evento uuid) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_pedido_foto(p_sucursal uuid, p_pedido uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Sin permiso' using errcode='42501';end if;
 return (select o.foto from gestlok_chat_private.wai_pedidos o join gestlok_chat_private.wai_pilotos p on p.id=o.hilo_id where o.id=p_pedido and p.sucursal_id=p_sucursal);
end$function$;
revoke all on function public.gestlok_chat_wai_pedido_foto(p_sucursal uuid, p_pedido uuid) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_pedido_foto(p_sucursal uuid, p_pedido uuid) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_piloto_autorizar(p_sucursal uuid, p_id uuid, p_tester text DEFAULT NULL::text, p_accion text DEFAULT 'autorizar'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype; v uuid;
begin
 if not gestlok_chat_private.es_creadora_chat() or gestlok_chat_private.wai_portal_nivel(p_sucursal) is null then raise exception 'Solo administradora' using errcode='42501';end if;
 perform gestlok_platform.require_admin();
 select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
 join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id where x.id=p_id and s.id=p_sucursal for update of x;
 if not found then raise exception 'Número no disponible' using errcode='42501';end if;
 if p_accion='cancelar' then
   update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=h.id and not cancelado and vence_at>now(); return null;
 end if;
 if p_accion is distinct from 'autorizar' or not h.habilitada or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 or p_tester is null or p_tester !~ '^\+[1-9][0-9]{7,14}$'
 or gestlok_chat_private.whatsapp_exclusion_key(h.numero)=gestlok_chat_private.whatsapp_exclusion_key(p_tester)
 or public.gestlok_chat_srv_whatsapp_excluido(p_sucursal,p_tester)
 or not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=h.id and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds')
 then raise exception 'Prueba no autorizada o conexión no verificada' using errcode='22023';end if;
 if exists(select 1 from gestlok_chat_private.wai_pilotos where habilitacion_id=h.id and not cancelado and vence_at>now() and gestlok_chat_private.whatsapp_exclusion_key(tester)=gestlok_chat_private.whatsapp_exclusion_key(p_tester)) then raise exception 'Ese contacto ya tiene una prueba vigente' using errcode='22023';end if;
 if exists(select 1 from gestlok_chat_private.wai_pilotos where habilitacion_id=h.id and not cancelado and vence_at>now()) and not exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=h.id and w.multi_revision=w.revision and w.multi_at>now()-interval '30 seconds') then raise exception 'Actualizá el conector privado para probar varios contactos simultáneos' using errcode='22023';end if;
 if (select count(*) from gestlok_chat_private.wai_pilotos where habilitacion_id=h.id and not cancelado and vence_at>now())>=5 then raise exception 'Máximo de cinco contactos simultáneos en ensayo' using errcode='22023';end if;
 insert into gestlok_chat_private.wai_pilotos(habilitacion_id,sucursal_id,tester,creado_por) values(h.id,p_sucursal,p_tester,auth.uid()) returning id into v;
 return v;
end$function$;
revoke all on function public.gestlok_chat_wai_piloto_autorizar(p_sucursal uuid, p_id uuid, p_tester text, p_accion text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_piloto_autorizar(p_sucursal uuid, p_id uuid, p_tester text, p_accion text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_piloto_motor(p_id uuid, p_clave text, p_revision uuid, p_accion text, p_piloto uuid DEFAULT NULL::uuid, p_jid text DEFAULT NULL::text, p_evento text DEFAULT NULL::text, p_texto text DEFAULT NULL::text, p_mensaje uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos%rowtype; m gestlok_chat_private.wai_mensajes%rowtype; jid text; entrada uuid; voto jsonb;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 -- Legacy connector must not choose an arbitrary customer if more than one is authorized.
 if p_piloto is null and (select count(*) from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and gestlok_chat_private.wai_piloto_vigente(x))>1 then return null;end if;
 select x.* into p from gestlok_chat_private.wai_pilotos x where x.habilitacion_id=p_id and (p_piloto is null or x.id=p_piloto) and gestlok_chat_private.wai_piloto_vigente(x) order by x.creado_at desc limit 1 for update;
 if not found then return null;end if;
 if p_accion='control' then
  update gestlok_chat_private.wai_sesiones set opciones_at=case when p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2') then now() else null end,imagenes_at=case when p_estado in ('opciones_imagen_v1','opciones_imagen_v2') then now() else null end,salsas_at=case when p_estado='opciones_imagen_v2' then now() else null end where habilitacion_id=p_id;
  perform gestlok_chat_private.wai_pedido_tick(p);
  perform gestlok_chat_private.wai_cierre_tick(p);
  if p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2') then perform gestlok_chat_private.wai_atencion_tick(p);perform gestlok_chat_private.wai_agente_tick(p);end if; return jsonb_build_object('id',p.id,'tester',p.tester,'vence_at',p.vence_at,'creado_at',p.creado_at,'hora_servidor',clock_timestamp(),'salientes',coalesce((select jsonb_agg(jsonb_build_object('wa_id',sm.wa_id,'ruta',sm.wa_ruta,'accion_id',sm.wa_accion_id)) from gestlok_chat_private.wai_mensajes sm where sm.piloto_id=p.id and sm.direccion='salida' and sm.wa_id is not null),'[]'::jsonb));end if;
 if p_piloto is distinct from p.id then return null;end if;
 if p_accion='alerta' then
  if p_estado not in ('voto_no_descifrado','voto_no_registrado','entrada_no_registrada','cola_llena','sincronizacion_pendiente') or p_estado is null then return null;end if;
  update gestlok_chat_private.wai_pilotos set alerta_sync=p_estado,alerta_sync_at=clock_timestamp() where id=p.id;
  return jsonb_build_object('ok',true);
 elsif p_accion='voto' then
  voto=gestlok_chat_private.wai_recibir_voto(p,p_jid,p_evento,p_texto);
  if coalesce((voto->>'ok')::boolean,false) and not coalesce((voto->>'ignorada')::boolean,false) and coalesce((voto->>'completo')::boolean,true) then
   if not exists(select 1 from gestlok_chat_private.wai_mensajes z where z.piloto_id=p.id and z.wa_id=p_evento and z.interaccion->>'tipo' in ('pedido','resena')) then
    perform gestlok_chat_private.wai_atencion_tick(p);
    perform gestlok_chat_private.wai_agente_tick(p);
   end if;
   begin
    perform gestlok_chat_private.wai_pedido_tick(p);
   exception when others then
    update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;
   end;
  end if;
  return voto;
 elsif p_accion='agenda' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_texto is null or length(btrim(p_texto)) not between 1 and 100 or p_texto ~ '[[:cntrl:]]' then return null;end if;
  insert into gestlok_chat_private.wai_nombres_agenda(habilitacion_id,numero_clave,nombre,sincronizado_at)
  values(p.habilitacion_id,gestlok_chat_private.whatsapp_exclusion_key(p.tester),btrim(p_texto),now())
  on conflict(habilitacion_id,numero_clave) do update set nombre=excluded.nombre,sincronizado_at=excluded.sincronizado_at;
  return jsonb_build_object('ok',true);
 elsif p_accion='recibir' then
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or length(p_evento) not between 1 and 200 or p_texto is null or length(btrim(p_texto)) not between 1 and 1000
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and direccion='entrada')>=120 then return null;end if;
  perform gestlok_chat_private.wai_cierre_tick(p);
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado) values(p.id,'entrada',p_texto,p_evento,p_jid,'recibido') on conflict(piloto_id,direccion,evento) do nothing returning id into entrada;
  if entrada is not null then
   if gestlok_chat_private.wai_postventa_texto(p,entrada,p_texto) then
    update gestlok_chat_private.wai_mensajes set ciclo_id=(select ciclo_id from gestlok_chat_private.wai_atencion_hilos where hilo_id=gestlok_chat_private.wai_hilo(p)) where id=entrada;
    perform gestlok_chat_private.wai_pedido_tick(p);
    return jsonb_build_object('ok',true);
   end if;
   perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
   if not (gestlok_chat_private.wai_atencion_ajustes(p.sucursal_id)->>'agente_activo')::boolean or coalesce((select wh.manual from gestlok_chat_private.wai_atencion_hilos wh where wh.hilo_id=gestlok_chat_private.wai_hilo(p)),false) then update gestlok_chat_private.wai_mensajes set agente_procesado_at=clock_timestamp() where id=entrada;end if;
   if exists(select 1 from gestlok_chat_private.wai_sesiones w where w.habilitacion_id=p_id and w.opciones_at>now()-interval '30 seconds' and w.opciones_at>=w.solicitada_at) then
    perform gestlok_chat_private.wai_atencion_tick(p);
    perform gestlok_chat_private.wai_agente_tick(p);
   end if;
   perform gestlok_chat_private.wai_pedido_tick(p);
  end if;
  return jsonb_build_object('ok',true);
 elsif p_accion='recibir_salida' then
  -- Authenticated fromMe event, mirrored from the linked phone; never enqueue a send.
  if p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
   or p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_texto is null or length(btrim(p_texto)) not between 1 and 1000 or p_estado is null or p_estado not in ('enviado','entregado')
   or (select count(*) from gestlok_chat_private.wai_mensajes where piloto_id=p.id and origen='telefono')>=20 then return null;end if;
  insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado,wa_id,wa_ruta,origen,entregado_at)
  values(p.id,'salida',p_texto,p_evento,p_jid,'aceptado',p_evento,p_jid,'telefono',case when p_estado='entregado' then now() end)
  on conflict do nothing;
  return jsonb_build_object('ok',true);
 elsif p_accion='tomar' then
  perform gestlok_chat_private.wai_pedido_tick(p);
  select x.jid into jid from gestlok_chat_private.wai_mensajes x join gestlok_chat_private.wai_pilotos q on q.id=x.piloto_id where x.direccion='entrada' and x.jid is not null and q.sucursal_id=p.sucursal_id and q.habilitacion_id=p.habilitacion_id and gestlok_chat_private.whatsapp_exclusion_key(q.tester)=gestlok_chat_private.whatsapp_exclusion_key(p.tester) order by x.creado_at desc,x.id desc limit 1;
  if jid is null then return null;end if;
  update gestlok_chat_private.wai_mensajes x set cancelada_at=clock_timestamp() where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and x.interaccion is not null and gestlok_chat_private.wai_votacion_estado(x) not in ('pendiente','abierta');
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.estado='pendiente' and x.cancelada_at is null and x.evento not like 'pedido:%:consulta' and (x.interaccion is null or p_estado in ('opciones_v1','opciones_imagen_v1','opciones_imagen_v2')) and (x.imagen_url is null or p_estado in ('opciones_imagen_v1','opciones_imagen_v2')) and (x.interaccion->>'tipo' is distinct from 'salsas' or p_estado='opciones_imagen_v2') order by x.creado_at,x.id limit 1 for update;
  if not found then return null;end if;
  update gestlok_chat_private.wai_mensajes set estado='reservado',reservado_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'jid',jid,'texto',case when m.imagen_url is not null then '' else m.texto end,'imagen_url',m.imagen_url,'interaccion',case when m.interaccion is null then null else jsonb_build_object('pregunta',m.interaccion->>'pregunta','multiple',coalesce((m.interaccion->>'multiple')::boolean,false),'opciones',(select jsonb_agg(jsonb_build_object('id',v->>'id','label',v->>'label')) from jsonb_array_elements(m.interaccion->'opciones') v)) end);
 elsif p_accion='entrega' then
  if p_evento is null then return null; end if;
  update gestlok_chat_private.wai_mensajes set entregado_at=coalesce(entregado_at,now()) where piloto_id=p.id and direccion='salida' and wa_id=p_evento and estado='aceptado';
  if found then return jsonb_build_object('ok',true); end if;
  update gestlok_chat_private.wai_mensajes set accion_entregada_at=coalesce(accion_entregada_at,now()) where piloto_id=p.id and direccion='salida' and wa_accion_id=p_evento and accion_estado='enviado';
  return jsonb_build_object('ok',found);
 elsif p_accion='tomar_accion' then
  select * into m from gestlok_chat_private.wai_mensajes x where x.piloto_id=p.id and x.direccion='salida' and x.accion_estado='pendiente' and x.interaccion is null and x.wa_id is not null order by x.accion_solicitada_at,x.id limit 1 for update;
  if not found then return null;end if;
  -- No reintentar una corrección vencida ni una acción ya reservada.
  if (m.accion_tipo='editar' and m.creado_at<=now()-interval '15 minutes') or m.accion_solicitada_at<=now()-interval '60 seconds' then
    update gestlok_chat_private.wai_mensajes set accion_estado='incierto' where id=m.id;return null;
  end if;
  update gestlok_chat_private.wai_mensajes set accion_estado='reservado',accion_reservada_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'wa_id',m.wa_id,'ruta',m.wa_ruta,'tipo',m.accion_tipo,'texto',m.accion_texto);
 elsif p_accion='resultado_accion' then
  if p_estado not in ('aceptado','incierto') or p_estado is null or (p_estado='aceptado' and (p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$')) then return null; end if;
  update gestlok_chat_private.wai_mensajes
   set texto=case when p_estado='aceptado' then case when accion_tipo='editar' then accion_texto else 'Mensaje eliminado' end else texto end,
       editado_at=case when p_estado='aceptado' and accion_tipo='editar' then now() else editado_at end,
       eliminado_at=case when p_estado='aceptado' and accion_tipo='eliminar' then now() else eliminado_at end,
       accion_estado=case when p_estado='aceptado' then 'enviado' else 'incierto' end,
       wa_accion_id=case when p_estado='aceptado' then p_evento else null end,accion_texto=null
   where id=p_mensaje and piloto_id=p.id and direccion='salida' and accion_estado='reservado';
  return jsonb_build_object('ok',found);
 elsif p_accion='resultado' then
  if p_estado is null or p_estado not in ('aceptado','incierto') then return null;end if;
  if p_estado='aceptado' and (p_evento is not null or p_jid is not null) then
    if p_evento is null or p_evento !~ '^[A-Za-z0-9_-]{1,200}$' or p_jid is null
      or not (p_jid ~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or p_jid ~ '^[0-9]{1,20}@lid$')
      or (p_jid like '%@s.whatsapp.net' and gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester))
    then return null;end if;
  end if;
  update gestlok_chat_private.wai_mensajes set estado=p_estado,wa_id=case when p_estado='aceptado' then p_evento end,wa_ruta=case when p_estado='aceptado' then p_jid end where id=p_mensaje and piloto_id=p.id and direccion='salida' and estado='reservado' returning * into m;
  if not found then return jsonb_build_object('ok',false);end if;
  if p_estado='aceptado' and m.continuar_texto is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_pedido_encolar(p.id,'agente:continuar:'||m.id,m.continuar_texto);
  end if;
  if p_estado='aceptado' and m.evento like 'pedido:%:preparacion' then
   perform gestlok_chat_private.wai_resena_invitar(p,o) from gestlok_chat_private.wai_pedidos o where o.hilo_id=gestlok_chat_private.wai_hilo(p) and m.evento in ('pedido:'||o.id||':preparacion','pedido:'||o.id||':entregado') and o.estado in ('preparacion','listo','en_camino','entregado');
  end if;
  if p_estado='aceptado' and (m.evento like 'pedido:%:preparacion' or m.evento like 'pedido:%:resena') then perform gestlok_chat_private.wai_cerrar_tras_resena(p);end if;
  if p_estado='incierto' and m.evento like 'pedido:%:resena' then update gestlok_chat_private.wai_pilotos set alerta_sync='sincronizacion_pendiente',alerta_sync_at=now() where id=p.id;end if;
  -- Only append the next choices when the photo/link was accepted. No caption and no poll after an uncertain send.
  if p_estado='aceptado' and m.continuar_carta is not null and m.ciclo_id is not null and exists(select 1 from gestlok_chat_private.wai_atencion_hilos h join gestlok_chat_private.wai_ciclos ci on ci.id=h.ciclo_id where h.hilo_id=gestlok_chat_private.wai_hilo(p) and ci.id=m.ciclo_id and ci.cerrado_at is null and not h.manual) then
   perform gestlok_chat_private.wai_agente_poll(p,'agente:continuar:'||m.id,'¿Qué te gustaría hacer ahora?',jsonb_build_object('opciones',m.continuar_carta)->'opciones');
  end if;
  return jsonb_build_object('ok',true);
 end if;
 return null;
end$function$;
revoke all on function public.gestlok_chat_wai_piloto_motor(p_id uuid, p_clave text, p_revision uuid, p_accion text, p_piloto uuid, p_jid text, p_evento text, p_texto text, p_mensaje uuid, p_estado text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_piloto_motor(p_id uuid, p_clave text, p_revision uuid, p_accion text, p_piloto uuid, p_jid text, p_evento text, p_texto text, p_mensaje uuid, p_estado text) to anon,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_portal_inicio(p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Iniciá sesión en GESTLOK' using errcode='42501'; end if;
 if p_slug is not null and p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Enlace inválido' using errcode='22023'; end if;
 return jsonb_build_object('administradora',gestlok_chat_private.es_creadora_chat(),
 'piloto_disponible',(select habilitado from gestlok_chat_private.wai_piloto_entorno where id),
 'locales',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'local_id',s.local_id,'slug',s.slug,'nombre',s.nombre,'empresa',e.nombre_publico,
  'rubro','gastronomia','nivel',gestlok_chat_private.wai_portal_nivel(s.id)) order by e.nombre_publico,s.nombre)
 from gestlok_chat_private.sucursales s join gestlok_chat_private.empresas e on e.tenant_id=s.tenant_id
 where (p_slug is null or s.slug=p_slug) and gestlok_chat_private.wai_portal_nivel(s.id) is not null),'[]'::jsonb));
end$function$;
revoke all on function public.gestlok_chat_wai_portal_inicio(p_slug text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_portal_inicio(p_slug text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_recepcion_admin(p_id uuid, p_activo boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid;
begin
 if auth.uid() is null or not gestlok_chat_private.es_creadora_chat() then raise exception 'Solo administradora' using errcode='42501';end if;
 u=gestlok_platform.require_admin();
 if p_activo is null or not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false)
 or not exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id) then raise exception 'Número de ensayo no habilitado';end if;
 if p_activo and not exists(select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.wai_servidor_central c on c.id and c.instancia=w.central_instancia
 where w.habilitacion_id=p_id and c.vence_at>now() and w.estado='conectado' and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds') then raise exception 'Primero vinculá la línea de ensayo al servidor central y verificá señal.';end if;
 insert into gestlok_chat_private.wai_recepcion_prueba(habilitacion_id,activo,actualizado_por) values(p_id,p_activo,u)
 on conflict(habilitacion_id) do update set activo=excluded.activo,desde=clock_timestamp(),actualizado_por=u where wai_recepcion_prueba.activo is distinct from excluded.activo;
 if not p_activo then update gestlok_chat_private.wai_pilotos set cancelado=true where habilitacion_id=p_id and entrada_automatica and not cancelado and vence_at>now();end if;
 return true;
end$function$;
revoke all on function public.gestlok_chat_wai_recepcion_admin(p_id uuid, p_activo boolean) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_recepcion_admin(p_id uuid, p_activo boolean) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_recibir_imagen(p_id uuid, p_clave text, p_revision uuid, p_piloto uuid, p_jid text, p_evento text, p_texto text DEFAULT NULL::text, p_mime text DEFAULT NULL::text, p_base64 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p gestlok_chat_private.wai_pilotos; entrada uuid; bytes bytea; formato text; estado_foto text:='no_disponible'; pie text;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' or not exists(
 select 1 from gestlok_chat_private.wai_sesiones w join gestlok_chat_private.whatsapp_premium_habilitaciones h on h.id=w.habilitacion_id
 where w.habilitacion_id=p_id and w.clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') and w.revision=p_revision and w.estado='conectado' and w.senal_at>=h.actualizada_at and w.senal_at>now()-interval '30 seconds' and w.wa_verificada_at>now()-interval '35 seconds' and h.habilitada) then return null;end if;
 select * into p from gestlok_chat_private.wai_pilotos x where x.id=p_piloto and x.habilitacion_id=p_id and gestlok_chat_private.wai_piloto_vigente(x) for update;
 if not found or p_jid is null or p_jid !~ '^[1-9][0-9]{7,14}@s\.whatsapp\.net$' or gestlok_chat_private.whatsapp_exclusion_key('+'||split_part(p_jid,'@',1)) is distinct from gestlok_chat_private.whatsapp_exclusion_key(p.tester)
 or p_evento is null or length(p_evento) not between 1 and 200 or length(coalesce(p_texto,''))>500 then return null;end if;
 if exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='entrada' and m.evento=p_evento) then return jsonb_build_object('ok',true);end if;
 if (select count(*) from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.direccion='entrada')>=120 then return null;end if;
 if p_base64 is not null then
  -- Fail closed on oversized or non-image payloads; keep a visible notice
  -- of the event so a manager can ask for a resend without guessing.
  if length(p_base64)<=2796204 and p_mime in ('image/jpeg','image/png','image/webp') then
   begin
    bytes=decode(p_base64,'base64');
    if octet_length(bytes) between 12 and 2097152 then
     formato=case when substring(bytes from 1 for 3)=decode('ffd8ff','hex') then 'image/jpeg'
      when substring(bytes from 1 for 8)=decode('89504e470d0a1a0a','hex') then 'image/png'
      when substring(bytes from 1 for 4)=convert_to('RIFF','UTF8') and substring(bytes from 9 for 4)=convert_to('WEBP','UTF8') then 'image/webp' end;
     if formato=p_mime then estado_foto='imagen';end if;
    end if;
   exception when invalid_parameter_value or invalid_text_representation then bytes=null;end;
  end if;
 end if;
 perform gestlok_chat_private.wai_cierre_tick(p);
 -- Pass neutral text to ciclo_entrada so that a photo or a caption cannot
 -- accidentally declare a cash payment, create a draft, or confirm an order.
 insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,evento,jid,estado,agente_procesado_at,adjunto_estado)
 values(p.id,'entrada','Imagen recibida',p_evento,p_jid,'recibido',clock_timestamp(),estado_foto) returning id into entrada;
 perform gestlok_chat_private.wai_ciclo_entrada(p,entrada);
 pie=nullif(btrim(coalesce(p_texto,'')),'');
 update gestlok_chat_private.wai_mensajes set texto=case when estado_foto='imagen' then coalesce(pie,'Imagen recibida') else concat_ws(' · ','Imagen recibida, no disponible. Pedí reenviarla.',pie) end where id=entrada;
 if estado_foto='imagen' then insert into gestlok_chat_private.wai_adjuntos_imagen(mensaje_id,mime,contenido) values(entrada,formato,bytes);end if;
 return jsonb_build_object('ok',true,'adjunto_estado',estado_foto);
end$function$;
revoke all on function public.gestlok_chat_wai_recibir_imagen(p_id uuid, p_clave text, p_revision uuid, p_piloto uuid, p_jid text, p_evento text, p_texto text, p_mime text, p_base64 text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_recibir_imagen(p_id uuid, p_clave text, p_revision uuid, p_piloto uuid, p_jid text, p_evento text, p_texto text, p_mime text, p_base64 text) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_senal(p_id uuid, p_clave text, p_revision uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_numero text DEFAULT NULL::text, p_qr text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w gestlok_chat_private.wai_sesiones%rowtype;
 h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from gestlok_chat_private.wai_sesiones where habilitacion_id=p_id
  and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') for update;
 if not found then return null; end if;
 select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
 join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
 join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 join public.docs d on d.tenant_id=x.tenant_id and d.id=x.local_id and d.col='locales'
 where x.id=p_id and x.habilitada;
 if not found then return jsonb_build_object('habilitada',false); end if;
 if w.orden='qr_forzado' then return jsonb_build_object('habilitada',true,'revision',w.revision,'orden',w.orden,'numero',h.numero); end if;
 if p_revision=w.revision and p_estado in ('conectado','reconectando','qr','desconectado') then
   if p_estado='conectado' and (p_numero is null or regexp_replace(p_numero,'^\+549([0-9]{10})$','+54\1')<>h.numero_clave) then
     p_estado:='desconectado';
   end if;
   if p_estado='qr' and (p_qr is null or length(p_qr) not between 16 and 2048) then p_estado:='desconectado'; end if;
   update gestlok_chat_private.wai_sesiones set estado=p_estado,senal_at=now(),wa_verificada_at=null,
    orden=case when p_estado='conectado' then 'reconectar' else w.orden end,
    qr=case when p_estado='qr' then p_qr end,
    qr_vence=case when p_estado='qr' then case when w.qr=p_qr then w.qr_vence else now()+interval '45 seconds' end end
   where habilitacion_id=p_id;
 end if;
 return jsonb_build_object('habilitada',true,'revision',w.revision,'orden',w.orden,'numero',h.numero);
end$function$;
revoke all on function public.gestlok_chat_wai_senal(p_id uuid, p_clave text, p_revision uuid, p_estado text, p_numero text, p_qr text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_senal(p_id uuid, p_clave text, p_revision uuid, p_estado text, p_numero text, p_qr text) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_senal_v2(p_id uuid, p_clave text, p_revision uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_numero text DEFAULT NULL::text, p_qr text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w gestlok_chat_private.wai_sesiones%rowtype;
 h gestlok_chat_private.whatsapp_premium_habilitaciones%rowtype;
begin
 if p_clave is null or p_clave !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from gestlok_chat_private.wai_sesiones where habilitacion_id=p_id
  and clave_hash=encode(sha256(convert_to(p_clave,'UTF8')),'hex') for update;
 if not found then return null; end if;
 if w.central_instancia is not null and not exists(select 1 from gestlok_chat_private.wai_servidor_central c where c.id and c.instancia=w.central_instancia and c.vence_at>clock_timestamp() and exists(select 1 from gestlok_chat_private.wai_central_lineas() a where a.id=p_id)) then return jsonb_build_object('habilitada',false);end if;
 select x.* into h from gestlok_chat_private.whatsapp_premium_habilitaciones x
 join gestlok_chat_private.empresas e on e.tenant_id=x.tenant_id and e.habilitada
 join gestlok_chat_private.sucursales s on s.tenant_id=x.tenant_id and s.local_id=x.local_id
 join public.docs d on d.tenant_id=x.tenant_id and d.id=x.local_id and d.col='locales'
 where x.id=p_id and x.habilitada;
 if not found then return jsonb_build_object('habilitada',false); end if;
 if p_revision=w.revision and p_estado in ('conectado','reconectando','qr','desconectado') then
   if p_estado='conectado' and (p_numero is null or regexp_replace(p_numero,'^\+549([0-9]{10})$','+54\1')<>h.numero_clave) then
     p_estado:='desconectado';
   end if;
   if p_estado='qr' and (p_qr is null or length(p_qr) not between 16 and 2048) then p_estado:='desconectado'; end if;
   update gestlok_chat_private.wai_sesiones set estado=p_estado,senal_at=now(),wa_verificada_at=case when p_estado='conectado' then now() end,
    orden=case when p_estado='conectado' then 'reconectar' else w.orden end,
    qr=case when p_estado='qr' then p_qr end,
    qr_vence=case when p_estado='qr' then case when w.qr=p_qr then w.qr_vence else now()+interval '45 seconds' end end
   where habilitacion_id=p_id;
 end if;
 return jsonb_build_object('habilitada',true,'revision',w.revision,'orden',w.orden,'numero',h.numero);
end$function$;
revoke all on function public.gestlok_chat_wai_senal_v2(p_id uuid, p_clave text, p_revision uuid, p_estado text, p_numero text, p_qr text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_senal_v2(p_id uuid, p_clave text, p_revision uuid, p_estado text, p_numero text, p_qr text) to anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gestlok_chat_wai_valoracion(p_token text, p_accion text DEFAULT 'ver'::text, p_detalle text DEFAULT NULL::text, p_foto text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o gestlok_chat_private.wai_pedidos%rowtype; p gestlok_chat_private.wai_pilotos%rowtype; k text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 k=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select * into o from gestlok_chat_private.wai_pedidos where token_hash=k;
 if not found then return null;end if;
 select * into p from gestlok_chat_private.wai_pilotos where id=o.piloto_id for update;
 if not found or not coalesce(gestlok_chat_private.wai_pedido_consentimiento(p),false) then return null;end if;
 select x.* into o from gestlok_chat_private.wai_pedidos x where x.id=o.id and x.token_hash=k and exists(select 1 from gestlok_chat_private.wai_mensajes m where m.piloto_id=p.id and m.evento='pedido:'||x.id||':consulta' and m.estado='aceptado') for update;
 if not found then return null;end if;
 if p_accion in ('bien','problema') then
  if o.valoracion is null then
   update gestlok_chat_private.wai_pedidos set valoracion=p_accion,valorado_at=now(),actualizado_at=now() where id=o.id returning * into o;
   insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento)
    values(p.id,'entrada',case p_accion when 'bien' then 'Encuesta del pedido: Recibí bien mi pedido.' else 'Encuesta del pedido: Tuve un problema con mi pedido.' end,'recibido','pedido:'||o.id||':valoracion') on conflict(piloto_id,direccion,evento) do nothing;
  end if;
 elsif p_accion='detalle' then
  if o.valoracion is distinct from 'problema' or o.resuelto_at is not null then return null;end if;
  if o.detalles_at is null then
   if length(coalesce(p_detalle,''))>1000 or (p_foto is not null and (length(p_foto)>400000 or p_foto !~ '^/9j/[A-Za-z0-9+/]+={0,2}$')) or (nullif(btrim(p_detalle),'') is null and p_foto is null) then raise exception 'Detalle o foto inválidos';end if;
   update gestlok_chat_private.wai_pedidos set detalle=nullif(btrim(p_detalle),''),foto=p_foto,detalles_at=now(),actualizado_at=now() where id=o.id returning * into o;
   insert into gestlok_chat_private.wai_mensajes(piloto_id,direccion,texto,estado,evento)
    values(p.id,'entrada',left('Detalle del reclamo: '||coalesce(o.detalle,'Foto adjunta')||case when o.foto is not null then ' · Foto disponible en el pedido.' else '' end,1000),'recibido','pedido:'||o.id||':detalle') on conflict(piloto_id,direccion,evento) do nothing;
  end if;
 elsif p_accion is distinct from 'ver' then return null;end if;
 return jsonb_build_object('valoracion',o.valoracion,'detalles_enviados',o.detalles_at is not null,'resuelto',o.resuelto_at is not null);
end$function$;
revoke all on function public.gestlok_chat_wai_valoracion(p_token text, p_accion text, p_detalle text, p_foto text) from public,anon,authenticated;
grant execute on function public.gestlok_chat_wai_valoracion(p_token text, p_accion text, p_detalle text, p_foto text) to anon,authenticated,service_role;
CREATE TRIGGER wai_mensaje_ciclo BEFORE INSERT ON gestlok_chat_private.wai_mensajes FOR EACH ROW EXECUTE FUNCTION gestlok_chat_private.wai_asignar_ciclo();
CREATE TRIGGER wai_voto_inmutable BEFORE UPDATE OF opcion_elegida ON gestlok_chat_private.wai_mensajes FOR EACH ROW EXECUTE FUNCTION gestlok_chat_private.wai_voto_inmutable();

