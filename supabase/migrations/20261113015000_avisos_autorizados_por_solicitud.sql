-- GESTLOK · Avisos son comunicaciones editoriales EXPLICITAMENTE solicitadas.
-- Sin supresión de vencimientos, conteos, stock ni sus datos operativos.
-- Cambios limitados a public.docs donde col termina en "/avisos".
-- Las entradas automatizadas antiguas permanecen en base, pero no se muestran en la bandeja.
-- El aviso que la administradora ya solicitó para Munro se conserva.
-- Nunca crear un aviso por esta migración.
--
-- Reversible:
--   CREATE TRIGGER gestlok_notify_docs_changes AFTER INSERT OR UPDATE OF data
--     ON public.docs FOR EACH ROW EXECUTE FUNCTION public.gestlok_enqueue_alert();
--   DROP POLICY IF EXISTS gestlok_avisos_solo_roles_local ON public.docs;
--   DROP POLICY IF EXISTS gestlok_avisos_solo_creadora_insert ON public.docs;
--   DROP POLICY IF EXISTS gestlok_avisos_solo_creadora_update ON public.docs;
--   DROP POLICY IF EXISTS gestlok_avisos_solo_creadora_delete ON public.docs;
-- El indicador de un aviso antiguo se puede conservar; nunca borrar avisos ni eventos.
BEGIN;
DROP TRIGGER IF EXISTS gestlok_notify_docs_changes ON public.docs;

-- Otras categorías de documentos conservan EXACTAMENTE sus políticas.
-- La política RESTRICTIVE suma aislamiento a las políticas de lectura vigentes.
CREATE POLICY gestlok_avisos_solo_roles_local
ON public.docs AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  col !~ '^[^/]+/avisos$'
  OR (
    public.mi_rol() IN ('creadora','dueno','gerente')
    AND public.puede_ver_local(split_part(col,'/',1))
  )
);

-- No se publica automáticamente ni se permite a otros roles crear avisos.
-- El servicio interno (service_role) autoriza publicaciones solicitadas;
-- las políticas de datos existentes siguen validando empresa y local.
CREATE POLICY gestlok_avisos_solo_creadora_insert
ON public.docs AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  col !~ '^[^/]+/avisos$'
  OR (
    public.mi_rol()='creadora'
    AND data->>'publicacion_autorizada'='true'
  )
);
CREATE POLICY gestlok_avisos_solo_creadora_update
ON public.docs AS RESTRICTIVE FOR UPDATE TO authenticated
USING (col !~ '^[^/]+/avisos$' OR public.mi_rol()='creadora')
WITH CHECK (
  col !~ '^[^/]+/avisos$'
  OR (
    public.mi_rol()='creadora'
    AND data->>'publicacion_autorizada'='true'
  )
);
CREATE POLICY gestlok_avisos_solo_creadora_delete
ON public.docs AS RESTRICTIVE FOR DELETE TO authenticated
USING (col !~ '^[^/]+/avisos$' OR public.mi_rol()='creadora');

-- Unica comunicación previamente solicitada de forma explícita por la administradora.
-- No introducir noticias nuevas ni modificar autor, fecha, destinatarios o texto.
UPDATE public.docs
SET data = data || jsonb_build_object('publicacion_autorizada',true,'origen','solicitud_explicita')
WHERE col='munro/avisos'
  AND tenant_id='cb0dc04a-9a13-434f-a3d0-47f1d8f39670'::uuid
  AND id='gestlok-horarios-resumen-pr364-nov2026'
  AND data->>'publicacion_autorizada' IS DISTINCT FROM 'true';
COMMIT;
