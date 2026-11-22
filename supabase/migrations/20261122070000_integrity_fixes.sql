-- Correcciones de la revisión del 22-11-2026.

-- 1. Un snapshot por casa y Last-Modified: si coinciden dos ingestas (GitHub y una manual), la
--    segunda falla al insertar en vez de duplicar el snapshot y contar las ventas dos veces.
create unique index snapshots_house_lm_uniq on snapshots (house_id, last_modified_header) where last_modified_header is not null;

-- 2. "7 días" eran 8 (day >= current_date - 7 incluye hoy y los 7 anteriores).
create or replace view item_market_7d with (security_invoker = true) as
select house_id, item_id, market_7d, sold_per_day, days,
       case when array_length(series, 1) >= 3 and series[1] > 0
            then round(series[array_length(series, 1)]::numeric / series[1] - 1, 4) end as trend
from (
  select house_id, item_id,
         round(percentile_cont(0.5) within group (order by avg_market))::bigint as market_7d,
         round(avg(est_sold))::int as sold_per_day,
         count(*)::int as days,
         array_agg(avg_market order by day) filter (where avg_market is not null) as series
  from item_prices_daily
  where day > current_date - 7
  group by house_id, item_id
) x;
