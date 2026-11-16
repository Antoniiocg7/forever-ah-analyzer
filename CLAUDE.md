# Forever AH Analyzer — especificación para Claude Code

> Pon este archivo como `CLAUDE.md` en la raíz de un repo vacío y abre Claude Code ahí.
> Primer mensaje sugerido (al final del archivo, sección "Cómo arrancar").

## 1. Objetivo

Web personal (usable desde el móvil) que analiza la casa de subastas de **World of Warcraft: Forever** para un jugador de **EU · ruleset PvP · Alianza** y le dice:

1. **Gangas** para comprar ahora (y revender o usar).
2. **Oportunidades de reventa** entre la casa de Alianza y la casa neutral (Blackwater).
3. **Qué hacer con sus materiales** (Minería, Herrería, First Aid): vender en bruto, transformar o fabricar.
4. **Cuándo le sale más barato subir una profesión**: coste actual de la ruta frente a su media histórica.

Sin automatizar el cliente del juego en ningún caso: las compras se hacen a mano en el juego.

## 2. Contexto técnico confirmado (noviembre 2026)

La API de Blizzard para Forever **no está documentada oficialmente**. Lo siguiente lo ha probado la comunidad (foro de API de Blizzard, 6 de noviembre de 2026) y puede cambiar:

- OAuth client credentials: `POST https://oauth.battle.net/token` (`grant_type=client_credentials`). Credenciales en https://develop.battle.net.
- Host: `https://eu.api.blizzard.com`
- Namespace dinámico: `dynamic-forever-eu`. Estático: `static-forever-eu`.
- Rulesets: `/data/wow/ruleset/index` y `/data/wow/ruleset/{id}`.
- Índice de casas (**la barra final es obligatoria**): `/data/wow/ruleset/{id}/auctions/`
- Casa: `/data/wow/ruleset/{id}/auctions/{houseId}` → `{ id, name, auctions, commodities, ruleset }`
- Commodities: `/data/wow/ruleset/{id}/auctions/{houseId}/commodities` → `{ auctions: [{ id, item, quantity, unit_price, time_left }] }`
- IDs de casa: 110–121 y 123–125, cinco por facción: "Alliance Auction House", "Horde Auction House" y "Blackwater Auction House".

Problemas conocidos (hay que gestionarlos):
- **Todos los rulesets devuelven las mismas casas.** El ID de ruleset no filtra nada. No sabemos qué casa es la de PvP: hay que **averiguarlo** (ver Fase 0).
- Algunas casas (112, 115, 118) no tienen el campo `auctions`, así que trátalo como opcional.
- Las respuestas pesan hasta unos 9 MB (50–68k subastas). Hay subastas solo con puja, sin precio de compra directa.
- Alrededor del 43% de los IDs de objeto devuelven 404 en `static-forever`. Hace falta otra forma de sacar nombres e iconos (ver 5.3).
- Los datos se actualizan **una vez por hora**. La API **no da ventas**: hay que estimarlas por diferencia entre snapshots.
- Límites de la API: comprueba los vigentes en develop.battle.net y respétalos con backoff.

## 3. Stack

- **Supabase** (Postgres + Edge Functions + pg_cron) para guardar datos y hacer la ingesta.
- **Next.js (App Router) + TypeScript + Tailwind** en **Vercel** para el frontend.
- Gráficas: Recharts o similar, ligeras y legibles en el móvil.
- Alertas: **bot de Telegram** (lo más sencillo para recibir notificaciones push en el móvil). Web Push opcional después.
- Nombres de objetos, profesiones y recetas **en inglés** (el juego del usuario está en inglés). La interfaz de la web, en español.
- Desarrollo en macOS (Apple Silicon).

Si la Edge Function no puede procesar 9 MB dentro de sus límites de memoria o tiempo, mueve la ingesta a **GitHub Actions** (cron horario, script Node) escribiendo en Supabase con la service key. Decide tras medir, no antes.

## 4. Modelo de datos (orientativo)

Prioridad: **no guardar subastas en bruto**. Agrega por objeto en cada snapshot. Solo se siguen las casas útiles para el usuario: Alianza PvP y Blackwater PvP (Horde opcional, desactivado por defecto).

```
houses(id, region, faction, ruleset_guess, label, tracked bool)
items(id, name_en, quality, icon_url, vendor_sell, vendor_buy, class, subclass, source)
snapshots(id, house_id, fetched_at, last_modified_header, auction_count)
item_prices_hourly(snapshot_id, item_id, min_buyout, p15_market, median, qty, num_auctions)
item_prices_daily(house_id, day, item_id, min, avg_market, max, avg_qty, est_sold)
recipes(id, profession, name_en, skill_req, orange, yellow, green, grey, yields_item, yields_qty, source)
recipe_reagents(recipe_id, item_id, qty)
watchlist(item_id, target_price, direction)
alerts_sent(id, kind, item_id, payload, sent_at)
settings(key, value)   -- p. ej. comisión de la subasta por casa, umbrales
```

