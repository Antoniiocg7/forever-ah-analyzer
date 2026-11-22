-- Categorías de receta y tipos de objeto en español.
alter table recipes add column category_es text;

-- Traducción de clases y subclases de objeto ("Trade Goods" → "Objetos comerciables"), de /data/wow/item-class.
create table item_class_names (
  en text primary key,
  es text not null
);
alter table item_class_names enable row level security;
