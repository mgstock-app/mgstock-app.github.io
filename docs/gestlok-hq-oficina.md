# GESTLOK HQ · La Oficina (versión 4)

Oficina pixel art animada para el panel de la creadora (pestaña **GESTLOK HQ**), inspirada en el formato de
Pixel Agents, OpenClawfice y Pixel Office: un plano visto desde arriba con salas, escritorios, sala de reuniones,
café, pizarra de ideas y tablero de proyectos, donde cada empleado de IA es un personaje animado.

## Qué es animación y qué es real

| Parte | Origen |
| --- | --- |
| Caminar, sentarse, tipear, café, sillón, ping-pong, reuniones de rutina | Animación (no consume IA ni toca la base) |
| Lo que dicen los empleados en los globos y en «Qué pasa ahora» | Datos reales del pulso (`gestlok_hq_pulso`), controles de Facundo, tareas e informes de HQ |
| Ícono «trabajando», «informe listo», «error», «tarea sin iniciar» | Solo tareas y ejecuciones reales registradas |
| Reunión de IA | Solo cuando hay una ejecución real de Alex en curso |
| Nivel y XP | Tareas reales cerradas (25 XP) e informes (15 XP) |
| Energía | Animación |

La IA (Groq gratuito) solo trabaja cuando la creadora inicia una tarea. Ninguna idea se guarda sola: «Convertir en
tarea» precarga el formulario y la creadora decide si la guarda.

## Equipo y puestos (mismos identificadores de la base)

| id | Nombre | Avatar | Puesto |
| --- | --- | --- | --- |
| lider | Alex | Humano | Directora de la oficina |
| atencion | Renata | Humano | Mesa de pedidos · GESTLOK Chat |
| marketing | Martina | Humano | Promos y ventas |
| calidad | Camila | Humano | Calidad de la carta |
| datos | Santiago | Humano | Métricas de los locales |
| soporte | Facundo | Humano | Guardia técnica de los locales |
| desarrollo | Nicolás | Humano | Producto GESTLOK Chat |
| testing | Tomás | Humano | Pruebas del chat |

## Secciones

- **Oficina**: el plano animado, «Qué pasa ahora», Pausar, Ampliar (útil en el celular) y «Llamar a reunión».
- **Reportes**: tarjeta por local activo (sin abrir, pedidos, charlas, conversión, ticket, confirmación, reclamos, agotados) e informe de cada sector.
- **Ideas**: pizarra con ideas de datos reales, de informes de IA y propuestas del equipo; se pueden convertir en tarea o descartar (la preferencia se guarda en el dispositivo).
- **Proyectos**: tablero con las tareas reales (por iniciar, en curso, para revisar, cerrados).
- **Equipo**: fichas con avatar, puesto, estado real, nivel y acceso a asignar tarea u oficina privada.

Debajo sigue el **Centro de control** de siempre: bandeja ejecutiva de Alex, Facundo, formulario de tareas,
motor de IA, incorporaciones, GitHub y bandeja de tareas.

## Trabajo real del equipo

- **Jornada diaria automática** (se pausa desde HQ → Centro de control → Motor de agentes): todos los días desde las
  08:00 (hora de Buenos Aires) el servidor crea la misión del día: Facundo, Renata, Santiago, Camila, Martina, Nicolás y
  Tomás analizan GESTLOK Chat y los locales con el pulso del día, y Alex arma el informe con tres prioridades para tu
  aprobación. Una misión autónoma por vez; el worker corre cada 10 minutos y hace una consulta por ronda.
- **Límites diarios del plan gratuito** (pedido de la administradora): 30 consultas de IA cada 24 h para todo el equipo,
  4 por empleado (Alex 8) y hasta 150.000 tokens contados con el uso real de Groq (el plan gratis de
  `openai/gpt-oss-20b` permite 1.000 solicitudes y 200.000 tokens por día, 30 solicitudes y 8.000 tokens por minuto).
  El servidor los aplica en cada reserva; HQ muestra el uso de cada empleado. Si un empleado llega a su límite, sigue
  con datos reales y retoma al liberarse.
- **Si Groq pide esperar** (429, clave o caída), se libera la reserva y la tarea queda pendiente: no se gasta cupo.
- Entre sectores, «Continuar equipo» hace una pausa de 45 s para no superar los 8.000 tokens por minuto.
- Los informes usan solo los números del pulso; si un dato no está, lo dicen.

