-- GESTLOK · base de pruebas: empresa y locales ficticios para probar GESTLOK Chat.
-- Mismos «slug» que en gestlok.com.ar para que los enlaces se vean iguales; la base es otra.
-- La carta y la configuración de cada local se copian de la base real con la acción «copiar carta»
-- (solo productos, precios y textos del local; nunca clientes, pedidos ni conversaciones).
-- Las personas que usan el entorno se agregan aparte (no se publican emails en el repositorio).
insert into gestlok_tenancy.tenants (id, code) values ('7e570000-0000-4000-8000-00000000000a', 'MIGUSTO-PRUEBA')
on conflict (id) do nothing;
insert into public.docs (tenant_id, col, id, data) values
  ('7e570000-0000-4000-8000-00000000000a', 'locales', 'munro', '{"nombre":"Munro"}'),
  ('7e570000-0000-4000-8000-00000000000a', 'locales', 'torcuato', '{"nombre":"Don Torcuato"}')
on conflict do nothing;
insert into gestlok_chat_private.empresas (tenant_id, nombre_publico, habilitada)
values ('7e570000-0000-4000-8000-00000000000a', 'Mi Gusto (prueba)', true)
on conflict (tenant_id) do nothing;
insert into gestlok_chat_private.sucursales (id, tenant_id, local_id, slug, nombre, activa, prefijo, acepta_retiro, acepta_envio,
  envio_costo, horario, medios_pago)
values
  ('7e570000-0000-4000-8000-000000000001', '7e570000-0000-4000-8000-00000000000a', 'munro', 'mi-gusto-munro', 'Munro', true, 'PM',
   true, true, 0, 'Horario de prueba', array['efectivo','transferencia']),
  ('7e570000-0000-4000-8000-000000000002', '7e570000-0000-4000-8000-00000000000a', 'torcuato', 'mi-gusto-torcuato', 'Don Torcuato', true, 'PT',
   true, true, 0, 'Horario de prueba', array['efectivo','transferencia'])
on conflict (id) do nothing;
