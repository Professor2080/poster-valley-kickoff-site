-- Make five the default production threshold for newly registered drops while retaining
-- nullable historical compatibility and explicit per-drop overrides.

begin;
set local search_path = pg_catalog, public;

alter table public.product_registry
  alter column production_threshold set default 5;

-- PostgreSQL column defaults apply only when a value is omitted. Normalize an explicitly
-- supplied NULL on INSERT as well, so an authorized current or future server-side creation
-- path cannot accidentally create an unconfigured new drop. Updates remain nullable for
-- historical compatibility and explicit non-null thresholds pass through unchanged.
create function public.product_registry_normalize_production_threshold()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.production_threshold := 5;
  return new;
end
$function$;

create trigger product_registry_normalize_production_threshold
before insert on public.product_registry
for each row
when (new.production_threshold is null)
execute function public.product_registry_normalize_production_threshold();

revoke all on function public.product_registry_normalize_production_threshold()
from public, anon, authenticated, service_role;

-- This is the only existing drop whose threshold is changed by this migration.
update public.product_registry
set production_threshold = 5,
    updated_at = now()
where product_code = 'eurofighter-typhoon-a2'
  and production_threshold is distinct from 5;

commit;
