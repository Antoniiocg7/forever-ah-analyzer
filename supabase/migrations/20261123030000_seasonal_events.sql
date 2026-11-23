-- Calendario de eventos de temporada (festividades, Feria de la Luna Negra) y los objetos que piden.
-- Fechas: wowcalc.net/en/forever/wiki/calendar y foreverdb.net (consultados el 23-11-2026); hora del reino
-- sin publicar, así que son aproximadas. Objetos: IDs comprobados en nuestra tabla items; las misiones
-- vienen de Classic y están SIN CONFIRMAR en Forever (confirmed = false) hasta verlas en el juego.

create table seasonal_events (
  id     int generated always as identity primary key,
  slug   text not null unique,
  name   text not null,
  kind   text not null default 'holiday' check (kind in ('holiday', 'faire', 'other')),
  notes  text,
  source text
);

create table seasonal_event_dates (
  id       int generated always as identity primary key,
  event_id int not null references seasonal_events(id) on delete cascade,
  starts   date not null,
  ends     date not null,
  place    text,
  check (ends >= starts),
  unique (event_id, starts)
);

create table seasonal_event_items (
  event_id  int not null references seasonal_events(id) on delete cascade,
  item_id   int not null,
  qty       int,            -- unidades que pide la misión (null = sin confirmar)
  note      text,
  confirmed boolean not null default false,
  primary key (event_id, item_id)
);

alter table seasonal_events enable row level security;
alter table seasonal_event_dates enable row level security;
alter table seasonal_event_items enable row level security;

insert into seasonal_events (slug, name, kind, notes, source) values
  ('winter-veil', 'Feast of Winter Veil (Navidad)', 'holiday', 'Recetas de cocina y misiones navideñas.', 'https://wowcalc.net/en/forever/wiki/calendar'),
  ('darkmoon-faire', 'Feria de la Luna Negra', 'faire', 'Cada mes, de lunes a lunes, alternando Elwynn y Mulgore. Entregas de objetos a cambio de tickets.', 'https://foreverdb.net/events/darkmoon-faire'),
  ('lunar-festival', 'Lunar Festival', 'holiday', null, 'https://wowcalc.net/en/forever/wiki/calendar'),
  ('love-is-in-the-air', 'Love is in the Air', 'holiday', null, 'https://wowcalc.net/en/forever/wiki/calendar'),
  ('noblegarden', 'Noblegarden', 'holiday', 'Solo se conoce el día de inicio.', 'https://wowcalc.net/en/forever/wiki/calendar'),
  ('midsummer', 'Midsummer Fire Festival', 'holiday', null, 'https://wowcalc.net/en/forever/wiki/calendar'),
  ('harvest-festival', 'Harvest Festival', 'holiday', null, 'https://wowcalc.net/en/forever/wiki/calendar'),
  ('hallows-end', 'Hallow''s End', 'holiday', null, 'https://wowcalc.net/en/forever/wiki/calendar');

insert into seasonal_event_dates (event_id, starts, ends, place)
select e.id, d.starts::date, d.ends::date, d.place
from (values
  ('winter-veil', '2026-12-15', '2027-01-02', null),
  ('darkmoon-faire', '2026-12-07', '2026-12-14', 'Mulgore'),
  ('darkmoon-faire', '2027-01-04', '2027-01-11', 'Elwynn Forest'),
  ('darkmoon-faire', '2027-02-08', '2027-02-14', 'Mulgore'),
  ('lunar-festival', '2027-02-02', '2027-02-16', null),
  ('love-is-in-the-air', '2027-02-11', '2027-02-16', null),
  ('noblegarden', '2027-03-29', '2027-03-29', null),
  ('midsummer', '2027-06-21', '2027-07-05', null),
  ('harvest-festival', '2027-09-11', '2027-09-18', null),
  ('hallows-end', '2027-10-18', '2027-11-02', null)
) as d(slug, starts, ends, place)
join seasonal_events e on e.slug = d.slug;

insert into seasonal_event_items (event_id, item_id, note)
select e.id, i.item_id, i.note
from (values
  ('winter-veil', 6889, 'Cocina de Winter Veil (galletas de jengibre, ponche de huevo)'),
  ('darkmoon-faire', 5134, 'Entrega por tickets'),
  ('darkmoon-faire', 11407, 'Entrega por tickets'),
  ('darkmoon-faire', 4582, 'Entrega por tickets'),
  ('darkmoon-faire', 5117, 'Entrega por tickets'),
  ('darkmoon-faire', 11404, 'Entrega por tickets'),
  ('darkmoon-faire', 19933, 'Entrega por tickets'),
  ('darkmoon-faire', 4363, 'Entrega de Ingeniería'),
  ('darkmoon-faire', 4375, 'Entrega de Ingeniería'),
  ('darkmoon-faire', 11590, 'Entrega de Ingeniería'),
  ('darkmoon-faire', 15994, 'Entrega de Ingeniería'),
  ('darkmoon-faire', 2309, 'Entrega de Peletería'),
  ('darkmoon-faire', 2314, 'Entrega de Peletería'),
  ('darkmoon-faire', 5739, 'Entrega de Peletería'),
  ('darkmoon-faire', 8185, 'Entrega de Peletería')
) as i(slug, item_id, note)
join seasonal_events e on e.slug = i.slug;
