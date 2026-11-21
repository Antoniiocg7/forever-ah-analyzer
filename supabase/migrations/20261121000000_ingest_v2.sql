-- Ingesta v2: arregla los fallos vistos del 16 al 21-11-2026.
--  * El estado jsonb de ~270k subastas superaba el statement_timeout al guardarse (la mitad de
--    las ejecuciones fallaban). Pasa a texto gzip+base64.
--  * item_prices_hourly crecía ~170 B por fila con dos índices: con dos casas y 7 días rozaba
--    el límite de 500 MB del plan gratis. Se queda con un solo índice y sin `median`.
--  * Las consultas de "precio actual" pasan a una tabla pequeña que se sobrescribe cada hora.
--  * Ventas: se guarda el hueco real entre snapshots para pasar la estimación a ventas/día.

-- 1. Estado comprimido para estimar ventas -------------------------------------------------
delete from house_state;
alter table house_state drop column auctions;
alter table house_state add column state text not null;      -- gzip+base64 de [[auctionId,itemId,qty,timeLeft]]
alter table house_state add column data_at timestamptz;      -- Last-Modified del snapshot

-- 2. Snapshots: hora real de los datos y hueco usado para estimar -------------------------
alter table snapshots add column data_at timestamptz;
alter table snapshots add column gap_minutes int;            -- null si ese snapshot no estimó ventas
update snapshots
   set data_at = to_timestamp(substr(last_modified_header, 6, 20), 'DD Mon YYYY HH24:MI:SS')
 where last_modified_header is not null;

-- 3. Histórico horario más compacto ---------------------------------------------------------
alter table item_prices_hourly drop constraint item_prices_hourly_snapshot_id_fkey;
alter table item_prices_hourly drop constraint item_prices_hourly_pkey;
drop index item_prices_hourly_item_idx;
alter table item_prices_hourly drop column median cascade;   -- arrastra la vista latest_item_prices, que se recrea abajo
alter table item_prices_hourly
  alter column min_buyout drop not null,     -- null = agotado (pero hubo ventas)
  alter column p15_market drop not null,
  alter column qty type int,
  alter column est_sold type int;
alter table item_prices_hourly add primary key (item_id, snapshot_id);

alter table item_prices_daily
  alter column min drop not null,
  alter column avg_market drop not null,
  alter column max drop not null,
  alter column avg_qty type int,
  alter column est_sold type int;
comment on column item_prices_daily.est_sold is 'ESTIMACIÓN de unidades vendidas por día (escalada a 24 h según las horas cubiertas)';

-- 4. Precio actual: tabla pequeña sobrescrita en cada ingesta -------------------------------
create table item_prices_latest (
  house_id     int not null references houses(id) on delete cascade,
  item_id      int not null,
  snapshot_id  bigint not null,
  fetched_at   timestamptz not null,
  min_buyout   bigint not null,
  p15_market   bigint not null,
  qty          int not null,
  num_auctions int not null,
  primary key (house_id, item_id)
);
alter table item_prices_latest enable row level security;

insert into item_prices_latest
select s.house_id, p.item_id, s.id, s.fetched_at, p.min_buyout, p.p15_market, p.qty, p.num_auctions
from item_prices_hourly p
join snapshots s on s.id = p.snapshot_id
where s.id in (select distinct on (house_id) id from snapshots order by house_id, fetched_at desc)
  and p.min_buyout is not null;

-- 5. Objetos: los que vende un vendedor (precio fijo) ---------------------------------------
alter table items add column vendor_sold boolean not null default false;
update items set vendor_sold = true where id in (
  2320, 2321, 4291, 8343, 14341,       -- Coarse/Fine/Silken/Heavy Silken/Rune Thread
  2880, 3466,                          -- Weak/Strong Flux
  3371, 3372, 8925, 18256,             -- Empty/Leaded/Crystal/Imbued Vial
  2678, 2692, 3713, 4289,              -- Mild/Hot/Soothing Spices, Salt
  4470, 10284, 159, 1179, 2324,        -- Simple Wood, Simple Flour, Refreshing Spring Water, Ice Cold Milk, Bleach
  6217,                                -- Copper Rod
  4340, 6260, 2604, 2605, 2325, 6261, 4341, 4342, 10290  -- tintes
);

