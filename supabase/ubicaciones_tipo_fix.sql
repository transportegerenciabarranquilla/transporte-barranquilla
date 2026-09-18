-- Corrige el rechazo de cédulas RR por la restricción de una tabla existente.
-- Ejecutar en Supabase > SQL Editor. No cambia RLS ni elimina registros.
begin;

alter table public.ruta_criticas_riesgos
  drop constraint if exists ruta_criticas_riesgos_tipo_check;

alter table public.ruta_criticas_riesgos
  add constraint ruta_criticas_riesgos_tipo_check
  check (
    tipo in ('cables_bajos', 'via_danada', 'inundacion', 'cierre', 'peligro')
    or tipo ~ '^[0-9]+$'
  ) not valid;

-- NOT VALID evita rechazar registros históricos durante esta corrección;
-- la restricción sí se aplica a los próximos INSERT y UPDATE.
-- El servidor de la aplicación valida que la cédula pertenezca a un RR.
notify pgrst, 'reload schema';
commit;
