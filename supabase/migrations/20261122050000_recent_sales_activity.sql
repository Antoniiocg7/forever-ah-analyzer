-- Ventas recientes y nivel de mercado.
-- La media de 7 días necesita ≥ 6 h de datos en un mismo día; mientras tanto (y para reaccionar antes)
-- se calcula también una estimación de las últimas 24 h en cada ingesta.

alter table item_prices_latest
  add column sold_24h int,     -- ESTIMACIÓN de ventas/día con las últimas 24 h (null con menos de 1 h cubierta)
  add column sold_hours int;   -- horas de datos en las que se basa

create or replace function refresh_recent_sales(p_house int) returns void
language sql
set search_path = public
as $$
  with snaps as (
    select id, gap_minutes from snapshots
    where house_id = p_house and gap_minutes is not null and fetched_at > now() - interval '24 hours'
  ),
  cov as (select coalesce(sum(gap_minutes), 0) as minutes from snaps)
  update item_prices_latest l
     set sold_hours = (select round(minutes / 60.0)::int from cov),
         sold_24h = case when (select minutes from cov) >= 60 then
           round(coalesce((select sum(p.est_sold) from item_prices_hourly p
                           where p.item_id = l.item_id and p.snapshot_id in (select id from snaps)), 0)
                 * 1440.0 / (select minutes from cov))::int
         end
   where l.house_id = p_house;
$$;
revoke execute on function refresh_recent_sales(int) from public, anon, authenticated;
grant execute on function refresh_recent_sales(int) to service_role;

-- sold_per_day: media de 7 días si existe; si no, la estimación de 24 h.
-- activity: nivel de mercado (mismos umbrales que marketActivity() en src/lib/pricing/activity.ts):
--   high   ≥ 50 ventas/día, o ≥ 10 y rota ≥ 25% del stock al día
--   normal ≥ 5 ventas/día
--   low    menos de 5
create or replace view latest_item_prices with (security_invoker = true) as
select l.house_id, l.fetched_at, l.item_id, l.min_buyout, l.p15_market, l.qty, l.num_auctions,
       m.market_7d, x.sold as sold_per_day,
       i.name_en, i.quality, i.icon_url, i.vendor_sell, i.vendor_buy, i.vendor_sold,
       case when m.market_7d > 0 then round(1 - l.min_buyout::numeric / m.market_7d, 4) end as discount,
       l.deal_units, l.deal_cost, l.vendor_units, l.vendor_profit, m.trend, i.class, i.subclass, i.name_es,
       case when m.sold_per_day is not null then 'week' when l.sold_24h is not null then '24h' end as sold_source,
       l.sold_hours,
       case
         when x.sold is null then null
         when x.sold >= 50 or (x.sold >= 10 and x.sold >= l.qty * 0.25) then 'high'
         when x.sold >= 5 then 'normal'
         else 'low'
       end as activity
from item_prices_latest l
left join item_market_7d m on m.house_id = l.house_id and m.item_id = l.item_id
left join items i on i.id = l.item_id
cross join lateral (select coalesce(m.sold_per_day, l.sold_24h) as sold) x;
