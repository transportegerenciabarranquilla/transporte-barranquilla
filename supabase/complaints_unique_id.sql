-- Ejecutar en SQL Editor de Supabase. No elimina ni modifica quejas existentes.
-- Normalización equivalente a complaintIdentityKey de la aplicación.
-- Referencia: https://www.postgresql.org/docs/16/functions-string.html
begin;

lock table public.route_complaints in share row exclusive mode;

-- Si hay duplicados previos, esta consulta muestra los IDs que deben revisarse.
select lower(regexp_replace(normalize(complaint_id, NFD) collate "C", '[^a-zA-Z0-9]', '', 'g')) as id_normalizado,
       array_agg(complaint_id) as ids_existentes,
       count(*) as cantidad
from public.route_complaints
group by 1
having count(*) > 1;

-- El índice rechaza también duplicados enviados simultáneamente y variantes
-- con guiones, espacios, acentos o mayúsculas. Si ya hay duplicados, falla
-- sin borrar registros: revisarlos antes de volver a ejecutar.
create unique index if not exists route_complaints_identity_unique
on public.route_complaints (
  lower(regexp_replace(normalize(complaint_id, NFD) collate "C", '[^a-zA-Z0-9]', '', 'g'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'route_complaints_identity_not_empty'
      and conrelid = 'public.route_complaints'::regclass
  ) then
    alter table public.route_complaints add constraint route_complaints_identity_not_empty
    check (complaint_id is not null and regexp_replace(normalize(complaint_id, NFD) collate "C", '[^a-zA-Z0-9]', '', 'g') <> '');
  end if;
end $$;

commit;
