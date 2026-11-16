-- Recetas sincronizadas desde static-forever: la API no da nivel de habilidad ni colores,
-- así que skill_req pasa a ser opcional. Se añade la categoría y el tramo (skill tier).
alter table recipes alter column skill_req drop not null;
alter table recipes alter column yields_qty type numeric using yields_qty::numeric;
alter table recipes add column category text;
alter table recipes add column tier text;
alter table recipes add column profession_slug text;
update recipes set profession_slug = regexp_replace(lower(profession), '[^a-z0-9]+', '-', 'g');
alter table recipes alter column profession_slug set not null;
create index recipes_profession_idx on recipes (profession_slug);
create index recipe_reagents_item_idx on recipe_reagents (item_id);
