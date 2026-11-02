-- Perfumes · Belisa Parfum (pedido de la usuaria del 02/11/2026): se retira la «Caja diaria» (#200) y se habilita
-- GESTLOK Caja (la app completa: caja inicial, cobros por medio, gastos, ingresos, retiros, arqueo y cierre).
-- No borra nada: la caja diaria queda apagada (sin datos: 0 días y 0 movimientos al 02/11) y se puede volver a encender.
-- Mi Gusto y el resto de las empresas no cambian.

update gestlok_caja_private.empresas set habilitada = false
 where tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';

insert into gestlok_caja_private.caja_app_empresas (tenant_id, nota)
values ('2a97bf8d-7d08-4aa7-b051-5d1a4dc80103', 'Perfumes · Belisa Parfum · reemplaza la Caja diaria (#200)')
on conflict (tenant_id) do update set habilitada = true;

-- Para volver atrás (solo con autorización de la usuaria):
-- update gestlok_caja_private.caja_app_empresas set habilitada = false where tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
-- update gestlok_caja_private.empresas set habilitada = true where tenant_id = '2a97bf8d-7d08-4aa7-b051-5d1a4dc80103';
