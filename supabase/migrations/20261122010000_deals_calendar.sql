-- Fase 2 (chollos) y contexto de fases.

-- Profundidad calculada en la ingesta a partir de cada subasta:
--  * deal_units/deal_cost: unidades a ≤ 85% de la mediana de 7 días y lo que cuestan.
--  * vendor_units/vendor_profit: unidades por debajo de lo que paga el vendedor y la ganancia segura.
alter table item_prices_latest
  add column deal_units int not null default 0,
  add column deal_cost bigint not null default 0,
  add column vendor_units int not null default 0,
  add column vendor_profit bigint not null default 0;

-- Tendencia: variación de la mediana diaria entre el primer y el último día de la semana (≥ 3 días).
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
  where day >= current_date - 7
  group by house_id, item_id
) x;

create or replace view latest_item_prices with (security_invoker = true) as
select l.house_id, l.fetched_at, l.item_id, l.min_buyout, l.p15_market, l.qty, l.num_auctions,
       m.market_7d, m.sold_per_day,
       i.name_en, i.quality, i.icon_url, i.vendor_sell, i.vendor_buy, i.vendor_sold,
       case when m.market_7d > 0 then round(1 - l.min_buyout::numeric / m.market_7d, 4) end as discount,
       l.deal_units, l.deal_cost, l.vendor_units, l.vendor_profit, m.trend, i.class, i.subclass
from item_prices_latest l
left join item_market_7d m on m.house_id = l.house_id and m.item_id = l.item_id
left join items i on i.id = l.item_id;

-- Calendario de WoW Forever (Icy Veins, roadmap consultado el 22-11-2026). Editable.
insert into settings (key, value) values
  ('calendar', '[
    {"date": "2026-11-04", "kind": "launch", "name": "Lanzamiento de WoW Forever"},
    {"date": "2026-12-09", "kind": "raid", "name": "Abren las raids: Barrow Deeps, Hyjal Summit y Onyxia''s Lair"}
  ]')
on conflict (key) do nothing;
