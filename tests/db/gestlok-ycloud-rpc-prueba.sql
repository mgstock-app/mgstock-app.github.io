-- Ejecutar SOLO en GESTLOK Pruebas (irqeitzbfyerxcrogkyh), nunca en producción.
-- La transacción no deja pedidos ni cambios de datos.
begin;
do $test$
declare
 t uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 c uuid; h bytea:=decode(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'hex');
 r jsonb; j jsonb; pending int;
begin
 if not exists(select 1 from information_schema.schemata where schema_name='entorno_control') or
    not exists(select 1 from information_schema.columns where table_schema='gestlok_chat_private' and table_name='pedidos' and column_name='es_prueba' and column_default='true') then
   raise exception 'Solo se permite ejecutar en el entorno aislado de pruebas';
 end if;
 insert into gestlok_tenancy.tenants(id) values(t);
 insert into gestlok_chat_private.empresas(tenant_id,nombre_publico) values(t,'Piloto ficticio');
 insert into gestlok_chat_private.sucursales(id,tenant_id,local_id,slug,nombre,activa,acepta_envio,envio_costo,medios_pago,medios_pago_retiro,medios_pago_envio)
 values(s,t,'wa-prueba-a','wa-prueba-a-'||substr(s::text,1,8),'Sucursal ficticia A',true,true,500,array['efectivo','debito'],array['debito'],array['efectivo']),
 (s2,t,'wa-prueba-b','wa-prueba-b-'||substr(s2::text,1,8),'Sucursal ficticia B',true,true,500,array['efectivo','debito'],array['debito'],array['efectivo']);
 insert into gestlok_chat_private.productos(id,tenant_id,sucursal_id,nombre,precio) values(p,t,s,'Producto ficticio',1000);
 r:=public.gestlok_chat_srv_conversacion(s,h,'piloto-ficticio-'||t::text);
 c:=(r->>'id')::uuid;
 j:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('producto_id',p,'cantidad',2,'opciones','{}'::jsonb)),'nombre','Persona ficticia','telefono','+5491100000000','entrega','envio','direccion','Calle ficticia 123','medio_pago','efectivo','efectivo_abona','3000');
 r:=public.gestlok_chat_srv_pedido(c,h,j);
 select count(*) into pending from gestlok_chat_private.pedidos where conversacion_id=c and tenant_id=t and sucursal_id=s and estado='pendiente' and es_prueba and total=2500 and efectivo_cambio=500 and confirmado_at is null;
 if pending<>1 then raise exception 'La prueba no generó exactamente una solicitud pendiente con el total correcto'; end if;
 begin
   perform public.gestlok_chat_srv_pedido(c,h,j);
   raise exception 'La prueba permitió duplicar la solicitud' using errcode='XX000';
 exception when sqlstate 'P0001' then null;
 end;
 begin
   perform public.gestlok_chat_srv_conversacion(s2,h,'piloto-ficticio-'||t::text);
   raise exception 'La prueba permitió mezclar sucursales' using errcode='XX000';
 exception when insufficient_privilege then null;
 end;
end $test$;
rollback;
select 'PRUEBA RPC CORRECTA Y REVERTIDA' as resultado;
