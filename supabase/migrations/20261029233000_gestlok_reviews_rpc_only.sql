-- GESTLOK · Seguridad: reseñas visitantes exclusivamente por RPC validada.
-- La tabla tenía dos políticas INSERT permisivas; su OR permite saltar validaciones.
-- La demo real usa public.gestlok_demo_enviar_resena_cupon(...) SECURITY DEFINER,
-- por lo que NO necesita acceso directo INSERT sobre la tabla.
-- No altera reseñas, códigos, consentimiento, archivos ni datos históricos.
revoke insert on table public.gestlok_app_reviews from anon, authenticated;
-- Evitar concesiones accidentales mediante rol PUBLIC heredado.
revoke insert on table public.gestlok_app_reviews from public;

-- Mantener la RPC de emisión de reseñas/cupones disponible para visitantes.
-- No se amplían privilegios existentes: conservar su EXECUTE actual.
