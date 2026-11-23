-- NFC y QR · asignar placas sin activar al chat de un local de GESTLOK Chat (solo la administradora).
-- Las placas se imprimen todas iguales y sin activar («Sin comercio (stock)»). Después la administradora elige el
-- local de GESTLOK Chat: la placa pasa a ese comercio y sucursal, con el link https://gestlok.com.ar/chat/?s=<slug>,
-- y queda activa. El código impreso no cambia. Si el comercio o la sucursal no existen en NFC y QR, se crean.

create or replace function public.gestlok_nfc_asignar_chat(p_codes text[], p_slug text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor uuid := gestlok_nfc_private.require_creator();
  v_codes text[] := gestlok_nfc_private.codes(p_codes);
  s gestlok_chat_private.sucursales;
  v_empresa text; v_local text; v_url text; v_com uuid; v_suc uuid; v_mov jsonb; v_act jsonb;
begin
  select * into s from gestlok_chat_private.sucursales where slug = p_slug;
  if s.id is null then raise exception 'Ese local de GESTLOK Chat no existe' using errcode = 'P0002'; end if;
  select left(btrim(e.nombre_publico), 80) into v_empresa from gestlok_chat_private.empresas e
   where e.tenant_id = s.tenant_id and e.habilitada;
  if coalesce(v_empresa, '') = '' then raise exception 'GESTLOK Chat no está activo en esa empresa' using errcode = '22023'; end if;
  v_local := left(btrim(s.nombre), 80);
  v_url := 'https://gestlok.com.ar/chat/?s=' || s.slug;

  select c.id into v_com from gestlok_nfc_private.comercios c where lower(btrim(c.nombre)) = lower(v_empresa);
  if v_com is null then
    insert into gestlok_nfc_private.comercios (nombre) values (v_empresa) returning id into v_com;
    perform gestlok_nfc_private.log(v_actor, 'comercio_creado', null, v_com, null, 'Creado desde GESTLOK Chat: ' || v_empresa);
  end if;
  select x.id into v_suc from gestlok_nfc_private.sucursales x
   where x.comercio_id = v_com and lower(btrim(x.nombre)) = lower(v_local);
  if v_suc is null then
    insert into gestlok_nfc_private.sucursales (comercio_id, nombre, destino) values (v_com, v_local, v_url) returning id into v_suc;
    perform gestlok_nfc_private.log(v_actor, 'sucursal_creada', null, v_com, v_suc, 'Creada desde GESTLOK Chat con el link ' || v_url);
  else
    update gestlok_nfc_private.sucursales set destino = v_url, updated_at = now()
     where id = v_suc and destino is distinct from v_url;
    if found then
      perform gestlok_nfc_private.log(v_actor, 'sucursal_editada', null, v_com, v_suc, 'Link de GESTLOK Chat: ' || v_url);
    end if;
  end if;

  v_mov := public.gestlok_nfc_reasignar(v_codes, v_com, v_suc);
  v_act := public.gestlok_nfc_activar(v_codes, true);
  return jsonb_build_object('ok', true, 'destino', v_url, 'lugar', v_empresa || ' · ' || v_local,
    'movidas', v_mov->'movidas', 'activadas', v_act->'cambiadas', 'no_existen', v_mov->'no_existen');
end $$;
revoke all on function public.gestlok_nfc_asignar_chat(text[], text) from public, anon;
grant execute on function public.gestlok_nfc_asignar_chat(text[], text) to authenticated;

-- Pedido 23/11: las placas sin asignar se imprimen desactivadas. El «link general» de las placas sin comercio
-- (hasta hoy la tienda de Belisa Parfum) se vacía para que muestren «Esta placa no está activa». Se puede volver a
-- cargar desde el panel si algún día se quiere.
update gestlok_nfc_private.ajustes set destino_sin_activar = null, updated_at = now()
 where id and destino_sin_activar is not null;
