-- Test two real-like inbound events without authorizing their separate numbers.
-- Every write here is rolled back; never send to WhatsApp from the fixture.
do $test$
declare u uuid; s gestlok_chat_private.sucursales; other gestlok_chat_private.sucursales; line_id uuid; other_id uuid; k text; key text; okey text; inst uuid:=gen_random_uuid(); rev uuid; orev uuid; snap jsonb; r jsonb; a uuid; b uuid; c uuid; jid text:='5491100000811@s.whatsapp.net'; jid2 text:='5491100000812@s.whatsapp.net'; jid_ex text:='5491100000813@s.whatsapp.net'; ts bigint; 
begin
 if not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) or exists(select 1 from gestlok_chat_private.wai_servidor_central) then raise exception 'Solo base de Prueba sin servicio central configurado';end if;
 select user_id into u from gestlok_platform.admins order by user_id limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
 select * into s from gestlok_chat_private.sucursales where slug='mi-gusto-torcuato';
 select * into other from gestlok_chat_private.sucursales where slug='mi-gusto-munro';
 insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por) values(s.tenant_id,s.local_id,'+5491100000803',u,u) returning id into line_id;
 insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por) values(other.tenant_id,other.local_id,'+5491100000804',u,u) returning id into other_id;
 k=public.gestlok_chat_wai_central_admin('preparar')->>'clave';
 snap=public.gestlok_chat_wai_central_sync(k,inst,'sincronizar');
 select v->>'key' into key from jsonb_array_elements(snap->'sessions') v where v->>'id'=line_id::text;
 select v->>'key' into okey from jsonb_array_elements(snap->'sessions') v where v->>'id'=other_id::text;
 select revision into rev from gestlok_chat_private.wai_sesiones where habilitacion_id=line_id;
 select revision into orev from gestlok_chat_private.wai_sesiones where habilitacion_id=other_id;
 perform public.gestlok_chat_wai_senal_v2(line_id,key,rev,'conectado','+5491100000803',null);
 perform public.gestlok_chat_wai_senal_v2(other_id,okey,orev,'conectado','+5491100000804',null);
 ts=floor(extract(epoch from clock_timestamp()))::bigint;
 if public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,jid,'qa-no-mode',ts) is not null then raise exception 'Admitió sin activar modo';end if;
 perform public.gestlok_chat_wai_recepcion_admin(line_id,true);
 perform public.gestlok_chat_panel_whatsapp_excluidos(s.id,'agregar','+5491100000813','QA Excluido');
 ts=floor(extract(epoch from clock_timestamp()))::bigint;
 if public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,jid_ex,'qa-excluded',ts) is not null then raise exception 'Admitió excluido';end if;
 if public.gestlok_chat_wai_admitir_entrada(line_id,okey,rev,jid,'qa-key',ts) is not null or public.gestlok_chat_wai_admitir_entrada(other_id,okey,orev,jid,'qa-other',ts) is not null then raise exception 'Cruce de línea o modo';end if;
 if public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,'123@g.us','qa-group',ts) is not null or public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,jid,'qa-old',ts-120) is not null then raise exception 'Admitió grupo o historial';end if;
 r=public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,jid,'qa-in-a',ts); a=(r->>'id')::uuid;
 r=public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,jid2,'qa-in-b',ts); b=(r->>'id')::uuid;
 if a is null or b is null or a=b then raise exception 'No admitió clientes separados: %',r;end if;
 if (public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,jid,'qa-in-a',ts)->>'id')::uuid is distinct from a then raise exception 'Duplicó contacto';end if;
 snap=public.gestlok_chat_wai_ensayos_autorizados(line_id,key,rev,true);
 if not (snap->>'recepcion_entrante')::boolean or jsonb_array_length(snap->'ensayos')<>2 then raise exception 'Inventario incorrecto';end if;
 perform public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'control',a,null,null,null,null,'opciones_imagen_v2');
 perform public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'control',b,null,null,null,null,'opciones_imagen_v2');
 if not coalesce((public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'recibir',a,jid,'qa-in-a','Hola, quiero la carta')->>'ok')::boolean,false) then raise exception 'Mensaje A no admitido';end if;
 if not coalesce((public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'recibir',b,jid2,'qa-in-b','¿Cuál es el horario?')->>'ok')::boolean,false) then raise exception 'Mensaje B no admitido';end if;
 if public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'recibir',a,jid2,'qa-cross','Mensaje cruzado') is not null then raise exception 'Cruzó conversación';end if;
 if not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=a and direccion='entrada' and evento='qa-in-a') or not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=b and direccion='entrada' and evento='qa-in-b') then raise exception 'No conservó entradas';end if;
 -- Adding an already handled contact to the local list stops processing now.
 perform public.gestlok_chat_panel_whatsapp_excluidos(s.id,'agregar','+5491100000811','QA Excluido después');
 if public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'recibir',a,jid,'qa-blocked','Hola') is not null or public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'tomar',a,null,null,null,null,'opciones_imagen_v2') is not null then raise exception 'Respondió a contacto recién excluido';end if;
 -- Another local's exclusions do not affect this store.
 perform public.gestlok_chat_panel_whatsapp_excluidos(other.id,'agregar','+5491100000812','QA otro local');
 if not coalesce((public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'recibir',b,jid2,'qa-in-b2','Gracias')->>'ok')::boolean,false) then raise exception 'Exclusión de otra sucursal aplicada indebidamente';end if;
 perform public.gestlok_chat_wai_recepcion_admin(line_id,false);
 if public.gestlok_chat_wai_admitir_entrada(line_id,key,rev,'5491100000814@s.whatsapp.net','qa-off',ts) is not null or public.gestlok_chat_wai_piloto_motor(line_id,key,rev,'control',b) is not null then raise exception 'Recepción no se detuvo';end if;
 if not exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=b and evento='qa-in-b2') then raise exception 'Perdió historial al apagar';end if;
end $test$;
