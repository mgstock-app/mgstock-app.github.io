-- Motos Agencia (Munro): los gerentes de Munro también leen el historial (semanas cerradas). Pedido de la usuaria
-- del 02/11/2026: «los historiales deben verlo los gerentes». Siguen sin leer «tarifas» (valor por hora) y la pantalla
-- no les muestra importes; solo cargan y corrigen la semana en curso (las reglas de escritura no cambian).
-- Solo se modifica la condición de lectura de la regla existente (sin borrar nada). Vuelta atrás:
-- supabase/migrations/rollback-20261102160000_gestlok_munro_motos_historial_gerentes.sql.txt
alter policy gestlok_munro_motos_gerente_read on public.docs
  using (case when col = 'munro/agencia_motos' and public.mi_rol() not in ('creadora', 'dueno')
              then id <> 'tarifas'
              else true end);
