create view profession_summary with (security_invoker = true) as
select profession_slug as slug, min(profession) as name, count(*)::int as recipes
from recipes
group by profession_slug;
