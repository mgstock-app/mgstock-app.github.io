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

## Archivos

- `public/stock/gestlok-hq-office.mjs`: motor pixel art, simulación, comentarios con datos y paneles. Sin dependencias, sin red, sin base.
- `public/stock/gestlok-creator-home.js`: `hqView` monta la oficina, lee el pulso cada minuto y conecta los botones.
- `supabase/migrations/20261125150000_gestlok_hq_pulso.sql`: función `gestlok_hq_pulso()` de solo lectura, exclusiva de la creadora, con indicadores agregados (sin nombres, teléfonos, direcciones ni mensajes de clientes).
- `supabase/functions/gestlok-hq-agent/index.ts`: los informes de IA reciben el pulso agregado como evidencia y los puestos nuevos.
- Se retiró la oficina 3D (`gestlok-hq-3d.mjs`). La copia de `three` en `public/vendor/hq-three` quedó sin uso y se puede retirar después.

## Activación

1. Aplicar la migración `gestlok_hq_pulso` en Supabase (sin el pulso, la oficina funciona igual y avisa «Pulso sin conectar»).
2. Publicar el sitio (Prueba → Testing → gestlok.com.ar).
3. Desplegar `gestlok-hq-agent` y `gestlok-hq-worker` para que los informes de IA usen los puestos nuevos y el pulso.
