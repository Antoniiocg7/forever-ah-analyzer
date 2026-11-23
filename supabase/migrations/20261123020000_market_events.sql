-- Resets de otros jugadores (src/lib/pricing/market-events.ts) y si aguantaron.
create table market_events (
  id           bigint generated always as identity primary key,
  house_id     int not null references houses(id),
  item_id      int not null,
  kind         text not null default 'reset' check (kind in ('reset')),
  snapshot_id  bigint references snapshots(id) on delete set null,
  detected_at  timestamptz not null default now(),
  prev_min     bigint not null,
  new_min      bigint not null,
  market       bigint not null,
  units        int not null,
  cost         bigint not null,
  status       text not null default 'open' check (status in ('open', 'held', 'failed')),
  resolved_at  timestamptz,
  -- Mínimo más alto visto mientras estaba abierto (hasta dónde llegó).
  peak_min     bigint
);
create index market_events_house_status on market_events (house_id, status);
create index market_events_item on market_events (house_id, item_id, detected_at desc);
alter table market_events enable row level security;
