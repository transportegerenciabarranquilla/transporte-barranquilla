-- Ejecutar cada CREATE INDEX CONCURRENTLY por separado, fuera de BEGIN/COMMIT.
-- No cambia datos ni permisos. Revisar pg_indexes antes de ejecutar para
-- evitar duplicar índices equivalentes existentes con otros nombres.
-- record_id debe conservar su PK/UNIQUE existente: no necesita otro índice.

-- Consultas por contratista y orden de actualización (seguimiento y guardado).
CREATE INDEX CONCURRENTLY IF NOT EXISTS seguimiento_contractor_updated_idx
  ON public.seguimiento_vehiculos (contractor, updated_at DESC);

-- Paginación estable por ID dentro de un contratista.
CREATE INDEX CONCURRENTLY IF NOT EXISTS seguimiento_contractor_record_idx
  ON public.seguimiento_vehiculos (contractor, record_id);

-- Listados globales y lecturas de históricos con propietarios heredados.
CREATE INDEX CONCURRENTLY IF NOT EXISTS seguimiento_updated_idx
  ON public.seguimiento_vehiculos (updated_at DESC);

-- Filtro de fecha aplicado por la API sobre el documento JSON.
CREATE INDEX CONCURRENTLY IF NOT EXISTS seguimiento_fecha_updated_idx
  ON public.seguimiento_vehiculos ((data->>'fechaDespacho'), updated_at DESC);

-- Verificación posterior (indisvalid debe ser true).
SELECT c.relname AS indice, i.indisvalid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE i.indrelid = 'public.seguimiento_vehiculos'::regclass;
