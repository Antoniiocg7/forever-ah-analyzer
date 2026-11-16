-- Forever AH Analyzer — esquema inicial (Fase 0 + Fase 1)
-- Todos los precios están en cobre (1g = 10000).

create table houses (
  id            int primary key,              -- ID de casa de la API (110–125)
  region        text not null default 'eu',
  name          text not null,                -- nombre tal cual lo da la API
  faction       text not null check (faction in ('alliance', 'horde', 'neutral', 'unknown')),
  ruleset_guess text,
  label         text,                         -- p. ej. 'Alliance · PvP' (lo marca el usuario)
  tracked       boolean not null default false,
  auction_count int,
  probed_at     timestamptz
);

-- Fase 0: precio mínimo de los materiales de referencia en cada casa.
create table house_probe (
  house_id   int not null references houses(id) on delete cascade,
  item_id    int not null,
  min_buyout bigint,
  qty        bigint not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (house_id, item_id)
);

create table items (
  id          int primary key,
  name_en     text,                           -- null si static-forever devuelve 404
  quality     text,
  icon_url    text,
  vendor_sell bigint,
  vendor_buy  bigint,
  class       text,
  subclass    text,
  source      text not null default 'blizzard',  -- 'blizzard' | 'missing' | 'manual'
  updated_at  timestamptz not null default now()
);
create index items_name_idx on items (lower(name_en) text_pattern_ops);

create table snapshots (
  id                   bigint generated always as identity primary key,
  house_id             int not null references houses(id) on delete cascade,
  fetched_at           timestamptz not null default now(),
  last_modified_header text,
  auction_count        int not null
);
create index snapshots_house_time_idx on snapshots (house_id, fetched_at desc);

create table item_prices_hourly (
  snapshot_id  bigint not null references snapshots(id) on delete cascade,
  item_id      int not null,
  min_buyout   bigint not null,
  p15_market   bigint not null,   -- media del 15% de unidades más baratas
  median       bigint not null,
  qty          bigint not null,
  num_auctions int not null,
  est_sold     bigint,            -- ESTIMACIÓN; null si no hay snapshot previo fiable
  primary key (snapshot_id, item_id)
);
create index item_prices_hourly_item_idx on item_prices_hourly (item_id, snapshot_id);

create table item_prices_daily (
  house_id   int not null references houses(id) on delete cascade,
  day        date not null,
  item_id    int not null,
  min        bigint not null,
  avg_market bigint not null,
  max        bigint not null,
  avg_qty    bigint not null,
  est_sold   bigint,              -- ESTIMACIÓN
  primary key (house_id, item_id, day)
);

-- Estado compacto del último snapshot de cada casa, para estimar ventas por
-- diferencia sin guardar las subastas en bruto: [[auction_id, item_id, qty, time_left], ...]
create table house_state (
  house_id    int primary key references houses(id) on delete cascade,
  snapshot_id bigint not null references snapshots(id) on delete cascade,
  fetched_at  timestamptz not null,
  auctions    jsonb not null
);

create table recipes (
  id          int primary key,
  profession  text not null,
  name_en     text not null,
  skill_req   int not null,
  orange      int, yellow int, green int, grey int,
  yields_item int,
  yields_qty  int not null default 1,
  source      text not null
);

create table recipe_reagents (
  recipe_id int not null references recipes(id) on delete cascade,
  item_id   int not null,
  qty       int not null,
  primary key (recipe_id, item_id)
);

create table watchlist (
  item_id      int primary key,
  target_price bigint not null,
  direction    text not null check (direction in ('below', 'above'))
);

create table alerts_sent (
  id      bigint generated always as identity primary key,
  kind    text not null,
  item_id int,
  payload jsonb,
  sent_at timestamptz not null default now()
);
create index alerts_sent_item_idx on alerts_sent (item_id, sent_at desc);

create table settings (
  key   text primary key,
  value jsonb not null
);

create table ingest_errors (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  house_id int,
  stage    text not null,
  message  text not null
);

insert into settings (key, value) values
  -- La comisión de la casa neutral está SIN CONFIRMAR (15% era el valor de Classic).
  ('ah_cut',  '{"alliance": 0.05, "horde": 0.05, "neutral": null}'),
  ('deposit', '{"deposit_min": 100, "pct": {"2": 0.05, "8": 0.20, "24": 0.60}}'),
  ('deals',   '{"min_sold_per_day": 5, "min_market": 10000}');

-- Último snapshot de cada casa, con el nombre del objeto.
create view latest_item_prices with (security_invoker = true) as
select s.house_id, s.fetched_at, p.item_id, p.min_buyout, p.p15_market, p.median,
       p.qty, p.num_auctions, p.est_sold, i.name_en, i.quality, i.icon_url, i.vendor_sell
from item_prices_hourly p
join snapshots s on s.id = p.snapshot_id
left join items i on i.id = p.item_id
where s.id in (select distinct on (house_id) id from snapshots order by house_id, fetched_at desc);

-- Resumen diario (UTC) a partir de los datos horarios. Idempotente.
create function rollup_daily(p_day date) returns void
language sql
set search_path = public
as $$
  insert into item_prices_daily (house_id, day, item_id, min, avg_market, max, avg_qty, est_sold)
  select s.house_id, p_day, p.item_id,
         min(p.min_buyout), round(avg(p.p15_market)), max(p.p15_market),
         round(avg(p.qty)), sum(p.est_sold)
  from item_prices_hourly p
  join snapshots s on s.id = p.snapshot_id
  where s.fetched_at >= p_day::timestamptz and s.fetched_at < (p_day + 1)::timestamptz
  group by s.house_id, p.item_id
  on conflict (house_id, item_id, day) do update
    set min = excluded.min, avg_market = excluded.avg_market, max = excluded.max,
        avg_qty = excluded.avg_qty, est_sold = excluded.est_sold;
$$;

-- Conservación: los datos horarios se borran a los 7 días (cascade desde snapshots).
create function prune_hourly() returns void
language sql
set search_path = public
as $$
  delete from snapshots s
  where s.fetched_at < now() - interval '7 days'
    and s.id not in (select snapshot_id from house_state);
  delete from ingest_errors where at < now() - interval '30 days';
$$;

-- Solo el servidor (service key) accede a los datos: RLS activado y sin políticas.
alter table houses             enable row level security;
alter table house_probe        enable row level security;
alter table items              enable row level security;
alter table snapshots          enable row level security;
alter table item_prices_hourly enable row level security;
alter table item_prices_daily  enable row level security;
alter table house_state        enable row level security;
alter table recipes            enable row level security;
alter table recipe_reagents    enable row level security;
alter table watchlist          enable row level security;
alter table alerts_sent        enable row level security;
alter table settings           enable row level security;
alter table ingest_errors      enable row level security;
revoke execute on function rollup_daily(date) from public, anon, authenticated;
revoke execute on function prune_hourly() from public, anon, authenticated;

-- Mantenimiento con pg_cron (la ingesta en sí la lanza GitHub Actions o una Edge Function).
create extension if not exists pg_cron;
select cron.schedule('rollup-daily', '20 * * * *',
  $$select rollup_daily((now() at time zone 'utc')::date); select rollup_daily((now() at time zone 'utc')::date - 1);$$);
select cron.schedule('prune-hourly', '40 3 * * *', $$select prune_hourly();$$);
