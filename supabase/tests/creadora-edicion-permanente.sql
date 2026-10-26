begin;
do $t$
declare u uuid; mail text; ctx jsonb; p text; n int; own uuid;
begin
 select a.user_id,us.email into u,mail from gestlok_platform.admins a join auth.users us on us.id=a.user_id where lower(us.email)='kmu15lopez@gmail.com';
 if u is null then raise exception 'Creadora no encontrada';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',u,'email',mail,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 ctx:=public.gestlok_creator_editing_state();
 if ctx->>'permanent'<>'true' or ctx->>'active'<>'true' or ctx->>'expires_at' is not null then raise exception 'No hay edición permanente';end if;
 foreach p in array array['munro','torcuato'] loop
  if not public.puede_editar_local(p) then raise exception 'Sin edición en %',p;end if;
  insert into public.docs(col,id,data,tenant_id) values(p||'/productos','fixture-creator-permanent','{"nombre":"Prueba ficticia","stock":0}',gestlok_tenancy.current_tenant_id());
  update public.docs set data=data||'{"stock":1}' where col=p||'/productos' and id='fixture-creator-permanent';
  get diagnostics n=row_count;if n<>1 then raise exception 'No editó en %',p;end if;
 end loop;
 -- Ni la compatibilidad con clientes viejos ni el paso del tiempo imponen una caducidad.
 ctx:=public.gestlok_creator_disable_editing();if ctx->>'active'<>'true' then raise exception 'Cierre temporal limita creadora';end if;
 perform set_config('role','postgres',true);
 select id,email into u,mail from auth.users where lower(email)='giselaopenheimer@hotmail.com';
 perform set_config('request.jwt.claims',json_build_object('sub',u,'email',mail,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 begin perform public.gestlok_creator_editing_state();raise exception 'Dueña obtuvo permiso de creadora';exception when insufficient_privilege then null;end;
 -- Correo falso en token no habilita el permiso administrativo permanente.
 perform set_config('request.jwt.claims',json_build_object('sub',u,'email','kmu15lopez@gmail.com','role','authenticated')::text,true);
 perform set_config('role','postgres',true);
 if gestlok_platform.creator_write_active() then raise exception 'Token ajeno habilitado';end if;
end $t$;
rollback;
