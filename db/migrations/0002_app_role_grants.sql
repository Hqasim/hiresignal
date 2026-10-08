-- Least-privilege runtime role (SPEC §8, §16). Migrations run as the owner (DATABASE_MIGRATION_URL);
-- the Lambda connects as hiresignal_app (DATABASE_URL), which can read and write rows but can't
-- delete rows or change the schema.
--
-- Create the role before this migration first runs against Neon (docs/runbook.md); otherwise
-- this block grants nothing. Locally the role doesn't exist, so the block is a no-op.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hiresignal_app') then
    grant usage on schema public to hiresignal_app;
    grant select, insert, update on all tables in schema public to hiresignal_app;
    grant usage on all sequences in schema public to hiresignal_app;
    -- Tables and sequences that later migrations create (as this same owner) get the same grants.
    alter default privileges in schema public
      grant select, insert, update on tables to hiresignal_app;
    alter default privileges in schema public
      grant usage on sequences to hiresignal_app;
  end if;
end
$$;