-- 6. Vistas ---------------------------------------------------------------------------------
create view item_market_7d with (security_invoker = true) as
select house_id, item_id,
       round(avg(avg_market))::bigint as market_7d,
       round(avg(est_sold))::int      as sold_per_day,   -- null si no hay estimación
       count(*)::int                  as days
from item_prices_daily
where day >= current_date - 7
group by house_id, item_id;

drop view if exists latest_item_prices;
create view latest_item_prices with (security_invoker = true) as
select l.house_id, l.fetched_at, l.item_id, l.min_buyout, l.p15_market, l.qty, l.num_auctions,
       m.market_7d, m.sold_per_day,
       i.name_en, i.quality, i.icon_url, i.vendor_sell, i.vendor_buy, i.vendor_sold
from item_prices_latest l
left join item_market_7d m on m.house_id = l.house_id and m.item_id = l.item_id
left join items i on i.id = l.item_id;

-- 7. Resumen diario y limpieza --------------------------------------------------------------
create or replace function rollup_daily(p_day date) returns void
language sql
set search_path = public
as $$
  with snaps as (
    select id, house_id, gap_minutes
    from snapshots
    where fetched_at >= p_day::timestamptz and fetched_at < (p_day + 1)::timestamptz
  ),
  coverage as (
    select house_id, sum(gap_minutes) as minutes from snaps where gap_minutes is not null group by house_id
  )
  insert into item_prices_daily (house_id, day, item_id, min, avg_market, max, avg_qty, est_sold)
  select s.house_id, p_day, p.item_id,
         min(p.min_buyout), round(avg(p.p15_market)), max(p.p15_market), round(avg(p.qty)),
         -- Solo con al menos 6 h cubiertas; se escala a 24 h.
         case when max(c.minutes) >= 360
              then round(coalesce(sum(p.est_sold), 0) * 1440.0 / max(c.minutes)) end
  from item_prices_hourly p
  join snaps s on s.id = p.snapshot_id
  left join coverage c on c.house_id = s.house_id
  group by s.house_id, p.item_id
  on conflict (house_id, item_id, day) do update
    set min = excluded.min, avg_market = excluded.avg_market, max = excluded.max,
        avg_qty = excluded.avg_qty, est_sold = excluded.est_sold;
$$;

create or replace function prune_hourly() returns void
language sql
set search_path = public
as $$
  delete from item_prices_hourly
   where snapshot_id in (select id from snapshots where fetched_at < now() - interval '7 days')
     and snapshot_id not in (select snapshot_id from house_state);
  delete from snapshots s
   where s.fetched_at < now() - interval '7 days'
     and s.id not in (select snapshot_id from house_state);
  delete from item_prices_daily where day < current_date - 180;
  delete from ingest_errors where at < now() - interval '30 days';
$$;
revoke execute on function rollup_daily(date) from public, anon, authenticated;
revoke execute on function prune_hourly() from public, anon, authenticated;

-- 8. Ajustes nuevos -------------------------------------------------------------------------
insert into settings (key, value) values
  ('my_professions', '["mining", "blacksmithing", "first-aid"]')
on conflict (key) do nothing;

-- 9. Disparador horario fiable --------------------------------------------------------------
-- El cron de GitHub Actions solo corrió ~3 veces al día. pg_cron lanza el workflow por la API
-- de GitHub con un token guardado en Vault (nombre 'github_dispatch_token'). Sin token no hace nada.
create extension if not exists pg_net;

create or replace function trigger_ingest() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_dispatch_token';
  if tok is null then
    return;
  end if;
  perform net.http_post(
    url     := 'https://api.github.com/repos/Antoniiocg7/forever-ah-analyzer/actions/workflows/ingest.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'forever-ah-analyzer'),
    body    := jsonb_build_object('ref', 'main'));
end;
$$;
revoke execute on function trigger_ingest() from public, anon, authenticated;

-- Blizzard publica entre :19 y :24; se lanza a :35.
select cron.schedule('trigger-ingest', '35 * * * *', $$select trigger_ingest();$$);

-- Recalcula el resumen diario con la fórmula nueva.
select rollup_daily(d::date) from generate_series(current_date - 6, current_date, interval '1 day') d;