- `p15_market` = media del 15% de unidades más baratas (el mismo criterio que usan las webs de precios).
- Conservación: datos horarios **7 días**, después solo el resumen diario. Vigila el límite de 500 MB del plan gratis.
- Estimación de ventas: unidades que desaparecen entre snapshots sin haber caducado (usa `time_left`). Márcalo siempre como **estimación**.

## 5. Funcionalidades por fases

### Fase 0: identificar la casa correcta
- Script/página `/admin/houses` que descarga las 15 casas y muestra para cada una: facción, número de subastas y el precio mínimo de 10 materiales comunes (Copper Ore, Copper Bar, Tin Ore, Silverleaf, Peacebloom, Linen Cloth, Light Leather, Rough Stone, Iron Ore, Wool Cloth).
- El usuario compara con lo que ve en el juego y marca a mano cuál es "Alliance · PvP" y cuál "Blackwater · PvP". Se guarda en `houses.label`.
- Alternativa más rápida: el usuario pega un export de Auctionator con unos cuantos precios y el script elige la casa que más se parece.

### Fase 1: ingesta + explorador de precios (MVP)
- Cron cada hora (unos minutos después de la publicación). Usa `Last-Modified` / `If-Modified-Since` para no procesar dos veces lo mismo.
- Página de búsqueda de objetos: precio mínimo, precio de mercado, cantidad en venta, gráfica de 7 y 30 días y ventas por día estimadas.
- Ignora los precios absurdos: listados de más de 100× la mediana o el precio de vendedor no cuentan para las medias.

### Fase 2: gangas
`deal_score` por objeto en cada snapshot:
- `discount = 1 − min_buyout / avg_market_7d`
- Solo si `est_sold_per_day ≥ umbral` (por defecto 5) y `avg_market_7d ≥ X` (por defecto 1g). Así se evitan los objetos que no se venden.
- **Profit real** si compras y revendes: `avg_market_7d × (1 − ah_cut) − min_buyout − deposito × riesgo_no_venta`. `ah_cut` sale de `settings` (5% en las casas de facción; la neutral **hay que confirmarla en el juego**, en Classic era del 15%).
- **Depósito (fees de publicación), configurable en `settings` porque Blizzard lo está cambiando:**
  - Depósito = % del precio de vendedor según la duración: **2 h → 5%**, **8 h → 20%**, **24 h → 60%**, con un **mínimo** por publicación.
  - Mínimo actual: **1 plata** (`deposit_min = 100` copper). Blizzard ha anunciado que en el próximo mantenimiento semanal baja a **1 cobre** (`deposit_min = 1`).
  - Fórmula: `deposito = max(deposit_min, vendor_sell × pct[duracion] × cantidad)`. Guarda `deposit_min` y `pct` como JSON en `settings` para cambiarlos sin tocar código.
  - **El depósito se devuelve si el objeto se vende** y se pierde si caduca o cancelas. Por eso en el beneficio solo cuenta `deposito × prob_no_venta` (estimada a partir de `est_sold` frente al stock en venta).
  - Comisión de venta: **5%** del precio final (confirmado para las casas de facción; para Blackwater, confírmalo con el usuario).
  - **Recomendador de duración:** para cada objeto, sugiere 2/8/24 h comparando el depósito con la velocidad de venta estimada. Con el sistema nuevo, publicar materiales baratos a 2 h es casi gratis, pero los objetos con precio de vendedor alto (equipo de Herrería) penalizan mucho a 24 h.
  - Mientras el mínimo sea de 1 plata, avisa de que publicar materiales muy baratos en montones pequeños sale caro y sugiere montones más grandes. Esta regla deja de tener sentido cuando `deposit_min = 1`.
- **Gangas de vendedor:** subastas con precio por debajo de lo que paga el vendedor. Beneficio garantizado.
- Muestra cuántas unidades puedes comprar antes de que el precio deje de ser rentable ("profundidad de la ganga").

### Fase 3: reventa entre Alianza y Blackwater
- Para cada objeto: `spread = mercado_B × (1 − cut_B) − min_A` y al revés.
- Requisitos: volumen en las dos casas y spread mínimo configurable.
- Ten en cuenta que las casas neutrales suelen ir más lentas y tener comisiones más altas.

