-- Desactivar sólo las RPC nuevas, conservando movimientos, precios e historial.
revoke execute on function public.gestlok_molino_save_price_basis(uuid,text,numeric,text) from authenticated;
revoke execute on function public.gestlok_molino_save_return(uuid,text,numeric,text,text) from authenticated;
revoke execute on function public.gestlok_molino_returns_month(text) from authenticated;
-- No borrar columnas ni datos financieros. Para restaurar, reaplicar grants/migración.
