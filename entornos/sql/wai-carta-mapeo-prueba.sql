-- Apply only in the Prueba/Testing database after importing each local's public catalog.
-- The photo's contents determine the eligible products; the order engine is generic.
update gestlok_chat_private.wai_carta_paginas w
set categorias=case w.clave
 when 'empanadas_promos' then array['Promociones de empanadas']
 when 'almuerzos' then array['Promociones de empanadas']
 when 'empanadas_sabores' then array['Empanadas clásicas','Empanadas premium']
 when 'pizzas_family' then array['Pizzas de 8 porciones']
 when 'pizzas_indi' then array['Pizzas individuales','Promociones para compartir'] else w.categorias end,
productos_nombres=case w.clave
 when 'empanadas_promos' then array['Pack 6 empanadas + 2 salsas','Pack 8 empanadas + 2 salsas','Pack 12 empanadas + 3 salsas','Pack 18 empanadas + 5 salsas']
 when 'almuerzos' then array['Pack 2 empanadas + 1 salsa','Pack 2 empanadas + lata 354 ml + 1 salsa','Pack 3 empanadas + 1 salsa','Pack 3 empanadas + lata 354 ml + 1 salsa'] else '{}'::text[] end,
detalle_clave=case when w.clave in ('empanadas_promos','almuerzos','pizzas_indi') then 'empanadas_sabores' else null end,
detalle_grupo=case when w.clave in ('empanadas_promos','almuerzos','pizzas_indi') then 'empanadas' else null end
from gestlok_chat_private.sucursales s where s.id=w.sucursal_id and s.slug in ('mi-gusto-munro','mi-gusto-torcuato');
