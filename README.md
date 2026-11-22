# Forever AH Analyzer

Web personal para analizar la casa de subastas de **World of Warcraft: Forever** (EU · PvP · Alianza).
La especificación completa está en [CLAUDE.md](CLAUDE.md). Hecho hasta ahora: **Fase 0** (identificar la casa) y **Fase 1** (ingesta + explorador de precios).

## Puesta en marcha

1. **Blizzard**: crea un cliente en <https://develop.battle.net> y copia el client ID y el secret.
2. **Supabase**: crea un proyecto y aplica `supabase/migrations/20261116000000_init.sql` (SQL Editor, o `supabase link` + `supabase db push`).
3. Copia `.env.example` a `.env.local` y rellénalo.
4. Descarga las 15 casas y marca la tuya:

   ```bash
   pnpm discover
   pnpm dev
   ```

   Abre <http://localhost:3000/admin/houses>, compara los precios con los del juego y marca "Alliance · PvP" y "Blackwater · PvP".
5. Primera ingesta (repítela cada hora para tener histórico):

   ```bash
   pnpm ingest
   ```

## Ingesta horaria

`.github/workflows/ingest.yml` ejecuta `pnpm ingest`. Necesita estos secretos en el repo de GitHub:
`BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**El cron de GitHub no basta**: del 16 al 21-11-2026 solo corrió unas 3 veces al día. Por eso `pg_cron` (en Supabase)
lanza el workflow a :35 de cada hora llamando a la API de GitHub. Para activarlo, una sola vez:

1. En GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
   - Repository access: *Only select repositories* → `forever-ah-analyzer`.
   - Permissions → Repository → **Actions: Read and write**. Nada más.
   - Caducidad: la que quieras (cuando caduque, repite estos pasos).
2. En Supabase → SQL Editor, ejecuta (pegando tu token):

   ```sql
   select vault.create_secret('github_pat_...', 'github_dispatch_token');
   ```

   Para cambiarlo más adelante: `select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), 'nuevo_token');`

Sin ese token `trigger_ingest()` no hace nada y solo queda el cron de GitHub. La portada avisa si la última ingesta
tiene más de 2 h y media.

El resumen diario, el borrado de datos horarios de más de 7 días y de diarios de más de 180 los hace `pg_cron`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Web en local |
| `pnpm discover` | Fase 0: descarga todas las casas y sus precios de referencia |
| `pnpm ingest` | Ingesta de las casas marcadas |
| `pnpm sync-recipes` | Descarga todas las recetas de todas las profesiones (una vez, y tras cada parche) |
| `pnpm sync-skills` | Nivel de cada receta para el planificador: oficial (planos, patrones) o estimado (después de `sync-recipes`) |
| `pnpm test` | Tests (Vitest) |
| `pnpm typecheck` / `pnpm lint` | Comprobaciones |

## Pendiente de confirmar

- La comisión de la casa neutral (Blackwater): `settings.ah_cut.neutral` está a `null`.
- La API de recetas no da el nivel de habilidad ni los colores de skill-up. El planificador usa el nivel oficial de los objetos que enseñan recetas (651 recetas), los de Classic para fundiciones y vendas, y una estimación por nivel de objeto para el resto (±25). Los colores salen de `settings.skillup_colors`. Se corrigen desde la web, en cada receta → Nivel → corregir.
- Si `buyout` en las subastas de objetos es el precio del lote entero (se ha supuesto que sí, como en Classic).
- La lista de materiales que vende un vendedor (`items.vendor_sold`, en la migración `20261121000000_ingest_v2.sql`) está hecha a mano con lo de Classic. Si algo no se vende en Forever, pon `vendor_sold = false`.

## Cómo se calcula (resumen)

- **Mercado** de un snapshot: media del 15% de unidades más baratas, sin listados de más de 100× la mediana.
- **Mercado del día** y **de 7 días**: medianas, para que un reinicio de mercado (alguien compra todo y lo republica caro) no las dispare.
- **Ventas estimadas**: subastas que desaparecen y no pudieron caducar según su `time_left` y el tiempo entre snapshots (con 8 h de hueco solo cuentan las `VERY_LONG`), más las unidades que bajan en los commodities. Se escalan a ventas/día. Las cancelaciones cuentan como ventas: la API no las distingue.
- **Coste de una receta**: cada material al más barato entre subasta, vendedor y fabricarlo con tus profesiones (`settings.my_professions`), en cadena (mineral → barra → objeto).
- **Precio de venta**: el menor entre el mínimo actual y la mediana de 7 días, menos la comisión.
- **Planificador de subida** (`/professions/<profesión>/plan`): programación dinámica por tramos sobre las recetas con nivel y precio. Coste por punto = (materiales − lo que recuperas) / probabilidad de subir (naranja 100%, amarillo 75%, verde 25%), más los planos una vez. Por defecto solo cuenta lo que paga el vendedor; vender en la subasta es opcional (optimista). Compara con el coste usando las medianas de 7 días: ≤85% es buen momento.

## Medido con datos reales

- Una casa trae ~270.000–320.000 subastas y unos 7.000 objetos distintos.
- La ingesta usa ~150–200 MB y tarda ~40 s (más la primera vez que tiene que buscar nombres e iconos): no cabe en una Edge Function, así que corre en GitHub Actions.
- Blizzard publica el snapshot entre :19 y :24.
- `static-forever` da 404 en ~43% de los objetos; `static-classic1x` tiene casi todos (97% de lo que hay en venta con nombre).
