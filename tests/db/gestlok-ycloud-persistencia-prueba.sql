-- Solo en GESTLOK Pruebas; requiere supabase/operaciones/gestlok-ycloud-persistencia-pruebas.sql.
begin;
do $test$
declare
 t uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 slug text:='wa-prueba-'||substr(s::text,1,8); scope text:=encode(gen_random_bytes(32),'hex'); row jsonb; checked jsonb; sent jsonb; pedido jsonb;
begin
 insert into gestlok_tenancy.tenants(id) values(t);
 insert into gestlok_chat_private.empresas(tenant_id,nombre_publico) values(t,'Comercio ficticio');
 insert into gestlok_chat_private.sucursales(id,tenant_id,local_id,slug,nombre,activa,medios_pago,acepta_envio,envio_costo) values(s,t,'wa-a',slug,'Prueba A',true,array['efectivo'],true,500),
 (other,t,'wa-b','wa-prueba-b-'||substr(other::text,1,8),'Prueba B',true,array['efectivo'],true,500);
 insert into gestlok_chat_private.productos(id,tenant_id,sucursal_id,nombre,precio) values(p,t,s,'Producto de test',1000);
 row:=public.gestlok_ycloud_pilot_load(slug,s,scope);
 if row->>'revision' <> '0' then raise exception 'Carga inicial inválida'; end if;
 checked:=jsonb_build_object('scope','test','stage','confirm','review','snapshot','engine',jsonb_build_object('carrito',jsonb_build_array(jsonb_build_object('producto_id',p,'cantidad',2,'opciones','{}'::jsonb))));
 row:=public.gestlok_ycloud_pilot_commit(slug,s,scope,0,'evt-uno','msg-uno',null,checked,'Hola',jsonb_build_array('Revisión ficticia'));
 if row->>'status'<>'committed' or row->>'revision'<>'1' then raise exception 'No se guardó revisión inicial'; end if;
 row:=public.gestlok_ycloud_pilot_commit(slug,s,scope,0,'evt-dos','msg-dos',null,checked,'Hola',jsonb_build_array('Revisión ficticia'));
 if row->>'status'<>'conflict' then raise exception 'No se bloqueó estado antiguo'; end if;
 row:=public.gestlok_ycloud_pilot_commit(slug,s,scope,1,'evt-uno','msg-uno',null,checked,'Hola',jsonb_build_array('Revisión ficticia'));
 if row->>'status'<>'duplicate' then raise exception 'No se bloqueó duplicado'; end if;
 sent:=jsonb_set(checked,'{stage}','"submitted"'::jsonb);
 pedido:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('producto_id',p,'cantidad',2,'opciones','{}'::jsonb)),'nombre','Persona ficticia','telefono','+5491100000000','entrega','envio','direccion','Calle ficticia 123','medio_pago','efectivo','efectivo_abona','3000');
 row:=public.gestlok_ycloud_pilot_commit(slug,s,scope,1,'evt-confirmar','msg-confirmar','wamid.ficticio',sent,'1',jsonb_build_array('Pedido ficticio'),pedido);
 if row->>'status'<>'committed' or nullif(row->>'order_code','') is null then raise exception 'No creó pedido ficticio pendiente'; end if;
 if (select count(*) from gestlok_chat_private.pedidos where tenant_id=t and sucursal_id=s and estado='pendiente' and es_prueba and total=2500)<>1 then raise exception 'Pedido/total/etiqueta inesperados'; end if;
 row:=public.gestlok_ycloud_pilot_commit(slug,s,scope,2,'evt-reintento','msg-confirmar','wamid.ficticio',sent,'1',jsonb_build_array('Repetido'),pedido);
 if row->>'status'<>'duplicate' then raise exception 'Se repitió el pedido'; end if;
 begin
  perform public.gestlok_ycloud_pilot_load(slug,other,scope);
  raise exception 'Se aceptó sucursal ajena' using errcode='XX000';
 exception when others then
  if sqlstate='XX000' then raise; end if;
 end;
end $test$;
rollback;
select 'PERSISTENCIA SIMULADA VALIDADA Y REVERTIDA' as resultado;
