-- Índices para empresas preparadas y catálogos con miles de productos.
create index if not exists gestlok_platform_companies_creator_idx
 on gestlok_platform.companies(created_by);
create index if not exists gestlok_productos_tienda_tenant_shop_idx
 on public.gestlok_productos_tienda(tienda_id,tenant_id);
create index if not exists gestlok_products_tenant_sku_idx
 on public.gestlok_productos_tienda(tenant_id,tienda_id,sku);