### Fase 4: profesiones (Mining, Blacksmithing, First Aid; Engineering opcional)
- **Fuente de recetas:** prueba primero `static-forever` (`/data/wow/profession/index`, `/data/wow/profession/{id}/skill-tier/{id}`, `/data/wow/recipe/{id}`). Si faltan datos, usa un `seed/recipes/*.json` mantenido a mano para esas profesiones, con colores de skill-up. **No copies datos de webs de terceros** sin comprobar su licencia; si hace falta, pide al usuario que los revise.
- **Vender o transformar:** para cada cadena (Ore → Bar → objeto fabricado), compara el valor neto en cada paso. Ejemplo: `Copper Ore ×1` frente a `Copper Bar` frente a `Copper Chain Belt` (vendido en la subasta o a un vendedor).
- **Coste por skill-up:** `coste_reagentes − valor_reventa_producto × prob_venta` dividido entre los skill-ups esperados (naranja = 1, amarillo ≈ 0,75, verde ≈ 0,25, configurable).
- **Ruta más barata** desde la skill actual hasta la objetivo, con programación dinámica sobre las recetas disponibles y teniendo en cuenta lo que el usuario ya tiene (inventario introducido a mano o importado, ver Fase 6).
- **"Buen momento para subir":** coste de la ruta ahora frente a la mediana de 14 días. Si está ≥15% por debajo, alerta.
- Precio de los materiales que ya tienes: coste de oportunidad, es decir, lo que sacarías vendiéndolos, no 0.

### Fase 5: alertas y seguimiento
- Bot de Telegram: gangas por encima del umbral, objetos de la watchlist que cruzan el precio objetivo y "buen momento para subir X".
- Antispam: máximo una alerta por objeto cada 6 h y resumen diario a una hora configurable.
- **Mejor momento para vender:** heatmap por día de la semana y hora (en hora de Polonia) del precio de mercado y del stock en venta de cada objeto, para saber cuándo publicar.

### Fase 6 (opcional): addon complementario
Solo si lo anterior ya funciona. Un addon de WoW **no puede conectarse a internet**, así que el flujo es por archivos:
- **Addon → web:** el addon guarda en `SavedVariables` el inventario (bolsas y banco), tus subastas activas y lo que has vendido (eventos del correo). Un pequeño script en el Mac (o subir el archivo a mano en la web) lo manda a Supabase. Así tienes ventas **reales** en vez de estimadas, coste medio de tu stock y beneficio por operación.
- **Web → addon:** la web genera un `ForeverAH_Data.lua` con precios de mercado y gangas, y el usuario lo copia en la carpeta del addon. El addon lo muestra en los tooltips y en una lista de compra (que el jugador compra **a mano**).
- Interfaz de Forever: cliente Mainline con API 12.x (`C_AuctionHouse`). Comprueba el número de `## Interface:` actual en el juego (`/dump select(4, GetBuildInfo())`).
- Ruta de AddOns en macOS: `/Applications/World of Warcraft/_forever_/Interface/AddOns/` (comprueba el nombre exacto de la carpeta).

## 6. Mejoras futuras (backlog)

- Libro de cuentas: oro por día, beneficio por objeto, ROI de cada reventa (necesita la Fase 6).
- Valor de farmeo: oro/hora estimado por ruta de minería según el precio actual del mineral y de las gemas que salen al minar.
- Detección de "muros" (alguien publica muchas unidades a un precio fijo) y de reinicios de mercado (alguien compra todo y vuelve a publicarlo más caro).
- Predicción simple (media móvil y estacionalidad) para materiales de raid antes de los reinicios de banda o de contenido nuevo.
- Lista de deseos de equipo para el paladín con el precio histórico de cada pieza.
- Exportar la lista de compra en formato de búsqueda de Auctionator.

## 7. Reglas para Claude Code

- TypeScript estricto. Variables de entorno en `.env.local` y en los secretos de Supabase/Vercel; **nunca** subas al repo ni el client secret de Blizzard ni la service key de Supabase.
- Cumple los **Blizzard Developer API Terms**: solo la API oficial, nada de scraping de webs de Blizzard ni automatizar el cliente del juego, y la app no se monetiza.
- Trata la API como inestable: valida las respuestas con Zod, guarda los errores y nunca rompas el cron por un campo que falte.
- Tests (Vitest) para: agregación de precios, `deal_score`, estimación de ventas y el algoritmo de ruta de profesiones.
- Interfaz pensada primero para móvil y en modo oscuro.
- Antes de cada fase, propón un plan corto. Al terminarla, haz un commit con un mensaje claro.
- Si un dato no se puede confirmar (comisión de Blackwater, ruleset de una casa, recetas), **pregunta** en lugar de inventar.

## 8. Cómo arrancar

Primer mensaje para Claude Code:

> Lee CLAUDE.md. Empieza por la Fase 0 y la Fase 1: crea el proyecto Next.js + Supabase y la función de ingesta horaria. Prepara también la página /admin/houses para identificar la casa Alliance PvP y la Blackwater PvP de EU. Antes de escribir código, dime qué variables de entorno y credenciales tengo que preparar (Blizzard client ID/secret, proyecto de Supabase) y propón el esquema SQL.

Después, una fase cada vez: "Implementa la Fase 2 según CLAUDE.md", etc.
