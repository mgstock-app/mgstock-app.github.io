-- Mi Gusto · Munro: responsable por turno y decomiso opcional por producto.
-- Decomiso conserva chapas, sueltas y unidades; siempre se suma al total.
ALTER TABLE gestlok_munro_conteo_private.shifts
  ADD COLUMN IF NOT EXISTS responsable text,
  ADD COLUMN IF NOT EXISTS decomiso_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decomiso jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gestlok_munro_conteo_private.shifts
  DROP CONSTRAINT IF EXISTS munro_conteo_responsable_valido;
ALTER TABLE gestlok_munro_conteo_private.shifts
  ADD CONSTRAINT munro_conteo_responsable_valido
  CHECK (responsable IS NULL OR responsable IN ('Cami','Shuli','Tizi'));
ALTER TABLE gestlok_munro_conteo_private.shifts
  DROP CONSTRAINT IF EXISTS munro_conteo_decomiso_objeto;
ALTER TABLE gestlok_munro_conteo_private.shifts
  ADD CONSTRAINT munro_conteo_decomiso_objeto CHECK (jsonb_typeof(decomiso)='object');

CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_responsable(
  p_day date, p_shift text, p_responsable text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r gestlok_munro_conteo_private.shifts%rowtype;
BEGIN
  PERFORM gestlok_munro_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
     OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
     OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
     OR (p_responsable IS DISTINCT FROM '' AND p_responsable NOT IN ('Cami','Shuli','Tizi'))
  THEN RAISE EXCEPTION 'Fecha, turno o responsable no válido'; END IF;
  INSERT INTO gestlok_munro_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_munro_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  UPDATE gestlok_munro_conteo_private.shifts SET
     responsable=NULLIF(p_responsable,''),updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true,'responsable',NULLIF(p_responsable,''));
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_decomiso_visible(
  p_day date, p_shift text, p_visible boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r gestlok_munro_conteo_private.shifts%rowtype;
BEGIN
  PERFORM gestlok_munro_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
     OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
     OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
     OR p_visible IS NULL
  THEN RAISE EXCEPTION 'Fecha, turno o visibilidad no válidos'; END IF;
  INSERT INTO gestlok_munro_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_munro_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  UPDATE gestlok_munro_conteo_private.shifts SET
     decomiso_visible=p_visible,updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true,'visible',p_visible);
END $$;

CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_set_decomiso(
 p_day date,p_shift text,p_product text,
 p_chapas integer DEFAULT 0,p_sueltas integer DEFAULT 0,p_qty integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r gestlok_munro_conteo_private.shifts%rowtype; per integer;
BEGIN
  PERFORM gestlok_munro_conteo_private.require_access(true,false);
  IF p_day IS NULL OR p_day < date '2025-01-01'
    OR p_day > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
    OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
    OR p_product IS NULL OR p_chapas NOT BETWEEN 0 AND 500
    OR p_sueltas NOT BETWEEN 0 AND 100000 OR p_qty NOT BETWEEN 0 AND 1000000
  THEN RAISE EXCEPTION 'Decomiso no válido'; END IF;
  SELECT units_per_chapa INTO per FROM gestlok_munro_conteo_private.products
    WHERE id=p_product AND active;
  IF per IS NULL THEN RAISE EXCEPTION 'Producto no disponible'; END IF;
  IF (per>0 AND p_qty<>0) OR (per=0 AND (p_chapas<>0 OR p_sueltas<>0))
  THEN RAISE EXCEPTION 'Formato de decomiso no válido para este producto'; END IF;
  INSERT INTO gestlok_munro_conteo_private.shifts(day,shift) VALUES(p_day,p_shift)
    ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM gestlok_munro_conteo_private.shifts
    WHERE day=p_day AND shift=p_shift FOR UPDATE;
  IF r.status='finalizado' THEN RAISE EXCEPTION 'El conteo está finalizado'; END IF;
  IF NOT r.decomiso_visible THEN RAISE EXCEPTION 'Primero activá Decomiso'; END IF;
  UPDATE gestlok_munro_conteo_private.shifts SET
     decomiso=jsonb_set(r.decomiso,ARRAY[p_product],
       jsonb_build_object('chapas',p_chapas,'sueltas',p_sueltas,'qty',p_qty),true),
     updated_by=auth.uid(),updated_at=now()
     WHERE day=p_day AND shift=p_shift;
  RETURN jsonb_build_object('ok',true);
END $$;

-- No se puede archivar un turno sin responsable. Se preserva el historial anterior.
CREATE OR REPLACE FUNCTION public.gestlok_munro_conteo_finalize(p_day date,p_shift text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r gestlok_munro_conteo_private.shifts%rowtype;
BEGIN
 PERFORM gestlok_munro_conteo_private.require_access(true,false);
 IF p_day IS NULL OR p_shift NOT IN ('manana_entrada','manana_salida','noche_salida')
 THEN RAISE EXCEPTION 'Turno no válido'; END IF;
 SELECT * INTO r FROM gestlok_munro_conteo_private.shifts
   WHERE day=p_day AND shift=p_shift FOR UPDATE;
 IF NOT FOUND OR r.status='finalizado' THEN
   RAISE EXCEPTION 'No hay un borrador pendiente de finalizar';
 END IF;
 IF r.responsable NOT IN ('Cami','Shuli','Tizi') OR r.responsable IS NULL THEN
   RAISE EXCEPTION 'Elegí al gerente responsable antes de finalizar';
 END IF;
 UPDATE gestlok_munro_conteo_private.shifts
 SET status='finalizado',finished_at=now(),updated_at=now(),updated_by=auth.uid()
 WHERE day=p_day AND shift=p_shift;
 RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.gestlok_munro_conteo_responsable(date,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.gestlok_munro_conteo_decomiso_visible(date,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.gestlok_munro_conteo_set_decomiso(date,text,text,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gestlok_munro_conteo_responsable(date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestlok_munro_conteo_decomiso_visible(date,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestlok_munro_conteo_set_decomiso(date,text,text,integer,integer,integer) TO authenticated;