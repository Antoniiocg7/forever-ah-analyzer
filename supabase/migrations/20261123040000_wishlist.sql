-- Lista de deseos (equipo del paladín): qué piezas quieres, para qué ranura, hasta cuánto pagarías
-- y si ya la tienes. Se rellena a mano (no se copian listas de BiS de terceros).
create table wishlist (
  item_id    int primary key,
  slot       text,          -- clave de ranura (src/lib/wishlist.ts, SLOTS)
  priority   int not null default 2 check (priority between 1 and 3),  -- 1 alta, 2 media, 3 baja
  max_price  bigint,        -- en cobre; null = sin límite
  note       text,
  obtained   boolean not null default false,
  created_at timestamptz not null default now()
);
alter table wishlist enable row level security;
