-- SOLO PARA gestlok-pruebas: menú ficticio aislado, precios inventados.
-- Nunca copiar al proyecto de producción ni a los locales reales.
-- Repetible: una futura importación autorizada de carta real puede reemplazar estos datos.
do $prueba$
begin
  if to_regclass('entorno_control.sql_aplicado') is null
     or not exists (select 1 from gestlok_tenancy.tenants where code='MIGUSTO-PRUEBA') then
    raise exception 'Catálogo ficticio: ejecutar exclusivamente en gestlok-pruebas';
  end if;
end $prueba$;
insert into gestlok_chat_private.categorias (tenant_id,sucursal_id,nombre,orden)
select s.tenant_id,s.id,c.nombre,c.orden
from gestlok_chat_private.sucursales s
cross join (values ('Promociones',1),('Empanadas',2),('Bebidas',3)) as c(nombre,orden)
where s.slug in ('mi-gusto-munro','mi-gusto-torcuato')
  and s.tenant_id='7e570000-0000-4000-8000-00000000000a'
on conflict (sucursal_id,nombre) do nothing;
insert into gestlok_chat_private.productos (tenant_id,sucursal_id,categoria_id,nombre,descripcion,precio,orden,opciones)
select s.tenant_id,s.id,c.id,p.nombre,p.descripcion,p.precio::numeric,p.orden::integer,p.opciones::jsonb
from gestlok_chat_private.sucursales s
cross join (values ('Promociones','Pack DEMO · 6 empanadas + 2 salsas','Solo demostración. Precio ficticio.',12500,'1','[{"id":"empanadas","nombre":"Empanadas","tipo":"cantidad","total":6,"obligatorio":true,"valores":[{"id":"carne","nombre":"Carne","extra":0},{"id":"jamon","nombre":"Jamón y queso","extra":0},{"id":"verdura","nombre":"Verdura","extra":0}]},{"id":"salsas","nombre":"Salsas","tipo":"cantidad","total":2,"obligatorio":true,"valores":[{"id":"suave","nombre":"Salsa suave","extra":0},{"id":"picante","nombre":"Salsa picante","extra":0}]}]'),
('Empanadas','Empanada de carne (DEMO)','Producto ficticio',2200,'2','[]'),
('Empanadas','Empanada de jamón y queso (DEMO)','Producto ficticio',2200,'3','[]'),
('Empanadas','Empanada de verdura (DEMO)','Producto ficticio',2200,'4','[]'),
('Bebidas','Gaseosa de prueba 500 ml','Producto ficticio',3500,'5','[]')) p(categoria,nombre,descripcion,precio,orden,opciones)
join gestlok_chat_private.categorias c on c.sucursal_id=s.id and c.nombre=p.categoria
where s.slug in ('mi-gusto-munro','mi-gusto-torcuato')
  and s.tenant_id='7e570000-0000-4000-8000-00000000000a'
on conflict (sucursal_id,nombre) do nothing;
