-- Synthetic, rollback each local. No real WhatsApp calls or contact data.
do $test$
declare s gestlok_chat_private.sucursales; u uuid; h uuid; rev uuid; p1 uuid; p2 uuid; key text:=repeat('b',64);
 j1 text:='5491100000111@s.whatsapp.net';j2 text:='5491100000112@s.whatsapp.net';j3 text:='5491100000113@s.whatsapp.net';
 r jsonb; denied boolean; thread_count int;
begin
 select a.user_id into u from gestlok_platform.admins a join gestlok_chat_private.whatsapp_premium_habilitaciones wh on wh.creada_por=a.user_id order by wh.creada_at limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email',(select email from auth.users where id=u),'role','authenticated')::text,true);
 for s in select * from gestlok_chat_private.sucursales where slug in ('mi-gusto-munro','mi-gusto-torcuato') order by slug loop
 begin
  update gestlok_chat_private.sucursales set turnos_chat='[]' where id=s.id;
  insert into gestlok_chat_private.whatsapp_premium_habilitaciones(tenant_id,local_id,numero,creada_por,actualizada_por)
  values(s.tenant_id,s.local_id,case s.slug when 'mi-gusto-munro' then '+5491100000114' else '+5491100000115' end,u,u) returning id into h;
  insert into gestlok_chat_private.wai_sesiones(habilitacion_id,clave_hash,estado,senal_at,wa_verificada_at,opciones_at,imagenes_at,salsas_at)
  values(h,encode(sha256(convert_to(key,'UTF8')),'hex'),'conectado',now(),now(),now(),now(),now()) returning revision into rev;
  p1=public.gestlok_chat_wai_piloto_autorizar(s.id,h,'+'||split_part(j1,'@',1));
  denied=false;
  begin perform public.gestlok_chat_wai_piloto_autorizar(s.id,h,'+'||split_part(j2,'@',1));exception when sqlstate '22023' then denied=true;end;
  if not denied then raise exception 'Worker antiguo admite múltiples contactos';end if;
  if public.gestlok_chat_wai_ensayos_autorizados(h,repeat('c',64),rev,true) is not null then raise exception 'Clave incorrecta admitida';end if;
  r=public.gestlok_chat_wai_ensayos_autorizados(h,key,rev,true);
  if jsonb_array_length(r->'ensayos')<>1 then raise exception 'No devolvió la autorización inicial';end if;
  p2=public.gestlok_chat_wai_piloto_autorizar(s.id,h,'+'||split_part(j2,'@',1));
  if p1=p2 then raise exception 'IDs confundidos';end if;
  r=public.gestlok_chat_wai_ensayos_autorizados(h,key,rev,true);
  if jsonb_array_length(r->'ensayos')<>2 then raise exception 'Faltan autorizaciones';end if;
  denied=false;
  begin perform public.gestlok_chat_wai_piloto_autorizar(s.id,h,'+'||split_part(j2,'@',1));exception when sqlstate '22023' then denied=true;end;
  if not denied then raise exception 'Duplicó el contacto';end if;
  if public.gestlok_chat_wai_piloto_motor(h,key,rev,'control') is not null then raise exception 'Un worker antiguo eligió un contacto arbitrario';end if;
  if public.gestlok_chat_wai_piloto_motor(h,key,rev,'control',p1,null,null,null,null,'opciones_imagen_v2')->>'id'<>p1::text or public.gestlok_chat_wai_piloto_motor(h,key,rev,'control',p2,null,null,null,null,'opciones_imagen_v2')->>'id'<>p2::text then raise exception 'Control no aislado';end if;
  if public.gestlok_chat_wai_piloto_motor(h,key,rev,'recibir',p1,j2,'qa-ajeno','No guardar') is not null then raise exception 'Admitió JID de otro cliente';end if;
  if public.gestlok_chat_wai_piloto_motor(h,key,rev,'recibir',p1,j3,'qa-no-autorizado','No guardar') is not null then raise exception 'Admitió contacto no autorizado';end if;
  if not coalesce((public.gestlok_chat_wai_piloto_motor(h,key,rev,'recibir',p1,j1,'qa-1','Carta')->>'ok')::boolean,false) or not coalesce((public.gestlok_chat_wai_piloto_motor(h,key,rev,'recibir',p2,j2,'qa-2','Hola')->>'ok')::boolean,false) then raise exception 'No recibió ambos mensajes';end if;
  r=public.gestlok_chat_wai_bandeja(s.id);
  select count(*) into thread_count from jsonb_array_elements(r->'chats') x where x->>'id' in (p1::text,p2::text);
  if thread_count<>2 then raise exception 'Faltan conversaciones independientes';end if;
  if (select count(*) from gestlok_chat_private.wai_atencion_hilos where hilo_id in(p1,p2))<>2 or exists(select 1 from gestlok_chat_private.wai_mensajes where piloto_id=p1 and evento='qa-2' or piloto_id=p2 and evento='qa-1') then raise exception 'Historias cruzadas';end if;
  if not exists(select 1 from gestlok_chat_private.wai_menu_accesos where piloto_id=p1) or exists(select 1 from gestlok_chat_private.wai_menu_accesos where piloto_id=p2) then raise exception 'Carta mezclada';end if;
  perform public.gestlok_chat_wai_piloto_autorizar(s.id,h,null,'cancelar');
  if jsonb_array_length(public.gestlok_chat_wai_ensayos_autorizados(h,key,rev,true)->'ensayos')<>0 then raise exception 'Cancelación no revocó autorizaciones';end if;
  raise exception using errcode='ZX001',message='Revertir fixture';
 exception when sqlstate 'ZX001' then null;end;
 end loop;
end $test$;
select 'Dos contactos autorizados, control independiente y aislamiento comprobados en ambas sucursales' as resultado;
