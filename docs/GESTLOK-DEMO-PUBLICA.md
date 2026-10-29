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

## Estadísticas de uso (etapa 1, octubre de 2026)
La persona que visita la demo puede aceptar o rechazar estadísticas opcionales. Si acepta, el único contacto real con Supabase durante su recorrido es una llamada a `gestlok_demo_registrar`, que guarda UUID aleatorio por sesión, roles y tiendas ficticias visitadas. No registra nombres, emails, IP, datos comerciales ni productos. La Creadora consulta `gestlok_demo_resumen`, que retorna solo agregados: sesiones, roles, ambos roles, tiendas y primeros ingresos en los últimos 7 días. El contador es de sesiones voluntariamente registradas, no personas únicas. Rechazar no impide explorar.
No se habilita aún ninguna captura de datos de contacto; se definirá en una siguiente etapa.

## Rediseño interactivo de 9 etapas (octubre 2026)
- En la web, desktop: columna izquierda explica las capacidades de cada etapa; columna derecha muestra las **pantallas interactivas de GESTLOK dentro de un marco de teléfono**, no imágenes ni capturas estáticas.
- En celular: contenido apilado a ancho útil; navegación manual mediante botones del carrusel y deslizamiento horizontal. No hay autoplay.
- Etapas: Inicio, Empresa/stock operativo, Proveedores, Colaboradores/legajos, Precios, Stock por producto, Pedidos, Vencimientos y Final.
- Las primeras cuatro etapas y Vencimientos reutilizan la aplicación de la demo con su backend ficticio original; Empleados conserva Horarios y las restricciones de Gerente.
- Las etapas nuevas Precios, Stock y Pedidos son módulos de **práctica funcional**, con artículos y operaciones ficticias guardados exclusivamente en sessionStorage de la pestaña. Cálculo de recargo sobre costo, cantidades ±, pedidos con estados.
- El último paso conserva reseñas, consentimiento, contacto opcional y emisión del cupón exclusivamente tras confirmación del servidor. No cambiar la política de premios vigente ni realizar entregas simuladas.
- Nunca se consultan empresas ni catálogos privados para esas etapas; las únicas operaciones opcionales externas continúan siendo el conteo de visita autorizado y el envío explícito de una reseña.
- La demo representa tanto negocios nuevos como módulos disponibles, pero **no concede funciones exclusivas de Cami a usuarios reales ajenos**. Es material de demostración.
