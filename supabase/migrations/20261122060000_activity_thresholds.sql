-- Umbrales de nivel de mercado más exigentes (iguales que marketActivity() en src/lib/pricing/activity.ts):
--   high   ≥ 500 ventas/día, o ≥ 20 y vende al menos la mitad de su stock al día
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
         when x.sold >= 500 or (x.sold >= 20 and x.sold >= l.qty * 0.5) then 'high'
         when x.sold >= 5 then 'normal'
         else 'low'
       end as activity
from item_prices_latest l
left join item_market_7d m on m.house_id = l.house_id and m.item_id = l.item_id
left join items i on i.id = l.item_id
cross join lateral (select coalesce(m.sold_per_day, l.sold_24h) as sold) x;
