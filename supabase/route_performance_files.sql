-- Ejecutar una vez en Supabase SQL Editor del proyecto usado por esta app.
-- Guarda cada Excel original del centro de gráficas; la pantalla carga el último.
create table if not exists public.graficas_route_performance_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  file_base64 text not null check (length(file_base64) > 0),
  row_count integer not null check (row_count > 0),
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists graficas_route_performance_files_created_at_idx
  on public.graficas_route_performance_files (created_at desc, id desc);

alter table public.graficas_route_performance_files enable row level security;
revoke all on table public.graficas_route_performance_files from anon, authenticated;
grant select, insert on table public.graficas_route_performance_files to service_role;

comment on table public.graficas_route_performance_files is
  'Excel originales de kilómetros, entrega en rango y adherencia. Solo la API de gráficas admin puede leerlos y agregarlos.';

notify pgrst, 'reload schema';
