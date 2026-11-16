-- Reseñas general: permisos, aislamiento entre empresas y reglas. Corre sobre la base de prueba
-- (tests/fixtures/resenas-general/base.sql + la migración). Cada ASSERT que falle corta la prueba.
do $$
declare v jsonb; a uuid:='aaaaaaaa-0000-4000-8000-000000000001'; b uuid:='bbbbbbbb-0000-4000-8000-000000000001'; id1 uuid; id2 uuid; code text;
begin
  -- Habilitar: A y B sí; Mi Gusto no se puede ni por error.
  insert into gestlok_resenas_gen_private.empresas(tenant_id) values (a),(b);
  assert prueba.error_de($q$insert into gestlok_resenas_gen_private.empresas(tenant_id) values ('cb0dc04a-9a13-434f-a3d0-47f1d8f39670')$q$) like '23514%', 'Mi Gusto no se habilita';

  -- Sin sesión, empresa sin habilitar, Mi Gusto y rol de solo lectura: nada.
  perform prueba.como(null);
  assert prueba.error_de($q$select public.gestlok_resenas_gen_scope()$q$) like '42501%', 'anon no ejecuta';
  perform prueba.como('duena.c@example.com');
  assert (public.gestlok_resenas_gen_scope()->>'enabled')::boolean = false, 'Empresa sin habilitar';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_list('unico')$q$) like '42501%', 'Sin habilitar no lista';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_create('unico','Ana Pérez','1144445555')$q$) like '42501%', 'Sin habilitar no emite';
  perform prueba.como('duena.mg@example.com');
  assert (public.gestlok_resenas_gen_scope()->>'enabled')::boolean = false, 'Mi Gusto queda afuera';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_create('munro','Ana Pérez','1144445555')$q$) like '42501%', 'Mi Gusto no emite acá';
  perform prueba.como('lectura.a@example.com');
  assert (public.gestlok_resenas_gen_scope()->>'enabled')::boolean = false, 'Solo lectura no entra';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_list('centro')$q$) like '42501%', 'Solo lectura no lista';

  -- Dueña A: ve sus dos locales, cambia ajustes y emite.
  perform prueba.como('duena.a@example.com');
  v := public.gestlok_resenas_gen_scope();
  assert (v->>'enabled')::boolean and jsonb_array_length(v->'locals') = 2 and (v->>'can_config')::boolean and v->'locals'->0->>'nombre' = 'Centro', 'Alcance de la dueña';
  v := public.gestlok_resenas_gen_list('centro');
  assert (v->'settings'->>'discount')::int = 10 and (v->'settings'->>'valid_days')::int = 30 and jsonb_array_length(v->'coupons') = 0, 'Ajustes por defecto';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_settings_save('centro',0,30,'')$q$) like '22023%', 'Descuento mínimo';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_settings_save('centro',10,400,'')$q$) like '22023%', 'Días máximos';
  v := public.gestlok_resenas_gen_settings_save('centro',15,7,'  Hola {nombre}: {descuento}% con {codigo}  ');
  assert (v->>'discount')::int = 15 and (v->>'valid_days')::int = 7 and v->>'message' = 'Hola {nombre}: {descuento}% con {codigo}', 'Ajustes guardados';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_create('centro','A','1144445555')$q$) like '22023%', 'Nombre corto';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_create('centro','Ana Pérez','4444')$q$) like '22023%', 'Teléfono inválido';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_create('otro','Ana Pérez','1144445555')$q$) like '42501%', 'Local inexistente';
  v := public.gestlok_resenas_gen_create('centro',' Ana Pérez ','+54 9 11 4444-5555');
  id1 := (v->>'id')::uuid; code := v->>'code';
  assert v->>'customer_name' = 'Ana Pérez' and v->>'phone' = '1144445555' and code ~ '^[A-HJ-NP-Z2-9]{6}$' and (v->>'discount')::int = 15
    and v->>'status' = 'pending' and (v->>'valid_until')::date = (now() at time zone 'America/Argentina/Buenos_Aires')::date + 7, 'Cupón emitido con los ajustes del local';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_create('centro','Ana P','011 4444-5555')$q$) like '23505%', 'Un pendiente por teléfono y local';
  v := public.gestlok_resenas_gen_create('norte','Ana Pérez','1144445555');
  assert (v->>'discount')::int = 10 and v->>'local' = 'norte', 'Otro local: sus propios ajustes y cupones';
  id2 := (v->>'id')::uuid;

  -- Gerente A: solo Centro; registra y marca usado; no cambia ajustes.
  perform prueba.como('gerente.a@example.com');
  v := public.gestlok_resenas_gen_scope();
  assert jsonb_array_length(v->'locals') = 1 and v->'locals'->0->>'id' = 'centro' and not (v->>'can_config')::boolean, 'Alcance del gerente';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_list('norte')$q$) like '42501%', 'Gerente no ve otro local';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_settings_save('centro',50,30,'')$q$) like '42501%', 'Gerente no cambia ajustes';
  assert prueba.error_de(format('select public.gestlok_resenas_gen_redeem(%L,%L)','centro',id2)) like '22023%', 'Cupón de otro local no se usa';
  v := public.gestlok_resenas_gen_update('centro',id1,'Ana María Pérez','1144446666');
  assert v->>'customer_name' = 'Ana María Pérez' and v->>'phone' = '1144446666' and v->>'code' = code, 'Corrección sin cambiar el código';
  v := public.gestlok_resenas_gen_redeem('centro',id1);
  assert v->>'status' = 'used', 'Usado';
  assert prueba.error_de(format('select public.gestlok_resenas_gen_redeem(%L,%L)','centro',id1)) like '22023%', 'No se usa dos veces';
  assert prueba.error_de(format('select public.gestlok_resenas_gen_update(%L,%L,%L,%L)','centro',id1,'Otra','1144447777')) like '22023%', 'Usado no se corrige';
  v := public.gestlok_resenas_gen_create('centro','Ana María Pérez','1144446666');
  assert v->>'status' = 'pending', 'Después de usarlo puede recibir otro';
  id1 := (v->>'id')::uuid;

  -- Empresa B: no ve ni toca nada de A aunque el local se llame igual.
  perform prueba.como('duena.b@example.com');
  assert jsonb_array_length(public.gestlok_resenas_gen_list('centro')->'coupons') = 0, 'B no ve cupones de A';
  assert prueba.error_de(format('select public.gestlok_resenas_gen_redeem(%L,%L)','centro',id1)) like '22023%', 'B no usa cupones de A';
  assert prueba.error_de(format('select public.gestlok_resenas_gen_update(%L,%L,%L,%L)','centro',id1,'Intrusa','1144448888')) like '22023%', 'B no corrige cupones de A';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_list('norte')$q$) like '42501%', 'B no tiene el local Norte';
  v := public.gestlok_resenas_gen_create('centro','Ana María Pérez','1144446666');
  assert (v->>'discount')::int = 10, 'B emite con sus propios ajustes';

  -- Vencimiento y apagado de la empresa.
  perform set_config('role', 'postgres', true);
  update gestlok_resenas_gen_private.coupons set valid_until = gestlok_resenas_gen_private.today_ar() - 1 where id = id1;
  perform prueba.como('duena.a@example.com');
  assert (select x->>'status' from jsonb_array_elements(public.gestlok_resenas_gen_list('centro')->'coupons') x where x->>'id' = id1::text) = 'expired', 'Vencido';
  assert prueba.error_de(format('select public.gestlok_resenas_gen_redeem(%L,%L)','centro',id1)) like '22023%', 'Vencido no se usa';
  assert (public.gestlok_resenas_gen_create('centro','Ana María Pérez','1144446666')->>'status') = 'pending', 'Vencido no bloquea uno nuevo';
  perform set_config('role', 'postgres', true);
  update gestlok_resenas_gen_private.empresas set enabled = false where tenant_id = a;
  perform prueba.como('duena.a@example.com');
  assert (public.gestlok_resenas_gen_scope()->>'enabled')::boolean = false, 'Empresa apagada';
  assert prueba.error_de($q$select public.gestlok_resenas_gen_list('centro')$q$) like '42501%', 'Apagada no lista';

  -- Permisos y auditoría.
  perform set_config('role', 'postgres', true);
  assert not has_table_privilege('authenticated','gestlok_resenas_gen_private.coupons','select'), 'Tabla sin acceso directo';
  assert not has_schema_privilege('authenticated','gestlok_resenas_gen_private','usage'), 'Esquema privado';
  assert not has_function_privilege('anon','public.gestlok_resenas_gen_create(text,text,text)','execute'), 'anon no emite';
  assert (select count(*) from gestlok_resenas_gen_private.events where action = 'used') = 1
     and (select count(*) from gestlok_resenas_gen_private.events where action = 'edited') = 1
     and (select count(*) from gestlok_resenas_gen_private.events where action = 'created') = 5, 'Todo queda registrado';
end $$;
select 'RESENAS GENERAL: OK' as resultado;
