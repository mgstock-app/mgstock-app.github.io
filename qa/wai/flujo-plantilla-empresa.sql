-- Run inside a transaction with rollback; no WhatsApp numbers or messages.
do $qa$ declare s gestlok_chat_private.sucursales; n gestlok_chat_private.sucursales; t gestlok_chat_private.wai_plantillas_empresa; u uuid; x uuid; old_count integer; bad integer; begin
 select * into s from gestlok_chat_private.sucursales where slug='mi-gusto-munro';
 select * into t from gestlok_chat_private.wai_plantillas_empresa where tenant_id=s.tenant_id;
 if t.tenant_id is null then raise exception 'Plantilla ausente';end if;
 select count(*) into old_count from gestlok_chat_private.productos where sucursal_id=s.id;
 insert into public.docs(tenant_id,col,id,data) values(s.tenant_id,'locales','wai-qa-temporal-empresa','{"nombre":"QA Temporal"}');
 insert into gestlok_chat_private.sucursales(tenant_id,local_id,slug,nombre,prefijo) values(s.tenant_id,'wai-qa-temporal-empresa','wai-qa-temporal-empresa','QA Temporal','QA') returning id into x;
 select * into n from gestlok_chat_private.sucursales where id=x;
 if (select count(*) from gestlok_chat_private.productos where sucursal_id=x)<>jsonb_array_length(t.productos) then raise exception 'No heredó productos';end if;
 if (select count(*) from gestlok_chat_private.categorias where sucursal_id=x)<>jsonb_array_length(t.categorias) then raise exception 'No heredó categorías';end if;
 if n.horario is distinct from t.config->>'horario' or n.whatsapp_local<>'' or n.datos_transferencia<>'' or n.direccion<>'' or n.activa then raise exception 'Configuración insegura';end if;
 select count(*) into bad from gestlok_chat_private.productos p cross join lateral jsonb_path_query(p.opciones,'$.**.producto_id') j where p.sucursal_id=x and not exists(select 1 from gestlok_chat_private.productos a where a.sucursal_id=x and a.id::text=trim(both '"' from j::text));
 if bad<>0 then raise exception 'Referencia cruzada de menú: %',bad;end if;
 update gestlok_chat_private.productos set precio=precio+1 where sucursal_id=x;
 if (select count(*) from gestlok_chat_private.productos where sucursal_id=s.id)<>old_count then raise exception 'Alteró fuente';end if;
 if (select count(*) from gestlok_chat_private.wai_plantillas_empresa where tenant_id<>s.tenant_id)>0 then raise exception 'Plantilla copiada fuera de la empresa';end if;
 select au.id into u from auth.users au join gestlok_platform.admins ad on ad.user_id=au.id order by au.id limit 1;
 if u is not null then
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
  if not exists(select 1 from jsonb_array_elements(public.gestlok_chat_wai_admin_organizacion()) a where a->>'local_id'=s.local_id and a->>'plantilla'='true') then raise exception 'Panel sin datos de plantilla';end if;
 end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin perform public.gestlok_chat_wai_admin_organizacion();raise exception 'Acceso no autorizado';exception when insufficient_privilege then null;end;
end $qa$;