-- Ejecutar en Supabase > SQL Editor, en cada proyecto utilizado.
-- Solo catálogos/metadatos. No lee filas de negocio ni auth.users.
begin transaction read only;

select n.nspname as schema, c.relname as tabla, c.relkind,
       c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
       pg_get_userbyid(c.relowner) as owner, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage') and c.relkind in ('r','p','v','m')
order by 1,2;

select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as using_expression, with_check
from pg_policies where schemaname in ('public','storage')
order by 1,2,3;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema in ('public','storage')
  and grantee in ('anon','authenticated','service_role','PUBLIC')
order by 1,2,3,4;

select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema in ('public','storage') and grantee in ('anon','authenticated','PUBLIC')
order by 1,2,3,4;

select n.nspname as schema, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, pg_get_userbyid(p.proowner) as owner,
       p.proconfig as settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','storage') order by 1,2;

select n.nspname as schema, c.relname as tabla, t.tgname,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname='public' order by 1,2,3;

select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;

select rolname, rolsuper, rolbypassrls from pg_roles
where rolname in ('anon','authenticated','service_role');
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl
from pg_default_acl;
rollback;

-- RPC pendiente: obtener pg_get_functiondef(oid) de find_complaint_tracking
-- para revisar autorización y search_path. Revisar/redactar secretos antes de compartir.
