-- Recommendations only: this file is NOT applied by the application.
-- Inspect existing equivalent indexes and EXPLAIN (ANALYZE, BUFFERS) in staging.
-- Execute each CREATE INDEX CONCURRENTLY separately, outside a transaction.
-- IF NOT EXISTS compares names, not equivalent definitions.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('transporte_barranquilla', 'asistencias_ruta',
    'people_route_evaluations', 'seguimiento_vehiculos');

-- Personnel lookup/import/edit: exact CC and actual persisted contractor.
-- Skip if a PK/UNIQUE already covers the same leading columns.
CREATE INDEX CONCURRENTLY IF NOT EXISTS personnel_cc_contractor_idx
  ON public.transporte_barranquilla ("CC", "CONTRATISTA");

-- Personnel pagination: current stable ORDER BY; does not accelerate the
-- legacy contractor regex or count=exact by itself. Benchmark before adding.
CREATE INDEX CONCURRENTLY IF NOT EXISTS personnel_name_page_idx
  ON public.transporte_barranquilla ("NOMBRE", "CC", "CONTRATISTA");

-- Attendance reads scoped by contractor, newest first.
-- JSON legacy owner fallback is a separate condition; measure both branches.
CREATE INDEX CONCURRENTLY IF NOT EXISTS attendance_contractor_updated_idx
  ON public.asistencias_ruta (contractor, updated_at DESC);

-- Evaluation history without CC: ORDER BY created_at DESC, id DESC.
CREATE INDEX CONCURRENTLY IF NOT EXISTS route_evaluations_history_idx
  ON public.people_route_evaluations (created_at DESC, id DESC);

-- History with CC: the existing (cc, contractor, created_at DESC) does not
-- provide chronological order across contractors. Add only if frequently used.
CREATE INDEX CONCURRENTLY IF NOT EXISTS route_evaluations_cc_history_idx
  ON public.people_route_evaluations (cc, created_at DESC, id DESC);

-- Seguimiento already has recommendations in seguimiento_indexes.sql:
-- (contractor, updated_at DESC), (contractor, record_id), (updated_at DESC).
-- Reuse those definitions; do not create duplicate indexes here.
-- Do not add trigram indexes blindly: accent/separator-aware regex patterns
-- can prevent extraction of useful trigrams. A canonical owner/search RPC is
-- a separate schema proposal, requiring legacy aliases and tenant access tests.