## Archivos

- `public/stock/gestlok-hq-office.mjs`: motor pixel art, simulación, comentarios con datos y paneles. Sin dependencias, sin red, sin base.
- `public/stock/gestlok-creator-home.js`: `hqView` monta la oficina, lee el pulso cada minuto y conecta los botones.
- `supabase/migrations/20261125150000_gestlok_hq_pulso.sql`: función `gestlok_hq_pulso()` de solo lectura, exclusiva de la creadora, con indicadores agregados (sin nombres, teléfonos, direcciones ni mensajes de clientes).
- `supabase/migrations/20261125160000_gestlok_hq_trabajo_diario.sql`: jornada diaria, liberar reserva, pulso para el worker, ronda cada 10 min.
- `supabase/migrations/20261125170000_gestlok_hq_limites_plan_gratis.sql`: límites diarios por equipo, empleado y tokens.
- `supabase/functions/gestlok-hq-agent/index.ts` y `gestlok-hq-worker/index.ts`: los informes de IA reciben el pulso agregado como evidencia, los puestos nuevos y liberan la reserva si Groq rechaza.
- Se retiró la oficina 3D (`gestlok-hq-3d.mjs`). La copia de `three` en `public/vendor/hq-three` quedó sin uso y se puede retirar después.

## Estado (25/11/2026)

Migraciones `gestlok_hq_pulso`, `gestlok_hq_trabajo_diario` y `gestlok_hq_limites_plan_gratis` aplicadas en producción;
`gestlok-hq-agent` v7 y `gestlok-hq-worker` v2 desplegadas.

## Marketing de GESTLOK Chat y Soporte general (25/11/2026)

- **Valentina · Humano · Marketing de GESTLOK Chat** (`difusion`): investiga cómo publicitar la micro app y dónde publicarla. Trabaja con el **mapa de difusión** (`gestlok_hq_private.difusion_canales`): sitios verificados el 25/11, todos gratuitos (Search Console, Instagram, Facebook, TikTok, YouTube, LinkedIn, Capterra, G2, AlternativeTo, iProUP, SaaSHub, SaaSworthy, Product Hunt, BetaList y el Perfil de Empresa de Google, este último solo si hay atención presencial). Deja el texto listo; publicar lo hace la administradora y lo marca en Reportes → «Difusión de GESTLOK Chat» (`gestlok_hq_difusion_estado`). Nunca compra publicidad ni usa la marca de un cliente sin permiso.
- **Lucas · Humano · Soporte general** (`soporte_general`): altas de comercios, gerentes pendientes, mensajes del formulario web, suscripciones en mora y locales sin carta. Lee solo cantidades (`pulso_plataforma`), sin datos personales; redacta respuestas, no las envía.
- Las misiones y la jornada diaria pasan a nueve sectores (las de siete siguen siendo válidas). Cada uno respeta el límite de 4 consultas diarias del plan gratuito.
- Migración: `20261125190000_gestlok_hq_marketing_soporte_general.sql`.


## Conversaciones de HQ (27/11/2026)

- Avatares humanos diferenciados, oficina a ancho completo, desplazamiento lateral en celular y ampliación.
- Abrir **Hablar en privado** desde una persona, o **Llamar a reunión** y elegir quién toma la palabra. Un turno usa una consulta de IA (también Alex); no se confunde con las misiones de equipo ni con la animación.
- Las consultas y sus respuestas se guardan en el registro privado de tareas/ejecuciones. Si no hay disponibilidad se guarda la pregunta, sin simular respuesta. El contexto de una conversación no se comparte con otras salas. Se muestran los últimos 40 turnos dentro del registro de 200 tareas.
- Todos reciben una base común de GESTLOK, sus módulos y roles, Chat/WAI, las decisiones comerciales acordadas, las reglas de Prueba/Testing y seguridad. Las conversaciones reciben además el pulso disponible, informes operativos cerrados y hasta cuatro turnos de esa sala. No se importan conversaciones de ChatGPT ni se comparten secretos.
- La reserva de cupo es exclusiva del servidor y usa los límites gratuitos existentes. En un ambiente sin las migraciones de límites, no ejecuta consultas. Se mantiene toda autorización de administración y toda lectura agregada; no se habilitan acciones de escritura.
