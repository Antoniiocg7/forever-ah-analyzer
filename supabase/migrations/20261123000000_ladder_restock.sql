-- Resets de mercado y cebos.
-- ladder: escalera de precios actual de cada objeto, [[precio, unidades], ...] agrupada por precio y
--         ordenada de menor a mayor (solo los primeros escalones). Solo en la tabla de "ahora".
-- est_listed / listed_24h: ESTIMACIÓN de unidades nuevas publicadas (reposición). Una recolocación
--         (cancelar y volver a publicar) también cuenta: para quien resetea es competencia igual.

alter table item_prices_latest
  add column ladder jsonb,
  add column listed_24h int;   -- unidades nuevas publicadas al día (últimas 24 h)

alter table item_prices_hourly
  add column est_listed int;

create or replace function refresh_recent_sales(p_house int) returns void
language sql
set search_path = public
as $$
  with snaps as (
    select id, gap_minutes from snapshots
    where house_id = p_house and gap_minutes is not null and fetched_at > now() - interval '24 hours'
  ),
  cov as (select coalesce(sum(gap_minutes), 0) as minutes from snaps),
  agg as (
    select p.item_id, sum(p.est_sold) as sold, sum(p.est_listed) as listed, count(p.est_listed) as listed_n
    from item_prices_hourly p
    where p.snapshot_id in (select id from snaps)
    group by p.item_id
  )
  update item_prices_latest l
     set sold_hours = (select round(minutes / 60.0)::int from cov),
         sold_24h = case when (select minutes from cov) >= 60 then
           round(coalesce(a.sold, 0) * 1440.0 / (select minutes from cov))::int
         end,
         -- Solo cuando todas las horas cubiertas tienen reposición (columna nueva desde el 23-11).
         listed_24h = case when (select minutes from cov) >= 60 and (select count(*) from snaps) = coalesce(a.listed_n, 0) then
           round(coalesce(a.listed, 0) * 1440.0 / (select minutes from cov))::int
         end
    from (select l2.item_id, a2.sold, a2.listed, a2.listed_n
          from item_prices_latest l2 left join agg a2 on a2.item_id = l2.item_id
          where l2.house_id = p_house) a
   where l.house_id = p_house and l.item_id = a.item_id;
$$;
revoke execute on function refresh_recent_sales(int) from public, anon, authenticated;
grant execute on function refresh_recent_sales(int) to service_role;

-- Se añade listed_per_day al final de la vista (la escalera no: pesa y solo la usa el cálculo de resets).
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
       end as activity,
       l.listed_24h as listed_per_day
from item_prices_latest l
left join item_market_7d m on m.house_id = l.house_id and m.item_id = l.item_id
left join items i on i.id = l.item_id
cross join lateral (select coalesce(m.sold_per_day, l.sold_24h) as sold) x;
