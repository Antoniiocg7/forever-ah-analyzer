-- Nombres en español (es_ES) de objetos, recetas y profesiones, para el selector de idioma.
alter table items add column name_es text;
alter table recipes add column name_es text;
alter table recipes add column profession_es text;

create or replace view profession_summary with (security_invoker = true) as
select profession_slug as slug, min(profession) as name, count(*)::int as recipes, min(profession_es) as name_es
from recipes
group by profession_slug;

create or replace view latest_item_prices with (security_invoker = true) as
select l.house_id, l.fetched_at, l.item_id, l.min_buyout, l.p15_market, l.qty, l.num_auctions,
       m.market_7d, m.sold_per_day,
       i.name_en, i.quality, i.icon_url, i.vendor_sell, i.vendor_buy, i.vendor_sold,
       case when m.market_7d > 0 then round(1 - l.min_buyout::numeric / m.market_7d, 4) end as discount,
       l.deal_units, l.deal_cost, l.vendor_units, l.vendor_profit, m.trend, i.class, i.subclass, i.name_es
from item_prices_latest l
left join item_market_7d m on m.house_id = l.house_id and m.item_id = l.item_id
left join items i on i.id = l.item_id;

create index items_name_es_idx on items (lower(name_es) text_pattern_ops);
