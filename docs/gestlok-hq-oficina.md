# GESTLOK HQ · La Oficina (versión 3)

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
| lider | Alex | Búho | Directora de la oficina |
| atencion | Renata | Gata con auriculares | Mesa de pedidos · GESTLOK Chat |
| marketing | Martina | Zorra | Promos y ventas |
| calidad | Camila | Coneja | Calidad de la carta |
| datos | Santiago | Pulpo | Métricas de los locales |
| soporte | Facundo | Robot | Guardia técnica de los locales |
| desarrollo | Nicolás | Castor | Producto GESTLOK Chat |
| testing | Tomás | Rana | Pruebas del chat |

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
