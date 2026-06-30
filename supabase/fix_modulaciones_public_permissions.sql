begin;

alter table public.modulaciones_ruta enable row level security;

drop policy if exists "modulaciones captura publica" on public.modulaciones_ruta;
drop policy if exists "modulaciones actualizacion publica" on public.modulaciones_ruta;
drop policy if exists "modulaciones lectura publica" on public.modulaciones_ruta;

create policy "modulaciones lectura publica" on public.modulaciones_ruta
for select to anon
using (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
);

create policy "modulaciones captura publica" on public.modulaciones_ruta
for insert to anon
with check (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
);

create policy "modulaciones actualizacion publica" on public.modulaciones_ruta
for update to anon
using (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
)
with check (
  public.normalize_contractor_label(coalesce(contractor, data->>'contratista')) is not null
);

grant usage on schema public to anon;
grant select, insert, update on public.modulaciones_ruta to anon;
grant execute on function public.normalize_contractor_label(text) to anon;

notify pgrst, 'reload schema';

commit;
