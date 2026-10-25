-- Creadora en solo lectura por defecto. Datos ficticios; todo se revierte.
begin;
insert into gestlok_tenancy.tenants(id,code) values
 ('00000000-0000-4000-8000-0000000000c1','creator-ro-fixture-a'),('00000000-0000-4000-8000-0000000000c2','creator-ro-fixture-b');
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000c3','creator@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000c4','owner@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000000c5','manager@example.invalid',now());
insert into gestlok_platform.admins(user_id) values('00000000-0000-4000-8000-0000000000c3');
insert into public.docs(col,id,data,tenant_id) values
 ('locales','ro-munro','{"nombre":"Munro ficticio"}','00000000-0000-4000-8000-0000000000c1'),
 ('equipo','creator@example.invalid','{"email":"creator@example.invalid","rol":"creadora"}','00000000-0000-4000-8000-0000000000c1'),
 ('equipo','owner@example.invalid','{"email":"owner@example.invalid","rol":"dueno"}','00000000-0000-4000-8000-0000000000c1'),
 ('equipo','manager@example.invalid','{"email":"manager@example.invalid","rol":"gerente","locales":["ro-munro"]}','00000000-0000-4000-8000-0000000000c1'),
 ('ro-munro/productos','p-1','{"nombre":"Producto ficticio","stock":3}','00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
-- 1. Creadora: lectura sí, escritura operativa no (ni directa ni por función privilegiada).
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000c3","email":"creator@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; n int; begin
 select count(*) into n from public.docs where col='ro-munro/productos';
 if n<>1 then raise exception 'Creator cannot read';end if;
 x:=public.gestlok_creator_editing_state(); if (x->>'active')::boolean then raise exception 'Editing active by default';end if;
 begin update public.docs set data=data||'{"stock":9}' where col='ro-munro/productos' and id='p-1';raise exception 'Creator edited while read-only';exception when insufficient_privilege then null;end;
 begin insert into public.docs(col,id,data) values('ro-munro/productos','p-2','{"nombre":"Nuevo"}');raise exception 'Creator inserted while read-only';exception when insufficient_privilege then null;end;
 begin delete from public.docs where col='ro-munro/productos' and id='p-1';raise exception 'Creator deleted while read-only';exception when insufficient_privilege then null;end;
 -- Gestión del equipo sigue disponible y queda auditada.
 insert into public.docs(col,id,data) values('equipo','nuevo@example.invalid','{"email":"nuevo@example.invalid","rol":"gerente","locales":["ro-munro"]}');
 if not exists(select 1 from jsonb_array_elements(public.gestlok_creator_audit()) a where a->>'action'='team_changed' and a->'detail'->>'id'='nuevo@example.invalid') then raise exception 'Team change not audited';end if;
 begin perform public.gestlok_creator_enable_editing(500,'motivo');raise exception 'Too long grant accepted';exception when invalid_parameter_value then null;end;
 begin perform public.gestlok_creator_enable_editing(30,'');raise exception 'Grant without reason accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
do $$ begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000c3","email":"creator@example.invalid","role":"authenticated"}',true);
 begin update public.docs set data=data||'{"stock":7}' where col='ro-munro/productos';raise exception 'Privileged path bypassed read-only';exception when insufficient_privilege then null;end;
 insert into public.docs(col,id,data,tenant_id) values('otro-local/productos','p-x','{"nombre":"Alta de otra empresa"}','00000000-0000-4000-8000-0000000000c2');
end $$;
-- 2. Con edición habilitada (tiempo y motivo), puede modificar; al cerrarla vuelve a solo lectura.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000c3","email":"creator@example.invalid","role":"authenticated"}';
do $$ declare x jsonb; begin
 x:=public.gestlok_creator_enable_editing(15,'Corrección pedida por la dueña');
 if not (x->>'active')::boolean then raise exception 'Enable failed';end if;
 update public.docs set data=data||'{"stock":4}' where col='ro-munro/productos' and id='p-1';
 if (select data->>'stock' from public.docs where col='ro-munro/productos' and id='p-1')<>'4' then raise exception 'Edit not applied';end if;
 perform public.gestlok_creator_disable_editing();
 begin update public.docs set data=data||'{"stock":5}' where col='ro-munro/productos' and id='p-1';raise exception 'Still editable after disable';exception when insufficient_privilege then null;end;
 if (select count(*) from jsonb_array_elements(public.gestlok_creator_audit()) a where a->>'action' in ('editing_enabled','editing_disabled'))<>2 then raise exception 'Editing changes not audited';end if;
end $$;
-- 3. Dueño y gerente no cambian: siguen editando según sus permisos y no pueden habilitar nada.
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000c4","email":"owner@example.invalid","role":"authenticated"}';
do $$ begin
 update public.docs set data=data||'{"stock":6}' where col='ro-munro/productos' and id='p-1';
 if (select data->>'stock' from public.docs where col='ro-munro/productos' and id='p-1')<>'6' then raise exception 'Owner write blocked';end if;
 begin perform public.gestlok_creator_enable_editing(30,'intento');raise exception 'Owner enabled creator editing';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-0000000000c5","email":"manager@example.invalid","role":"authenticated"}';
do $$ begin
 update public.docs set data=data||'{"stock":2}' where col='ro-munro/productos' and id='p-1';
 if (select data->>'stock' from public.docs where col='ro-munro/productos' and id='p-1')<>'2' then raise exception 'Manager write blocked';end if;
end $$;
reset role;
rollback;
select 'PASS: creator read-only by default (direct and privileged paths), time-boxed audited editing, team changes audited, owners/managers unaffected; fixtures rolled back' as verification;
