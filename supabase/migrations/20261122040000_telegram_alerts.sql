-- Fase 5: alertas por Telegram.
alter table watchlist add column created_at timestamptz not null default now();
alter table watchlist add column note text;

-- Clave de antispam: "deal:2770", "watch:2770", "leveling:blacksmithing", "digest:2026-11-22"…
alter table alerts_sent add column key text;
create index alerts_sent_key_idx on alerts_sent (key, sent_at desc);

-- min_deal_profit en cobre (5g); daily_hour en hora de Polonia; lang: idioma de los nombres en los mensajes.
-- leveling: [{"slug": "blacksmithing", "from": 150, "to": 225}] → avisa si es buen momento para subirla.
-- El chat de Telegram se guarda en settings.telegram_chat_id con `pnpm telegram-setup`.
insert into settings (key, value) values
  ('alerts', '{"enabled": true, "min_deal_profit": 50000, "max_per_run": 5, "daily_hour": 9, "lang": "en", "leveling": []}')
on conflict (key) do nothing;
