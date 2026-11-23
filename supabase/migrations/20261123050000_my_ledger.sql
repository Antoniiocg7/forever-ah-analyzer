-- Fase 6: datos reales del jugador, leídos del archivo de datos guardados del addon AHledger
-- (WTF/Account/<cuenta>/SavedVariables/AHledger.lua) con `pnpm addon-sync` o subiéndolo en la web.
-- Son datos personales: la web solo los enseña con la contraseña de administración.

create table my_characters (
  key        text primary key,   -- "Nombre-Reino"
  name       text not null,
  realm      text,
  faction    text,
  money      bigint,             -- cobre en la bolsa
  bags_at    timestamptz,
  bank_at    timestamptz,        -- null: nunca se ha abierto el banco
  updated_at timestamptz not null default now()
);

create table my_inventory (
  char_key text not null references my_characters(key) on delete cascade,
  item_id  int not null,
  place    text not null check (place in ('bags', 'bank')),
  qty      int not null,
  bound    boolean not null default false,
  primary key (char_key, item_id, place)
);

-- Operaciones de la subasta: publicar, vender, comprar, caducar, cancelar.
create table my_ledger (
  seq     int primary key,       -- número de secuencia de AHledger (único por cuenta)
  at      timestamptz not null,
  kind    text not null check (kind in ('post', 'sale', 'buy', 'expire', 'cancel')),
  item_id int,
  name    text,
  qty     int not null default 1,
  price   bigint not null default 0,  -- venta: bruto; compra: pagado; publicación: unidad × cantidad
  cut     bigint not null default 0,  -- comisión de la subasta
  deposit bigint not null default 0,
  hours   int                          -- duración de la publicación
);
create index my_ledger_at on my_ledger (at desc);
create index my_ledger_item on my_ledger (item_id);

alter table my_characters enable row level security;
alter table my_inventory enable row level security;
alter table my_ledger enable row level security;
