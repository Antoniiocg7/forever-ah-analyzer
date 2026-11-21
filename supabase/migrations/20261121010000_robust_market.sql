-- Mercado robusto: medianas en vez de medias.
-- Caso real (Thorium Shells, 17-11-2026): alguien compró todo lo barato y lo republicó a 4g;
-- ese snapshot subió la media diaria de 25c a 1g 44s y la de 7 días a 24s.

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
         min(p.min_buyout),
         round(percentile_cont(0.5) within group (order by p.p15_market)),   -- mediana del día
         max(p.p15_market),
         round(avg(p.qty)),
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
revoke execute on function rollup_daily(date) from public, anon, authenticated;
comment on column item_prices_daily.avg_market is 'Mediana del precio de mercado (p15) de los snapshots del día';

create or replace view item_market_7d with (security_invoker = true) as
select house_id, item_id,
       round(percentile_cont(0.5) within group (order by avg_market))::bigint as market_7d,   -- mediana de 7 días
       round(avg(est_sold))::int as sold_per_day,
       count(*)::int as days
from item_prices_daily
where day >= current_date - 7
group by house_id, item_id;

select rollup_daily(d::date) from generate_series(current_date - 6, current_date, interval '1 day') d;
