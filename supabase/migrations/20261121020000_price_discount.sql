-- Descuento del mínimo actual frente a la mediana de 7 días, para ordenar la portada por "por debajo de su precio".
create or replace view latest_item_prices with (security_invoker = true) as
select l.house_id, l.fetched_at, l.item_id, l.min_buyout, l.p15_market, l.qty, l.num_auctions,
       m.market_7d, m.sold_per_day,
       i.name_en, i.quality, i.icon_url, i.vendor_sell, i.vendor_buy, i.vendor_sold,
       case when m.market_7d > 0 then round(1 - l.min_buyout::numeric / m.market_7d, 4) end as discount
from item_prices_latest l
left join item_market_7d m on m.house_id = l.house_id and m.item_id = l.item_id
left join items i on i.id = l.item_id;
