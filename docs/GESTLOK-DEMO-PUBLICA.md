# Demo pública de GestLok — contrato de mantenimiento

## Acceso y privacidad
- Entrada desde el inicio de sesión: **Explorar demo interactiva · Sin registrarme**.
- Ruta `/?demo=1` con selectores de **Dueña/Gerente** y **Mercado Central (física) / Nova Indumentaria (mixta)**.
- Los visitantes que tienen una sesión real activa vuelven a la app privada; no se mezclan sesiones.
- El adaptador `public/stock/gestlok-visitor-demo.js` únicamente comprueba `supabase.auth.getSession()`; no consulta tablas ni envía información al servidor.
- Productos, carpetas, vencimientos, chat, proveedores, pedidos y variantes son inventados. Mercado Central tiene 150 y Nova Indumentaria 500 productos ficticios iniciales.
- El visitante puede guardar, editar y practicar acciones dentro del **sessionStorage de su pestaña**. No existe usuario, empresa o base de datos demo en Supabase. Al cerrar esa pestaña o reiniciar se elimina la sesión de práctica.
- Quedan bloqueados: WhatsApp real, enviar pedidos externamente, notificaciones push nativas, soporte externo, instalación desde demo, copia de seguridad de empresa y funciones backend no simuladas.

## Misma app = mismas actualizaciones visuales y funcionales
- `components/stock-runtime.tsx` carga los mismos scripts de interfaz para demo y producción, excepto autenticación privada, notificaciones reales y soporte externo.
- **Cualquier módulo nuevo deberá funcionar con el adaptador ficticio** o mostrar estado "no disponible en demo" sin conexión a datos externos.
- Regla para cada PR futuro: ampliar los datos ficticios, simular nuevos RPC en `gestlok-visitor-demo.js` cuando sea necesario y agregar una prueba Cypress para los dos roles y modalidades. No hacer copias estáticas de pantallas reales.
- GestLok sigue siendo gestión interna; la demo no tiene ventas a público, checkout ni pagos.

## Tests que bloquean publicación
1. Sin sesión: demo visible, 2 roles y 2 negocios ficticios.
2. Con sesión real: no puede permanecer en modo demo.
3. No hay consultas ni escrituras a tablas reales de Supabase.
4. Ediciones de productos/pedidos afectan solo `sessionStorage` y pueden reiniciarse.
5. El comportamiento real de las pantallas se prueba en Cypress/Android/iPhone.
6. Ante cambios a la interfaz, **actualizar la demo en el mismo PR**.

## Alcances y pendientes
Esta primera versión reutiliza las pantallas principales y módulos actuales, y simula sus entidades estándar. Algunas operaciones especializadas que dependan de RPCs no simuladas (por ejemplo, importar mercadería del servidor) mostrarán que no están habilitadas. La cobertura funcional se ampliará por módulo, siempre sin crear datos reales.
