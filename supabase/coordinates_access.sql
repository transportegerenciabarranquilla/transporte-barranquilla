-- Permite que el endpoint protegido de People consulte las coordenadas
-- usando el token del usuario autenticado.
alter table public."Cordenadas" enable row level security;

grant select on table public."Cordenadas" to authenticated;

drop policy if exists "coordenadas lectura autenticados" on public."Cordenadas";
create policy "coordenadas lectura autenticados"
on public."Cordenadas"
for select
to authenticated
using (true);
