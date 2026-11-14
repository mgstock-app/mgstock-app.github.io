-- MV fue RENOMBRADA a SGR; es la misma empanada (27 unidades/chapa).
-- Conservar el ID original de MV para respetar cualquier conteo registrado.
update gestlok_munro_conteo_private.products
set name='SGR', units_per_chapa=27
where id='c1-22' and section='EMPANADAS' and name in ('MV','SGR');
-- Desactivar únicamente la fila SGR que se creó duplicada en el catálogo inicial.
update gestlok_munro_conteo_private.products
set active=false
where id='c1-24' and section='EMPANADAS' and name='SGR';
