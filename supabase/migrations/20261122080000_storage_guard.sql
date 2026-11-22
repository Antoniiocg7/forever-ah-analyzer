-- Espacio: con una casa, el detalle horario de 7 días ocupa ~180 MB y el resumen diario crece
-- ~1,5 MB/día. Con 180 días de diario se pasaba de los 500 MB del plan gratis en 3–4 meses.
--  * Resumen diario: 90 días (las gráficas usan 30; las medianas, 7).
--  * Si aun así la base pasa de 400 MB, el detalle horario se recorta a 3 días.
create or replace function prune_hourly() returns void
language plpgsql
set search_path = public
as $$
declare
  keep interval := interval '7 days';
begin
  if pg_database_size(current_database()) > 400 * 1024 * 1024 then
    keep := interval '3 days';
    insert into ingest_errors (stage, message)
    values ('storage', 'La base de datos pasa de 400 MB: el detalle horario se recorta a 3 días.');
  end if;
  delete from item_prices_hourly
   where snapshot_id in (select id from snapshots where fetched_at < now() - keep)
     and snapshot_id not in (select snapshot_id from house_state);
  delete from snapshots s
   where s.fetched_at < now() - keep
     and s.id not in (select snapshot_id from house_state);
  delete from item_prices_daily where day < current_date - 90;
  delete from ingest_errors where at < now() - interval '30 days';
end;
$$;
revoke execute on function prune_hourly() from public, anon, authenticated;
