-- Planificador de profesiones: nivel de cada receta.
-- La API solo da el nivel oficial de las recetas que se aprenden con un objeto (planos, patrones...).
-- Para el resto se estima a partir del nivel del objeto fabricado. Los colores no los da nunca:
-- se calculan con desplazamientos configurables, salvo que el usuario los corrija a mano.

alter table recipes add column skill_source text check (skill_source in ('item', 'estimate', 'manual'));
alter table recipes add column learned_from_item int;      -- objeto que enseña la receta (planos...), si se conoce
comment on column recipes.skill_req is 'Nivel de profesión necesario (naranja desde aquí)';
comment on column recipes.orange is 'Corrección manual; si es null se usa skill_req';
comment on column recipes.yellow is 'Corrección manual; si es null, skill_req + settings.skillup_colors.yellow';
comment on column recipes.green is 'Corrección manual; si es null, skill_req + settings.skillup_colors.green';
comment on column recipes.grey is 'Corrección manual; si es null, skill_req + settings.skillup_colors.grey';

alter table items add column item_level int;
alter table items add column required_level int;
-- Para objetos que enseñan recetas: profesión y nivel que piden, y qué objeto fabrica la receta.
alter table items add column teaches_profession_id int;
alter table items add column teaches_skill int;
alter table items add column teaches_item int;

insert into settings (key, value) values
  -- Puntos por encima del nivel de la receta en los que cambia de color (regla habitual de Classic).
  ('skillup_colors', '{"yellow": 25, "green": 37, "grey": 50}'),
  -- Probabilidad de subir un punto por color (CLAUDE.md, Fase 4).
  ('skillup_chance', '{"orange": 1, "yellow": 0.75, "green": 0.25, "grey": 0}')
on conflict (key) do nothing;

-- 'classic': nivel conocido de Classic para recetas básicas (fundiciones y vendas) que la API no da.
alter table recipes drop constraint recipes_skill_source_check;
alter table recipes add constraint recipes_skill_source_check check (skill_source in ('item', 'classic', 'estimate', 'manual'));
