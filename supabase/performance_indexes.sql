

create index if not exists idx_seguimiento_contractor_updated
  on public.seguimiento_vehiculos (contractor, updated_at desc);

create index if not exists idx_seguimiento_contractor_dt_fecha
  on public.seguimiento_vehiculos (contractor, (data->>'transporte'), (data->>'fechaDespacho'));

create index if not exists idx_asistencias_contractor_updated
  on public.asistencias_ruta (contractor, updated_at desc);

create index if not exists idx_asistencias_key_contractor
  on public.asistencias_ruta (attendance_key, contractor);

create index if not exists idx_asistencias_contractor_dt
  on public.asistencias_ruta (contractor, (data->>'dt'));

create index if not exists idx_modulaciones_contractor_updated
  on public.modulaciones_ruta (contractor, updated_at desc);

create index if not exists idx_modulaciones_contractor_dt_fecha
  on public.modulaciones_ruta (contractor, (data->>'dt'), (data->>'fechaDespacho'));

create index if not exists idx_modulaciones_id_contractor
  on public.modulaciones_ruta (modulation_id, contractor);

create index if not exists idx_checkins_contractor_updated
  on public.checkins_cajas (contractor, updated_at desc);

create index if not exists idx_checkins_id_contractor
  on public.checkins_cajas (checkin_id, contractor);

create index if not exists idx_punto_corona_contractor_date_updated
  on public.punto_corona_route_reports (contractor, operational_date desc, updated_at desc);

create index if not exists idx_transporte_barranquilla_cc_contratista
  on public.transporte_barranquilla ("CC", "CONTRATISTA");

create index if not exists idx_transporte_barranquilla_contratista_nombre
  on public.transporte_barranquilla ("CONTRATISTA", "NOMBRE");
