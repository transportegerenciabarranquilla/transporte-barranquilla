begin;

alter table public.asistencias_ruta enable row level security;

drop policy if exists "asistencias lectura publica" on public.asistencias_ruta;
drop policy if exists "asistencias lectura" on public.asistencias_ruta;
drop policy if exists "asistencias escritura" on public.asistencias_ruta;
drop policy if exists "asistencias captura publica" on public.asistencias_ruta;
drop policy if exists "asistencias actualizacion publica" on public.asistencias_ruta;

create policy "asistencias lectura" on public.asistencias_ruta
for select to authenticated
using (
  public.current_is_admin()
  or public.current_is_people()
  or public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) = public.current_contractor()
);

create policy "asistencias escritura" on public.asistencias_ruta
for all to authenticated
using (
  public.current_is_admin()
  or public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) = public.current_contractor()
)
with check (
  public.current_is_admin()
  or public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) = public.current_contractor()
);

create policy "asistencias lectura publica" on public.asistencias_ruta
for select to anon
using (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
);

create policy "asistencias captura publica" on public.asistencias_ruta
for insert to anon
with check (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
);

create policy "asistencias actualizacion publica" on public.asistencias_ruta
for update to anon
using (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
)
with check (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
);

grant usage on schema public to anon;
grant select, insert, update on public.asistencias_ruta to anon;
grant select, insert, update, delete on public.asistencias_ruta to authenticated;
grant execute on function public.normalize_contractor_label(text) to anon;
grant execute on function public.normalize_contractor_label(text) to authenticated;
grant execute on function public.current_contractor() to authenticated;
grant execute on function public.current_is_admin() to authenticated;
grant execute on function public.current_is_people() to authenticated;

notify pgrst, 'reload schema';

commit;
