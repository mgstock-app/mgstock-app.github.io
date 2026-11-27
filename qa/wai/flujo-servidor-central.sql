-- Synthetic central enrollment inside a rolled-back transaction.
do $test$
declare u uuid; a gestlok_chat_private.sucursales; b gestlok_chat_private.sucursales; va uuid; vb uuid; oldkey text:=repeat('a',64); k text; inst uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); j jsonb; firstline jsonb; secondline jsonb; rev uuid; r jsonb;
begin
 if not coalesce((select habilitado from gestlok_chat_private.wai_piloto_entorno where id),false) then raise exception 'Solo Prueba';end if;
 if exists(select 1 from gestlok_chat_private.wai_servidor_central) then raise exception 'No se ejecuta con un servicio central configurado';end if;
 select user_id into u from gestlok_platform.admins order by user_id limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
 select * into a from gestlok_chat_private.sucursales where slug='mi-gusto-munro';
 select * into b from gestlok_chat_private.sucursales where slug='mi-gusto-torcuato';
 if a.id is null or b.id is null then raise exception 'Sucursales ausentes';end if;
 insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
 values(a.tenant_id,a.local_id,'+5491100000801',u,u) returning id into va;
 insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash) values(va,encode(sha256(convert_to(oldkey,'UTF8')),'hex'));
 k=public.gestlok_chat_wai_central_admin('preparar')->>'clave';
 if length(k)<>64 or (public.gestlok_chat_wai_central_admin('estado')?'clave') then raise exception 'Clave expuesta o inválida';end if;
 if public.gestlok_chat_wai_central_sync(oldkey,inst,'sincronizar') is not null then raise exception 'Aceptó clave ajena';end if;
 j=public.gestlok_chat_wai_central_sync(k,inst,'sincronizar');
 select v into firstline from jsonb_array_elements(j->'sessions') v where v->>'id'=va::text;
 if firstline is null or (firstline->>'key')=oldkey then raise exception 'No tomó línea existente';end if;
 select revision into rev from gestlok_chat_private.wai_sesiones where habilitacion_id=va;
 if public.gestlok_chat_wai_senal_v2(va,oldkey,rev,'conectado','+5491100000801',null) is not null then raise exception 'Clave anterior sigue activa';end if;
 r=public.gestlok_chat_wai_senal_v2(va,firstline->>'key',rev,'conectado','+5491100000801',null);
 if not coalesce((r->>'habilitada')::boolean,false) then raise exception 'Clave de línea inválida';end if;
 insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
 values(b.tenant_id,b.local_id,'+5491100000802',u,u) returning id into vb;
 j=public.gestlok_chat_wai_central_sync(k,inst,'sincronizar');
 select v into secondline from jsonb_array_elements(j->'sessions') v where v->>'id'=vb::text;
 if secondline is null or secondline->>'key'=firstline->>'key' then raise exception 'No agregó nueva línea independiente';end if;
 if (select revision from gestlok_chat_private.wai_sesiones where habilitacion_id=va) is distinct from rev then raise exception 'Alta reinició línea existente';end if;
 if not coalesce((public.gestlok_chat_wai_central_sync(k,other,'sincronizar')->>'ocupado')::boolean,false) then raise exception 'Permitió dos coordinadores';end if;
 update gestlok_chat_private.wai_comercios set activo=false where sucursal_id=b.id;
 j=public.gestlok_chat_wai_central_sync(k,inst,'sincronizar');
 if exists(select 1 from jsonb_array_elements(j->'sessions') v where v->>'id'=vb::text) or (select estado from gestlok_chat_private.wai_sesiones where habilitacion_id=vb)<>'sin_senal' then raise exception 'No respetó pausa';end if;
 if not exists(select 1 from jsonb_array_elements(j->'sessions') v where v->>'id'=va::text) then raise exception 'Pausa cruzada';end if;
 r=public.gestlok_chat_wai_senal_v2(vb,secondline->>'key',null,null,null,null);
 if coalesce((r->>'habilitada')::boolean,false) then raise exception 'Línea pausada obtuvo control';end if;
 update gestlok_chat_private.wai_comercios set activo=true where sucursal_id=b.id;
 j=public.gestlok_chat_wai_central_sync(k,inst,'sincronizar');
 if not exists(select 1 from jsonb_array_elements(j->'sessions') v where v->>'id'=vb::text) then raise exception 'No rehabilitó';end if;
 perform public.gestlok_chat_wai_central_sync(k,inst,'liberar');
 j=public.gestlok_chat_wai_central_sync(k,other,'sincronizar');
 if not coalesce((j->>'ok')::boolean,false) then raise exception 'No permitió reinicio autorizado';end if;
 if public.gestlok_chat_wai_senal_v2(va,firstline->>'key',rev,'conectado','+5491100000801',null) is not null then raise exception 'Instancia anterior recibió control';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin
  perform public.gestlok_chat_wai_central_admin('estado');raise exception 'No administrador accedió';
 exception when insufficient_privilege then null;end;
end $test$;
